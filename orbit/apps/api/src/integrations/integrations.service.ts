import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  EnrichmentStatus,
  PaymentType,
  Prisma,
  RequestType,
  SubmissionSource,
  SubmissionStatus,
} from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import {
  STORAGE_SERVICE,
  StorageService,
} from '../files/storage/storage.interface';
import { NotificationEvents } from '../notifications/notification-events';
import { PrismaService } from '../prisma/prisma.service';
import {
  serializeSubmission,
  SUBMISSION_INCLUDE,
} from '../submissions/submissions.serializer';
import { AttachExtractionDto } from './dto/attach-extraction.dto';
import { ExtractionPayloadDto } from './dto/extraction-payload.dto';
import { IngestSubmissionDto } from './dto/ingest-submission.dto';
import { LogMessageDto, MarkMessageDto } from './dto/log-message.dto';

const WORKFLOW_BOT_EMAIL = 'workflow-bot@orbit.irbas.com';

/** Map the workflow's classification string to Orbit's RequestType. */
function classificationToRequestType(classification: string): RequestType {
  switch (classification?.toLowerCase()) {
    case 'payment_proof':
    case 'deposit':
      return RequestType.DEPOSIT;
    case 'expense_proof':
    case 'expense':
      return RequestType.EXPENSE;
    case 'salary_disbursement':
      return RequestType.SALARY_DISBURSEMENT;
    case 'vendor_payment':
      return RequestType.VENDOR_PAYMENT;
    default:
      return RequestType.OTHER;
  }
}

/** Map the extracted payment method string to Orbit's PaymentType. */
function methodToPaymentType(method?: string): PaymentType {
  switch (method?.toLowerCase()) {
    case 'bank_transfer':
      return PaymentType.BANK_TRANSFER;
    case 'cash_deposit':
      return PaymentType.CASH_DEPOSIT;
    case 'cheque':
      return PaymentType.CHEQUE;
    default:
      return PaymentType.OTHER;
  }
}

function decimalOrNull(v?: string | null): Prisma.Decimal | null {
  return v === undefined || v === null || v === '' ? null : new Prisma.Decimal(v);
}

@Injectable()
export class IntegrationsService {
  private cachedBotUserId?: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly config: ConfigService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  // --- raw message log ------------------------------------------------------

  async logMessage(dto: LogMessageDto): Promise<{ id: string }> {
    const msg = await this.prisma.workflowMessage.create({
      data: {
        source: dto.source,
        senderRef: dto.senderRef ?? null,
        channelId: dto.channelId ?? null,
        messageText: dto.messageText ?? null,
        mediaUrl: dto.mediaUrl ?? null,
        mediaMime: dto.mediaMime ?? null,
        rawPayload: (dto.rawPayload ?? {}) as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return { id: msg.id };
  }

  async markMessage(id: string, dto: MarkMessageDto) {
    const existing = await this.prisma.workflowMessage.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Message not found');
    await this.prisma.workflowMessage.update({
      where: { id },
      data: {
        ...(dto.classification !== undefined
          ? { classification: dto.classification }
          : {}),
        processingStatus: dto.processingStatus ?? 'processed',
      },
    });
    return { ok: true };
  }

  // --- create a workflow-originated submission ------------------------------

  async ingestSubmission(dto: IngestSubmissionDto) {
    if (dto.source === SubmissionSource.APP) {
      throw new BadRequestException(
        'source APP is not valid for workflow ingestion',
      );
    }

    const ro = await this.resolveRo(dto);
    const botUserId = await this.resolveBotUserId();

    const requestType =
      dto.requestType ?? classificationToRequestType(dto.extraction.classification);
    const paymentType =
      dto.paymentType ?? methodToPaymentType(dto.extraction.extractedPaymentMethod);

    // Prefer an explicit amount; otherwise fall back to the extracted amount.
    const amount =
      decimalOrNull(dto.amount) ?? decimalOrNull(dto.extraction.extractedAmount);

    const paymentDate = dto.paymentDate ? new Date(dto.paymentDate) : new Date();

    const id = uuidv4();

    const submission = await this.prisma.$transaction(async (tx) => {
      const created = await tx.paymentSubmission.create({
        data: {
          id,
          roId: ro.id,
          submittedById: botUserId,
          source: dto.source,
          senderRef: dto.senderRef ?? null,
          requestType,
          paymentType,
          amount,
          paymentDate,
          bankName: dto.bankName ?? null,
          referenceNumber:
            dto.referenceNumber ?? dto.extraction.slipRef ?? null,
          notes: dto.messageText ?? null,
          status: SubmissionStatus.SUBMITTED,
          enrichmentStatus: EnrichmentStatus.ENRICHED,
          version: 1,
        },
        include: SUBMISSION_INCLUDE,
      });

      await tx.submissionStatusHistory.create({
        data: {
          submissionId: id,
          fromStatus: null,
          toStatus: SubmissionStatus.SUBMITTED,
          changedById: botUserId,
        },
      });

      await tx.submissionExtraction.create({
        data: this.extractionData(id, dto.extraction),
      });

      if (dto.workflowMessageId) {
        await tx.workflowMessage.update({
          where: { id: dto.workflowMessageId },
          data: {
            submissionId: id,
            classification: dto.extraction.classification,
            processingStatus: 'processed',
          },
        });
      }

      // Re-read with the extraction included for serialization.
      return tx.paymentSubmission.findUnique({
        where: { id },
        include: SUBMISSION_INCLUDE,
      });
    });

    // Notify admins (same event the app uses). The dispatch listener ignores
    // non-APP submissions, so this does not loop back to n8n.
    this.events.emit(NotificationEvents.SUBMISSION_CREATED, {
      submission,
      roName: ro.name,
    });

    return serializeSubmission(submission, this.storage);
  }

  // --- enrichment callback for app-originated submissions -------------------

  async attachExtraction(submissionId: string, dto: AttachExtractionDto) {
    const submission = await this.prisma.paymentSubmission.findUnique({
      where: { id: submissionId },
      select: { id: true },
    });
    if (!submission) throw new NotFoundException('Submission not found');

    if (dto.failed || !dto.extraction) {
      await this.prisma.paymentSubmission.update({
        where: { id: submissionId },
        data: { enrichmentStatus: EnrichmentStatus.FAILED },
      });
      return { ok: true, enrichmentStatus: EnrichmentStatus.FAILED };
    }

    const data = this.extractionData(submissionId, dto.extraction);
    await this.prisma.$transaction([
      this.prisma.submissionExtraction.upsert({
        where: { submissionId },
        create: data,
        update: data,
      }),
      this.prisma.paymentSubmission.update({
        where: { id: submissionId },
        data: { enrichmentStatus: EnrichmentStatus.ENRICHED },
      }),
    ]);

    return { ok: true, enrichmentStatus: EnrichmentStatus.ENRICHED };
  }

  // --- attachment streaming target (for n8n vision) -------------------------

  async getAttachment(submissionId: string) {
    const submission = await this.prisma.paymentSubmission.findUnique({
      where: { id: submissionId },
      select: { attachmentPath: true, attachmentMimeType: true },
    });
    if (!submission?.attachmentPath) {
      throw new NotFoundException('Attachment not found');
    }
    return {
      absPath: this.storage.resolve(submission.attachmentPath),
      mimeType: submission.attachmentMimeType ?? 'application/octet-stream',
    };
  }

  // --- helpers --------------------------------------------------------------

  private extractionData(
    submissionId: string,
    e: ExtractionPayloadDto,
  ): Prisma.SubmissionExtractionUncheckedCreateInput {
    return {
      submissionId,
      classification: e.classification,
      extractedAmount: decimalOrNull(e.extractedAmount),
      extractedPaymentMethod: e.extractedPaymentMethod ?? null,
      slipRef: e.slipRef ?? null,
      merchant: e.merchant ?? null,
      description: e.description ?? null,
      bankEmailMatch: e.bankEmailMatch ?? false,
      bankEmailAmount: decimalOrNull(e.bankEmailAmount),
      bankEmailTimestamp: e.bankEmailTimestamp
        ? new Date(e.bankEmailTimestamp)
        : null,
      confidence: e.confidence ?? null,
      model: e.model ?? null,
      rawResponse: (e.rawResponse ?? {}) as Prisma.InputJsonValue,
    };
  }

  private async resolveRo(dto: IngestSubmissionDto) {
    if (dto.roId) {
      const ro = await this.prisma.regionalOffice.findUnique({
        where: { id: dto.roId },
        select: { id: true, name: true, isActive: true },
      });
      if (!ro) throw new BadRequestException('Unknown roId');
      return ro;
    }
    if (dto.channelId) {
      const ro = await this.prisma.regionalOffice.findFirst({
        where: {
          OR: [
            { whatsappGroupId: dto.channelId },
            { slackChannelId: dto.channelId },
          ],
        },
        select: { id: true, name: true, isActive: true },
      });
      if (!ro) {
        throw new BadRequestException(
          `No regional office mapped to channel "${dto.channelId}"`,
        );
      }
      return ro;
    }
    throw new BadRequestException('Either channelId or roId is required');
  }

  private async resolveBotUserId(): Promise<string> {
    if (this.cachedBotUserId) return this.cachedBotUserId;
    const configured = this.config.get<string>('integration.workflowBotUserId');
    if (configured) {
      this.cachedBotUserId = configured;
      return configured;
    }
    const bot = await this.prisma.user.findUnique({
      where: { email: WORKFLOW_BOT_EMAIL },
      select: { id: true },
    });
    if (!bot) {
      throw new BadRequestException(
        'Workflow Bot user not found — run the seed or set WORKFLOW_BOT_USER_ID',
      );
    }
    this.cachedBotUserId = bot.id;
    return bot.id;
  }
}
