import { Global, Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { LocalStorageService } from './storage/local-storage.service';
import { STORAGE_SERVICE } from './storage/storage.interface';

/**
 * Global so the Submissions module can inject STORAGE_SERVICE. Swap the
 * useClass to S3StorageService later — nothing else changes.
 */
@Global()
@Module({
  controllers: [FilesController],
  providers: [{ provide: STORAGE_SERVICE, useClass: LocalStorageService }],
  exports: [STORAGE_SERVICE],
})
export class FilesModule {}
