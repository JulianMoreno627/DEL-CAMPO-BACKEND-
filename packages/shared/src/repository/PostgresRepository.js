import { Repository } from './Repository.js';
import { VersionConflict } from '../errors.js';

/**
 * Generic PostgreSQL repository that implements the same interface as InMemoryRepository,
 * so services do not need to change. The list(filter) method loads all rows and applies the
 * JS predicate in memory (fine for the data volume of this project).
 *
 * Every service creates its repositories ONLY over its own tables.
 */
export class PostgresRepository extends Repository {
  /**
   * @param {object} options
   * @param {import('pg').Pool} options.pool
   * @param {string} options.table
   * @param {string} options.resourceName
   * @param {(data:object) => object} options.factory
   * @param {object} [options.columnMap] maps entity field names to DB column names (only the ones that are not snake_case)
   * @param {string} [options.primaryKey] DB column used as primary key (default: 'id')
   * @param {string[]} [options.exclude] entity fields to skip when writing (e.g. computed getters)
   */
  constructor({ pool, table, resourceName, factory, columnMap = {}, primaryKey = 'id', exclude = [] }) {
    super();
    this.pool = pool;
    this.table = table;
    this.resourceName = resourceName;
    this.factory = factory;
    this.columnMap = columnMap;
    this.primaryKey = primaryKey;
    this.exclude = new Set(exclude);
  }

  /** Converts a DB row (snake_case) into an entity (camelCase). */
  fromRow(row) {
    const data = {};
    for (const [column, value] of Object.entries(row)) data[toCamel(column)] = value;
    return this.factory(data);
  }

  /** Converts an entity into a DB row. Returns { columns, values }. */
  toRow(entity) {
    const columns = [];
    const values = [];
    for (const [field, value] of Object.entries(entity.toJSON())) {
      if (this.exclude.has(field)) continue;
      columns.push(this.columnMap[field] ?? toSnake(field));
      values.push(serialize(value));
    }
    return { columns, values };
  }

  async get(id) {
    const result = await this.pool.query(`SELECT * FROM ${this.table} WHERE ${this.primaryKey} = $1`, [id]);
    return result.rows[0] ? this.fromRow(result.rows[0]) : null;
  }

  async list(filter = () => true) {
    const result = await this.pool.query(`SELECT * FROM ${this.table}`);
    return result.rows.map((row) => this.fromRow(row)).filter(filter);
  }

  /**
   * Upserts the entity. If expectedVersion is given, the update only happens if the
   * stored version matches; otherwise a VersionConflict is thrown (optimistic locking).
   */
  async save(entity, { expectedVersion } = {}) {
    const { columns, values } = this.toRow(entity);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const setClause = columns.map((column) => `${column} = EXCLUDED.${column}`).join(', ');
    const upsert = `INSERT INTO ${this.table} (${columns.join(', ')}) VALUES (${placeholders})
      ON CONFLICT (${this.primaryKey}) DO UPDATE SET ${setClause}`;

    if (expectedVersion == null) {
      await this.pool.query(upsert, values);
      return entity;
    }
    const result = await this.pool.query(
      `${upsert} WHERE ${this.table}.version = $${columns.length + 1} RETURNING ${this.primaryKey}`,
      [...values, expectedVersion]);
    if (result.rowCount === 0) throw new VersionConflict(await this.get(entity.id));
    return entity;
  }

  async delete(id) {
    const result = await this.pool.query(`DELETE FROM ${this.table} WHERE ${this.primaryKey} = $1`, [id]);
    return result.rowCount > 0;
  }
}

const toCamel = (snake) => snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const toSnake = (camel) => camel.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** pg handles arrays natively; plain objects are stored as JSONB. */
function serialize(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}
