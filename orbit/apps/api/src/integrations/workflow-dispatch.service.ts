import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { EnrichmentStatus, SubmissionSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationEvents,
  ResubmittedEvent,
  SubmissionCreatedEvent,
} from '../notifications/notification-events';

/**
 * Sends app-originated submissions through the background n8n workflow for AI
 * enrichment. The workflow fetches the attachment from GET /integrations/files
 * and posts the extraction back to POST /integrations/submissions/:id/extraction.
 *
 * Fire-and-forget: a dispatch failure never affects the user's submission; the
 * request simply stays at enrichmentStatus = PENDING.
 */
@Injectable()
export class WorkflowDispatchService {
  private readonly logger = new Logger(WorkflowDispatchService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent(NotificationEvents.SUBMISSION_CREATED)
  async onSubmissionCreated(event: SubmissionCreatedEvent) {
    await this.dispatch(event.submission as any);
  }

  @OnEvent(NotificationEvents.RESUBMITTED)
  async onResubmitted(event: ResubmittedEvent) {
    await this.dispatch(event.submission as any);
  }

  private async dispatch(submission: {
    id: string;
    source: SubmissionSource;
    roId: string;
    attachmentPath: string | null;
    notes: string | null;
  }) {
    // Only app-originated requests round-trip; WhatsApp/Slack ones are already
    // enriched at ingestion (and would otherwise loop back into the workflow).
    if (submission.source !== SubmissionSource.APP) return;

    const webhookUrl = this.config.get<string>(
      'integration.n8nAppSubmissionWebhookUrl',
    );
    if (!webhookUrl) return; // integration disabled — behave as before

    const baseUrl = this.config.get<string>('integration.publicApiBaseUrl');
    const fileUrl = submission.attachmentPath
      ? `${baseUrl}/api/integrations/files/${submission.id}`
      : null;

    try {
      await this.prisma.paymentSubmission.update({
        where: { id: submission.id },
        data: { enrichmentStatus: EnrichmentStatus.PENDING },
      });

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: submission.id,
          source: 'app',
          roId: submission.roId,
          fileUrl,
          messageText: submission.notes ?? '',
        }),
      });
      if (!res.ok) {
        this.logger.warn(
          `n8n dispatch for ${submission.id} returned ${res.status}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Failed to dispatch submission ${submission.id} to n8n: ${
          (err as Error).message
        }`,
      );
    }
  }
}
