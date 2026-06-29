import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateRegionalOfficeDto } from './create-ro.dto';

export class UpdateRegionalOfficeDto extends PartialType(CreateRegionalOfficeDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
