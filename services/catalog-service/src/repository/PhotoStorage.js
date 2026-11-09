import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DomainError } from '@del-campo/shared';

const EXTENSIONS = Object.freeze({ 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' });
const MAX_BYTES = 600 * 1024;

/**
 * Saves the listing photos, already compressed by the client's Web Worker (WebP, ~800 px),
 * in UPLOADS_DIR, and returns their public URL (/uploads/<file>), which the gateway serves.
 * Note: on Render Free the disk is ephemeral (the photos are lost on every deploy).
 */
export class PhotoStorage {
  constructor({ directory }) {
    this.directory = directory;
  }

  /** Validates before any other check, as the HTTP API did. */
  static validate({ content, contentType }) {
    if (!EXTENSIONS[contentType] || !content?.length) throw new DomainError('Envíe una imagen WebP, JPEG o PNG');
    if (content.length > MAX_BYTES) throw new DomainError('Archivo o cuerpo demasiado grande', 413);
  }

  /** @returns {Promise<string>} public URL of the photo */
  async save({ content, contentType }) {
    PhotoStorage.validate({ content, contentType });
    await mkdir(this.directory, { recursive: true });
    const fileName = `${randomUUID()}.${EXTENSIONS[contentType]}`;
    await writeFile(path.join(this.directory, fileName), content);
    return `/uploads/${fileName}`;
  }
}
