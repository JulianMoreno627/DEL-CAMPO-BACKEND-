import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

// Return values in the same shape the domain uses in memory:
// DATE as 'YYYY-MM-DD', TIMESTAMPTZ as ISO string, NUMERIC as number.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (value) => new Date(value).toISOString());
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));

/**
 * Pool for Neon (or any PostgreSQL).
 * - Use the POOLED connection string (host with "-pooler"): Neon's PgBouncer multiplexes the
 *   connections of the 6 microservices, so each pool can be small.
 * - SSL is configured here explicitly: sslmode/channel_binding are read from the URL and removed from it,
 *   because node-postgres lets the URL override the ssl option. Neon serves a valid public
 *   certificate, so it is verified (rejectUnauthorized: true) unless DB_SSL_REJECT_UNAUTHORIZED=false.
 * - Neon suspends the database after a few idle minutes and closes its connections:
 *   the 'error' handler keeps that from crashing the process, and short idle times let it sleep.
 *
 * @param {string} databaseUrl
 * @param {object} [options]
 * @param {number} [options.max] connections of this process (DB_POOL_MAX, default 3)
 */
export function createPool(databaseUrl, { max = Number(process.env.DB_POOL_MAX ?? 3) } = {}) {
  const { connectionString, ssl, enableChannelBinding } = parseDatabaseUrl(databaseUrl);
  const pool = new pg.Pool({
    connectionString,
    ssl,
    enableChannelBinding,
    max,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000, // waking a suspended Neon compute takes a few seconds
    query_timeout: 15_000,
  });
  pool.on('error', (error) => console.error('[db] idle connection closed:', error.message));
  return pool;
}

/** Separates the SSL settings from the URL (exported for the tests). */
export function parseDatabaseUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  const sslMode = url.searchParams.get('sslmode');
  const channelBinding = url.searchParams.get('channel_binding');
  for (const param of ['sslmode', 'channel_binding', 'uselibpqcompat']) url.searchParams.delete(param);

  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  const useSsl = sslMode ? sslMode !== 'disable' : !isLocal;
  return {
    connectionString: url.toString(),
    ssl: useSsl ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } : false,
    enableChannelBinding: channelBinding === 'require',
  };
}

/**
 * Waits until the database answers. The first query to a suspended Neon database
 * takes longer, so it retries with exponential backoff.
 */
export async function waitForDatabase(pool, { attempts = 6, initialDelayMs = 1000, log = console } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (error) {
      if (attempt >= attempts) throw new Error(`Database not reachable after ${attempts} attempts: ${error.message}`);
      const delay = initialDelayMs * 2 ** (attempt - 1);
      log.warn?.(`[db] attempt ${attempt} failed (${error.message}); retrying in ${delay} ms`);
      await sleep(delay);
    }
  }
}

/** Runs a .sql file (used once by "infrastructure" with db/schema.sql, which is idempotent). */
export async function runSqlFile(pool, filePath) {
  await pool.query(await readFile(filePath, 'utf8'));
}
