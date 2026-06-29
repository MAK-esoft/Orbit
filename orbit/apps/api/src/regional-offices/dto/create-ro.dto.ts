import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateRegionalOfficeDto {
  @IsString()
  @Length(2, 255)
  name: string;

  @IsString()
  @Length(2, 50)
  @Matches(/^[A-Za-z0-9-]+$/, {
    message: 'Code may contain letters, numbers and hyphens only',
  })
  code: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  city?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  region?: string;
}
