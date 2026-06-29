import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { WorkflowDispatchService } from './workflow-dispatch.service';

/**
 * Background n8n workflow integration. Exposes /integrations/* (shared-secret
 * auth) for the workflow to log messages, create submissions, and post back
 * enrichment; and dispatches app-originated submissions out to the workflow.
 * PrismaModule, FilesModule (STORAGE_SERVICE) and EventEmitter are global.
 */
@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationsService, WorkflowDispatchService],
})
export class IntegrationsModule {}
