import { AdjustmentType } from '@prisma/client';
import {
  IsEnum,
  IsNumberString,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

export class CreateAdjustmentDto {
  @IsUUID()
  roId: string;

  @IsEnum(AdjustmentType)
  type: AdjustmentType;

  @IsNumberString({ no_symbols: false }, { message: 'Amount must be a number' })
  amount: string;

  @IsString()
  @Length(3, 1000, { message: 'Please add a short description (min 3 chars)' })
  description: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Effective date must be YYYY-MM-DD' })
  effectiveDate: string;
}
