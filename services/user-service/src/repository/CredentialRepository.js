import { Credential } from '../model/Credential.js';

/**
 * Credentials (email → user, salt, hash). Before the migration they were kept in a Map in memory
 * and the whole table was rewritten on every change; now each credential is read and written on its own.
 */
export class InMemoryCredentialRepository {
  #rows = new Map();

  async findByEmail(email) {
    return this.#rows.get(email) ?? null;
  }

  async save(credential) {
    this.#rows.set(credential.email, credential);
  }
}

/** Table credential (owned by user-service). */
export class PostgresCredentialRepository {
  constructor({ pool }) {
    this.pool = pool;
  }

  async findByEmail(email) {
    const { rows } = await this.pool.query('SELECT email, user_id, salt, hash FROM credential WHERE email = $1', [email]);
    return rows[0] ? new Credential({ email: rows[0].email, userId: rows[0].user_id, salt: rows[0].salt, hash: rows[0].hash }) : null;
  }

  async save({ email, userId, salt, hash }) {
    await this.pool.query(
      `INSERT INTO credential (email, user_id, salt, hash) VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET user_id = EXCLUDED.user_id, salt = EXCLUDED.salt, hash = EXCLUDED.hash`,
      [email, userId, salt, hash]);
  }
}
