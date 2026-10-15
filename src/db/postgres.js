import pg from 'pg';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(__dirname, '..', '..', 'db', 'schema.sql');

// Return values in the same shape the domain uses with the JSON store:
// DATE as 'YYYY-MM-DD', TIMESTAMPTZ as ISO string, NUMERIC as number.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (value) => new Date(value).toISOString());
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));

/**
 * Creates a pg Pool. On Render the DATABASE_URL requires SSL.
 * pg reads PGSSLMODE=require automatically; we also force rejectUnauthorized:false
 * so self-signed certs (Render) work without extra config.
 */
export function createPool(databaseUrl) {
  return new pg.Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('sslmode=require') || databaseUrl.includes('render.com')
      ? { rejectUnauthorized: false }
      : undefined,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
}

/** Runs the schema.sql file (all statements use IF NOT EXISTS, so it is idempotent). */
export async function runSchema(pool) {
  const sql = await readFile(SCHEMA_PATH, 'utf8');
  await pool.query(sql);
}

/** Returns true if the users table has at least one row (used to decide whether to seed). */
export async function hasUsers(pool) {
  const result = await pool.query('SELECT COUNT(*)::int AS n FROM app_user');
  return result.rows[0].n > 0;
}

// ---- Credentials ---------------------------------------------------------

/** Loads all credentials from the credential table into AuthService. */
export async function loadCredentials(pool, authService) {
  const result = await pool.query('SELECT email, user_id, salt, hash FROM credential');
  authService.importCredentials(result.rows.map((r) => ({
    email: r.email,
    userId: r.user_id,
    salt: r.salt.toString('base64'),
    hash: r.hash.toString('base64'),
  })));
}

/** Saves a single credential (email -> { userId, salt, hash }) to Postgres. */
export async function saveCredential(pool, email, { userId, salt, hash }) {
  await pool.query(
    `INSERT INTO credential (email, user_id, salt, hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET user_id = EXCLUDED.user_id, salt = EXCLUDED.salt, hash = EXCLUDED.hash`,
    [email, userId, salt, hash],
  );
}

/** Persists the full credentials map (called on every change). */
export async function saveAllCredentials(pool, authService) {
  for (const [email, cred] of authService.credentials) {
    await saveCredential(pool, email, cred);
  }
}

// ---- Sync operations (idempotency) ---------------------------------------

/** Loads previously processed sync operations into SyncService. */
export async function loadSyncOperations(pool, syncService) {
  const result = await pool.query('SELECT op_id, result FROM sync_operation');
  for (const row of result.rows) {
    syncService.processed.set(row.op_id, row.result);
  }
}

/** Persists a sync operation result. */
export async function saveSyncOperation(pool, opId, result) {
  await pool.query(
    `INSERT INTO sync_operation (op_id, device_id, result)
     VALUES ($1, $2, $3)
     ON CONFLICT (op_id) DO NOTHING`,
    [opId, result.deviceId ?? null, result],
  );
}
