import { VersionConflict, NotFound } from '../errors.js';

/**
 * Repository pattern: services depend on this interface, not on the database.
 * Each microservice has a PostgreSQL implementation (production) and uses the
 * in-memory one for development and tests (when there is no DATABASE_URL).
 */
export class Repository {
  async get(_id) { throw new Error('Not implemented'); }
  async list(_filter) { throw new Error('Not implemented'); }
  async save(_entity, _options) { throw new Error('Not implemented'); }
  async delete(_id) { throw new Error('Not implemented'); }

  async getOrFail(id) {
    const entity = await this.get(id);
    if (!entity) throw new NotFound(this.resourceName ?? 'Registro');
    return entity;
  }
}

export class InMemoryRepository extends Repository {
  /**
   * @param {string} resourceName  readable name used in error messages (shown to the user, in Spanish)
   * @param {(data:object) => object} factory  rebuilds the entity from plain data
   */
  constructor(resourceName, factory) {
    super();
    this.resourceName = resourceName;
    this.factory = factory;
    this.rows = new Map();
  }

  // A serialized copy is stored: nobody can modify the "storage" by reference,
  // just like with a real database.
  async get(id) {
    const row = this.rows.get(id);
    return row ? this.factory(structuredClone(row)) : null;
  }

  async list(filter = () => true) {
    return [...this.rows.values()].map((row) => this.factory(structuredClone(row))).filter(filter);
  }

  /**
   * Optimistic concurrency control: if expectedVersion is given and does not match
   * the stored one, a VersionConflict is thrown.
   */
  async save(entity, { expectedVersion } = {}) {
    const current = this.rows.get(entity.id);
    if (expectedVersion != null && current && current.version !== expectedVersion) {
      throw new VersionConflict(current);
    }
    this.rows.set(entity.id, JSON.parse(JSON.stringify(entity)));
    return entity;
  }

  async delete(id) {
    return this.rows.delete(id);
  }
}
