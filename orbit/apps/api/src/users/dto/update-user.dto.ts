import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Length(2, 255)
  fullName?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
