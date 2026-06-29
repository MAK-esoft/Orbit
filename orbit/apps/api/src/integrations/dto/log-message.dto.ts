import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { SubmissionSource } from '@prisma/client';

/** Raw inbound message logged by the workflow before processing. */
export class LogMessageDto {
  @IsEnum(SubmissionSource)
  source: SubmissionSource;

  @IsOptional()
  @IsString()
  senderRef?: string;

  @IsOptional()
  @IsString()
  channelId?: string; // WhatsApp group id / Slack channel id

  @IsOptional()
  @IsString()
  messageText?: string;

  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @IsOptional()
  @IsString()
  mediaMime?: string;

  @IsObject()
  rawPayload: Record<string, unknown>;
}

/** Marks a logged message as processed (used for unrecognised messages). */
export class MarkMessageDto {
  @IsOptional()
  @IsString()
  classification?: string;

  @IsOptional()
  @IsString()
  processingStatus?: string;
}
