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

  // The RO's own WhatsApp number; inbound WhatsApp proofs from this sender are
  // routed to this office. Digits, +, spaces and dashes allowed.
  @IsOptional()
  @IsString()
  @Length(0, 32)
  @Matches(/^[0-9+\-\s]*$/, {
    message: 'WhatsApp number may contain digits, +, spaces and dashes only',
  })
  whatsappPhone?: string;
}
