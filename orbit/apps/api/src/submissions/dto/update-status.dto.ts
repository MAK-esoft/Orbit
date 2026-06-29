import { SubmissionStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class UpdateStatusDto {
  @IsEnum(SubmissionStatus)
  status: SubmissionStatus;

  // Mandatory (min 10 chars) when rejecting (spec §9.3).
  @ValidateIf((o) => o.status === SubmissionStatus.REJECTED)
  @IsString()
  @MinLength(10, { message: 'A rejection reason of at least 10 characters is required' })
  reason?: string;
}
