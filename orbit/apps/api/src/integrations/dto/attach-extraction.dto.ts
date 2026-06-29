import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, ValidateNested } from 'class-validator';
import { ExtractionPayloadDto } from './extraction-payload.dto';

/**
 * Callback from the workflow for an app-originated submission: attaches the
 * extracted data and flips enrichmentStatus to ENRICHED (or FAILED).
 */
export class AttachExtractionDto {
  // When true, the workflow could not extract anything → enrichmentStatus FAILED.
  @IsOptional()
  @IsBoolean()
  failed?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => ExtractionPayloadDto)
  extraction?: ExtractionPayloadDto;
}
