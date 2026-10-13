import { randomUUID } from 'node:crypto';

/**
 * Base class for every persistent entity.
 * Provides identity, a version number (optimistic concurrency control) and the last update date.
 */
export class Entity {
  constructor({ id = randomUUID(), version = 1, updatedAt = new Date().toISOString() } = {}) {
    if (new.target === Entity) throw new TypeError('Entity is abstract');
    this.id = id;
    this.version = version;
    this.updatedAt = updatedAt;
  }

  /** Marks the entity as modified: bumps the version. */
  touch() {
    this.version += 1;
    this.updatedAt = new Date().toISOString();
  }

  toJSON() {
    return { id: this.id, version: this.version, updatedAt: this.updatedAt };
  }
}
