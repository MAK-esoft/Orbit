import { PaymentType, RequestType, SubmissionSource } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';
import { ExtractionPayloadDto } from './extraction-payload.dto';

/**
 * Creates a workflow-originated submission (WhatsApp/Slack). The RO is resolved
 * from `channelId` (or `roId` directly); the request is attributed to the
 * Workflow Bot user and starts in SUBMITTED for admin review in the Orbit app.
 */
export class IngestSubmissionDto {
  @IsEnum(SubmissionSource)
  source: SubmissionSource; // WHATSAPP | SLACK (APP is rejected by the service)

  // One of channelId / roId must resolve to a regional office.
  @IsOptional()
  @IsString()
  channelId?: string;

  @IsOptional()
  @IsUUID()
  roId?: string;

  @IsOptional()
  @IsString()
  senderRef?: string;

  @IsOptional()
  @IsString()
  messageText?: string;

  // Links back to the raw WorkflowMessage logged earlier.
  @IsOptional()
  @IsUUID()
  workflowMessageId?: string;

  // If omitted, derived from the extraction classification
  // (payment_proof → DEPOSIT, expense_proof → EXPENSE).
  @IsOptional()
  @IsEnum(RequestType)
  requestType?: RequestType;

  @IsOptional()
  @IsEnum(PaymentType)
  paymentType?: PaymentType; // defaults to OTHER

  @IsOptional()
  @IsNumberString()
  amount?: string; // nullable — admin confirms before approval

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'paymentDate must be YYYY-MM-DD' })
  paymentDate?: string; // defaults to today

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @ValidateNested()
  @Type(() => ExtractionPayloadDto)
  extraction: ExtractionPayloadDto;
}
