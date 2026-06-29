import { PaymentType, RequestType } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

/**
 * Multipart form — all fields arrive as strings. The file is handled separately
 * by the FileInterceptor. Cross-field rules (note required when OTHER, date not
 * in future) are enforced in the service.
 */
export class CreateSubmissionDto {
  @IsEnum(RequestType)
  requestType: RequestType;

  @IsEnum(PaymentType)
  paymentType: PaymentType;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  paymentTypeNote?: string;

  @IsNumberString({ no_symbols: false }, { message: 'Amount must be a number' })
  amount: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Payment date must be YYYY-MM-DD' })
  paymentDate: string;

  @IsString()
  @IsNotEmpty({ message: 'Bank name is required' })
  @Length(1, 255)
  bankName: string;

  @IsString()
  @IsNotEmpty({ message: 'Reference / slip number is required' })
  @Length(1, 255)
  referenceNumber: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
