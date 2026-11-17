import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DomainError, NotFound } from '@del-campo/shared';

const EXTENSIONS = Object.freeze({ 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' });
const CONTENT_TYPES = Object.freeze(Object.fromEntries(Object.entries(EXTENSIONS).map(([type, ext]) => [ext, type])));
const MAX_BYTES = 600 * 1024;
const URL_PREFIX = '/avatars/';
/** Only names this service generates: <uuid>.<ext> (also prevents path traversal on disk). */
const FILE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|png)$/;

/**
 * Storage of the profile photos (Repository pattern), owned by user-service.
 * Public URL: /avatars/<uuid>.<ext>; the gateway serves it by asking user-service over gRPC (GetAvatar).
 * - PostgresAvatarStorage: table user_avatar in Neon (production).
 * - DiskAvatarStorage: a folder (development and tests without a database).
 */
export class AvatarStorage {
  static validate({ content, contentType }) {
    if (!EXTENSIONS[contentType] || !content?.length) throw new DomainError('Envíe una imagen WebP, JPEG o PNG');
    if (content.length > MAX_BYTES) throw new DomainError('Archivo o cuerpo demasiado grande', 413);
  }

  /** @returns {Promise<string>} public URL of the photo */
  async save(photo) {
    AvatarStorage.validate(photo);
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

  /** Deletes the photo of a URL of this service; other values are ignored. */
  async delete(url) {
    const fileName = typeof url === 'string' && url.startsWith(URL_PREFIX) ? url.slice(URL_PREFIX.length) : null;
    if (fileName && FILE_NAME.test(fileName)) await this.remove(fileName);
  }

  async write(_fileName, _photo) { throw new Error('Not implemented'); }
  async read(_fileName) { throw new Error('Not implemented'); }
  async remove(_fileName) { throw new Error('Not implemented'); }
}

/** Table user_avatar (owned by user-service). */
export class PostgresAvatarStorage extends AvatarStorage {
  constructor({ pool }) {
    super();
    this.pool = pool;
  }

  async write(fileName, { content, contentType }) {
    await this.pool.query('INSERT INTO user_avatar (id, content_type, data, size) VALUES ($1, $2, $3, $4)',
      [fileName, contentType, content, content.length]);
  }

  async read(fileName) {
    const { rows } = await this.pool.query('SELECT content_type, data FROM user_avatar WHERE id = $1', [fileName]);
    return rows[0] ? { content: rows[0].data, contentType: rows[0].content_type } : null;
  }

  async remove(fileName) {
    await this.pool.query('DELETE FROM user_avatar WHERE id = $1', [fileName]);
  }
}

/** A folder (development only: on Render Free the disk is erased). */
export class DiskAvatarStorage extends AvatarStorage {
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
      return { content: await readFile(path.join(this.directory, fileName)), contentType: CONTENT_TYPES[path.extname(fileName).slice(1)] };
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
