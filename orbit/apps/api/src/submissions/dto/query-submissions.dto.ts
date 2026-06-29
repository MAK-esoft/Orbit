import { PaymentType, SubmissionStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

/** Split a comma-separated query param into an array. */
const toArray = ({ value }: { value: unknown }): string[] =>
  typeof value === 'string'
    ? value.split(',').map((v) => v.trim()).filter(Boolean)
    : Array.isArray(value)
      ? (value as string[])
      : [];

export class QuerySubmissionsDto extends PaginationDto {
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsUUID('4', { each: true })
  roId?: string[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(SubmissionStatus, { each: true })
  status?: SubmissionStatus[];

  @IsOptional()
  @IsEnum(PaymentType)
  paymentType?: PaymentType;

  @IsOptional()
  @IsString()
  dateFrom?: string; // payment date >=

  @IsOptional()
  @IsString()
  dateTo?: string; // payment date <=

  @IsOptional()
  @IsString()
  search?: string; // reference number / bank name contains

  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsString()
  sortDir?: 'asc' | 'desc' = 'desc';
}
