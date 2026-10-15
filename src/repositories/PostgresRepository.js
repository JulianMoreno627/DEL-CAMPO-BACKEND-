import { Repository } from './Repository.js';
import { VersionConflict } from '../domain/errors.js';

/**
 * Generic PostgreSQL repository that implements the same interface as InMemoryRepository,
 * so services do not need to change. The list(filter) method loads all rows and applies the
 * JS predicate in memory (fine for the data volume of this project).
 *
 * A columnMap: { entityField: dbColumn } — only the columns that differ from snake_case.
 */
export class PostgresRepository extends Repository {
  /**
   * @param {import('pg').Pool} pool
   * @param {string} table
   * @param {string} resourceName
   * @param {(data:object) => object} factory
   * @param {object} [columnMap] maps entity field names to DB column names
   * @param {string} [primaryKey] DB column used as primary key (default: 'id')
   * @param {string[]} [exclude] entity fields to skip when writing (e.g. computed getters)
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
    for (const [dbCol, value] of Object.entries(row)) {
      const field = this.#toCamel(dbCol);
      data[field] = value;
    }
    return this.factory(data);
  }

  /** Converts an entity into a DB row. Returns { columns, values }. */
  toRow(entity) {
    const obj = entity.toJSON();
    const columns = [];
    const values = [];
    for (const [field, value] of Object.entries(obj)) {
      if (this.exclude.has(field)) continue;
      const dbCol = this.columnMap[field] ?? this.#toSnake(field);
      columns.push(dbCol);
      values.push(this.#serialize(value));
    }
    return { columns, values };
  }

  async get(id) {
    const result = await this.pool.query(
      `SELECT * FROM ${this.table} WHERE ${this.primaryKey} = $1`, [id]);
    return result.rows[0] ? this.fromRow(result.rows[0]) : null;
  }

  async list(filter = () => true) {
    const result = await this.pool.query(`SELECT * FROM ${this.table}`);
    return result.rows.map((r) => this.fromRow(r)).filter(filter);
  }

  /**
   * Upserts the entity. If expectedVersion is given, the update only happens only if the
   * stored version matches; otherwise a VersionConflict is thrown (optimistic locking).
   */
  async save(entity, { expectedVersion } = {}) {
    const { columns, values } = this.toRow(entity);
    const placeholders = columns.map((_, i) => `$${i + 1}`);
    const setClause = columns.map((c, i) => `${c} = EXCLUDED.${c}`).join(', ');

    const pk = this.primaryKey;
    if (expectedVersion != null) {
      const conflictSql = `
        INSERT INTO ${this.table} (${columns.join(', ')})
        VALUES (${placeholders.join(', ')})
        ON CONFLICT (${pk}) DO UPDATE SET ${setClause}
        WHERE ${this.table}.version = $${columns.length + 1}
        RETURNING ${pk}`;
      const result = await this.pool.query(conflictSql, [...values, expectedVersion]);
      if (result.rowCount === 0) {
        const current = await this.get(entity.id);
        throw new VersionConflict(current);
      }
    } else {
      await this.pool.query(
        `INSERT INTO ${this.table} (${columns.join(', ')})
         VALUES (${placeholders.join(', ')})
         ON CONFLICT (${pk}) DO UPDATE SET ${setClause}`, values);
    }
    return entity;
  }

  async delete(id) {
    const result = await this.pool.query(
      `DELETE FROM ${this.table} WHERE ${this.primaryKey} = $1`, [id]);
    return result.rowCount > 0;
  }

  // ---- internal helpers -------------------------------------------------

  #toCamel(snake) {
    return snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  }

  #toSnake(camel) {
    return camel.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  }

  /** pg handles arrays and JSONB values for Postgres */
  #serialize(value) {
    if (value == null) return null;
    if (Array.isArray(value)) return value; // pg handles arrays natively
    if (typeof value === 'object') return JSON.stringify(value); // JSONB
    return value;
  }
}
