import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { existsSync } from 'fs';
import { Public } from '../common/decorators/public.decorator';
import { AttachExtractionDto } from './dto/attach-extraction.dto';
import { IngestSubmissionDto } from './dto/ingest-submission.dto';
import { LogMessageDto, MarkMessageDto } from './dto/log-message.dto';
import { IntegrationAuthGuard } from './guards/integration-auth.guard';
import { IntegrationsService } from './integrations.service';

/**
 * Endpoints called by the background n8n workflow. Authenticated by a shared
 * secret (X-Integration-Key), NOT JWT — hence @Public (skips JwtAuthGuard) plus
 * the IntegrationAuthGuard. No @Roles, so the global RolesGuard is a no-op here.
 */
@Public()
@UseGuards(IntegrationAuthGuard)
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly service: IntegrationsService) {}

  /** Log a raw inbound message before processing. */
  @Post('messages')
  logMessage(@Body() dto: LogMessageDto) {
    return this.service.logMessage(dto);
  }

  /** Mark a logged message as processed (e.g. unrecognised messages). */
  @Patch('messages/:id')
  markMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkMessageDto,
  ) {
    return this.service.markMessage(id, dto);
  }

  /** Create a workflow-originated submission (WhatsApp/Slack). */
  @Post('submissions')
  ingestSubmission(@Body() dto: IngestSubmissionDto) {
    return this.service.ingestSubmission(dto);
  }

  /** Enrichment callback for an app-originated submission. */
  @Post('submissions/:id/extraction')
  attachExtraction(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AttachExtractionDto,
  ) {
    return this.service.attachExtraction(id, dto);
  }

  /** Stream a submission's attachment so the workflow can run vision on it. */
  @Get('files/:submissionId')
  async serveFile(
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Res() res: Response,
  ) {
    const { absPath, mimeType } = await this.service.getAttachment(submissionId);
    if (!existsSync(absPath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.type(mimeType);
    return res.sendFile(absPath);
  }
}
