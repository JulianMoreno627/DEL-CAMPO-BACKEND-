import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DomainError, NotFound } from '@del-campo/shared';

const EXTENSIONS = Object.freeze({ 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' });
const CONTENT_TYPES = Object.freeze(Object.fromEntries(Object.entries(EXTENSIONS).map(([type, ext]) => [ext, type])));
const MAX_BYTES = 600 * 1024;
const URL_PREFIX = '/uploads/';
/** Only names this service generates: <uuid>.<ext> (also prevents path traversal on disk). */
const FILE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|png)$/;

/**
 * Storage of the listing photos (Repository pattern). The photos arrive already compressed by the
 * client's Web Worker (WebP, ~800 px). The public URL is always /uploads/<uuid>.<ext>: the gateway
 * serves it by asking catalog-service over gRPC (GetPhoto), so the frontend does not change.
 *
 * Implementations:
 * - PostgresPhotoStorage: table photo in Neon (production; the disk of Render Free is erased on restart).
 * - DiskPhotoStorage: a folder (development and tests without a database).
 */
export class PhotoStorage {
  /** Validates before any other check, as the HTTP API did. */
  static validate({ content, contentType }) {
    if (!EXTENSIONS[contentType] || !content?.length) throw new DomainError('Envíe una imagen WebP, JPEG o PNG');
    if (content.length > MAX_BYTES) throw new DomainError('Archivo o cuerpo demasiado grande', 413);
  }

  /** File name of a photo URL of this service, or null if the URL is not ours (or there is no photo). */
  static fileNameOf(url) {
    const name = typeof url === 'string' && url.startsWith(URL_PREFIX) ? url.slice(URL_PREFIX.length) : null;
    return name && FILE_NAME.test(name) ? name : null;
  }

  /** @returns {Promise<string>} public URL of the photo */
  async save(photo) {
    PhotoStorage.validate(photo);
    const fileName = `${randomUUID()}.${EXTENSIONS[photo.contentType]}`;
    await this.write(fileName, photo);
    return `${URL_PREFIX}${fileName}`;
  }

  /** @returns {Promise<{content: Buffer, contentType: string}>} */
  async get(fileName) {
    const photo = FILE_NAME.test(String(fileName)) ? await this.read(fileName) : null;
    if (!photo) throw new NotFound('Foto');
    return photo;
  }

  /** Deletes the photo of a URL (when it is replaced or its listing is deleted). Unknown URLs are ignored. */
  async delete(url) {
    const fileName = PhotoStorage.fileNameOf(url);
    if (fileName) await this.remove(fileName);
  }

  // ---- Implemented by each storage
  async write(_fileName, _photo) { throw new Error('Not implemented'); }
  async read(_fileName) { throw new Error('Not implemented'); }
  async remove(_fileName) { throw new Error('Not implemented'); }
}

/** Photos in the table photo (owned by catalog-service). */
export class PostgresPhotoStorage extends PhotoStorage {
  constructor({ pool }) {
    super();
    this.pool = pool;
  }

  async write(fileName, { content, contentType }) {
    await this.pool.query('INSERT INTO photo (id, content_type, data, size) VALUES ($1, $2, $3, $4)',
      [fileName, contentType, content, content.length]);
  }

  async read(fileName) {
    const { rows } = await this.pool.query('SELECT content_type, data FROM photo WHERE id = $1', [fileName]);
    return rows[0] ? { content: rows[0].data, contentType: rows[0].content_type } : null;
  }

  async remove(fileName) {
    await this.pool.query('DELETE FROM photo WHERE id = $1', [fileName]);
  }
}

/** Photos in a folder (UPLOADS_DIR). Only for development: on Render Free the disk is erased. */
export class DiskPhotoStorage extends PhotoStorage {
  constructor({ directory }) {
    super();
    this.directory = directory;
  }

  async write(fileName, { content }) {
    await mkdir(this.directory, { recursive: true });
    await writeFile(path.join(this.directory, fileName), content);
  }

  async read(fileName) {
    try {
      const content = await readFile(path.join(this.directory, fileName));
      return { content, contentType: CONTENT_TYPES[path.extname(fileName).slice(1)] };
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async remove(fileName) {
    await unlink(path.join(this.directory, fileName)).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}
