import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { dirname, join, resolve as pathResolve } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { SavedFile, StorageService } from './storage.interface';

/**
 * Local-disk implementation. Layout (spec §12.3):
 *   {uploadDir}/{year}/{month}/{submissionId}/{uuid}-{originalName}
 * The DB stores the path relative to uploadDir.
 */
@Injectable()
export class LocalStorageService implements StorageService {
  private readonly baseDir: string;
  private readonly apiUrl: string;

  constructor(config: ConfigService) {
    this.baseDir = pathResolve(config.getOrThrow<string>('storage.uploadDir'));
    this.apiUrl = config.getOrThrow<string>('apiUrl');
  }

  async save(file: Express.Multer.File, submissionId: string): Promise<SavedFile> {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const relPath = join(year, month, submissionId, `${uuidv4()}-${safeName}`);
    const absPath = join(this.baseDir, relPath);

    await fs.mkdir(dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, file.buffer);

    return {
      path: relPath.split('\\').join('/'),
      originalName: file.originalname,
      mimeType: file.mimetype,
    };
  }

  getUrl(path: string): string {
    // Served through the authenticated /files endpoint, not directly.
    return `${this.apiUrl}/api/files/${path}`;
  }

  resolve(path: string): string {
    const abs = pathResolve(this.baseDir, path);
    // Prevent path traversal outside the uploads root.
    if (!abs.startsWith(this.baseDir)) {
      throw new Error('Invalid file path');
    }
    return abs;
  }

  async delete(path: string): Promise<void> {
    await fs.rm(this.resolve(path), { force: true });
  }
}
