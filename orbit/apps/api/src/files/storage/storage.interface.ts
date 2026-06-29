/**
 * Storage abstraction (spec §12.5). LocalStorageService implements this for V1.
 * Swapping to S3/MinIO later only requires a new implementation — no changes
 * to submission logic.
 */
export interface SavedFile {
  /** Relative path from the uploads root, stored in the DB. */
  path: string;
  originalName: string;
  mimeType: string;
}

export interface StorageService {
  /** Persist an uploaded file under a submission and return its relative path. */
  save(
    file: Express.Multer.File,
    submissionId: string,
  ): Promise<SavedFile>;

  /** Build a client-facing URL for a stored relative path. */
  getUrl(path: string): string;

  /** Read a stored file's absolute location (for serving). */
  resolve(path: string): string;

  delete(path: string): Promise<void>;
}

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');
