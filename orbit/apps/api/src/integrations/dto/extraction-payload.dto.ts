import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumberString,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/** A single dynamic field extracted from a proof (e.g. Account Title → ...). */
export class ExtractedFieldDto {
  @IsString()
  @IsNotEmpty()
  label: string;

  @IsString()
  value: string;
}

/**
 * AI-extracted data produced by the n8n workflow. Stored verbatim in
 * SubmissionExtraction and always surfaced as separate "Extracted Information".
 */
export class ExtractionPayloadDto {
  @IsString()
  @IsNotEmpty()
  classification: string; // payment_proof | expense_proof | unrecognised | ...

  @IsOptional()
  @IsNumberString()
  extractedAmount?: string;

  @IsOptional()
  @IsString()
  extractedPaymentMethod?: string;

  @IsOptional()
  @IsString()
  slipRef?: string;

  @IsOptional()
  @IsString()
  merchant?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  bankEmailMatch?: boolean;

  @IsOptional()
  @IsNumberString()
  bankEmailAmount?: string;

  @IsOptional()
  @IsString()
  bankEmailTimestamp?: string; // ISO 8601

  @IsOptional()
  @IsString()
  confidence?: string;

  @IsOptional()
  @IsString()
  model?: string;

  // Dynamic, proof-specific fields — only those actually present on the proof.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExtractedFieldDto)
  fields?: ExtractedFieldDto[];

  // Full raw AI response, kept for audit/debugging.
  @IsOptional()
  @IsObject()
  rawResponse?: Record<string, unknown>;
}
