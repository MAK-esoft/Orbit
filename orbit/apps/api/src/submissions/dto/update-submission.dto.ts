import { PaymentType, RequestType } from '@prisma/client';
import {
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

/**
 * Admin-only edit of a non-finalized request's financial fields. Used to
 * confirm or correct values the n8n workflow extracted before approving.
 * All fields optional — only those present are applied.
 */
export class UpdateSubmissionDto {
  @IsOptional()
  @IsNumberString({ no_symbols: false }, { message: 'Amount must be a number' })
  amount?: string;

  @IsOptional()
  @IsEnum(RequestType)
  requestType?: RequestType;

  @IsOptional()
  @IsEnum(PaymentType)
  paymentType?: PaymentType;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  paymentTypeNote?: string;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  bankName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  referenceNumber?: string;
}
