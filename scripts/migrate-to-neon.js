/**
 * Copies the data of the current database (Render) to Neon, without installing pg_dump / pg_restore.
 *
 *   SOURCE_DATABASE_URL=<Render External Database URL> \
 *   TARGET_DATABASE_URL=<Neon connection string WITHOUT pooling> \
 *   node scripts/migrate-to-neon.js
 *
 * - Creates the schema in Neon (db/schema.sql, idempotent).
 * - Refuses to run if the Neon tables already have rows (use --force to copy anyway; existing rows are kept).
 * - Copies table by table in foreign-key order, inside ONE transaction: all or nothing.
 * - Verifies at the end that every table has the same number of rows in both databases.
 * It only READS the source database. The connection strings come from the environment (never from the code).
 */
import { fileURLToPath } from 'node:url';
import { createPool, runSqlFile, waitForDatabase } from '@del-campo/shared';

const TABLES = ['app_user', 'credential', 'harvest', 'purchase_order', 'cart', 'rating', 'sync_operation', 'market_price'];
const JSON_TYPES = new Set([114, 3802]); // json, jsonb
const SCHEMA = fileURLToPath(new URL('../db/schema.sql', import.meta.url));

const sourceUrl = process.env.SOURCE_DATABASE_URL;
const targetUrl = process.env.TARGET_DATABASE_URL;
const force = process.argv.includes('--force');
if (!sourceUrl || !targetUrl) {
  console.error('Defina SOURCE_DATABASE_URL (Render) y TARGET_DATABASE_URL (Neon, sin pooling).');
  process.exit(1);
}

const source = createPool(sourceUrl, { max: 1 });
const target = createPool(targetUrl, { max: 1 });

async function count(pool, table) {
  return (await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
}

async function existingTables(pool) {
  const { rows } = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
  return new Set(rows.map((row) => row.table_name));
}

try {
  await waitForDatabase(source);
  await waitForDatabase(target);
  await runSqlFile(target, SCHEMA);
  console.log('Esquema verificado en Neon.');

  const sourceTables = await existingTables(source);
  const tables = TABLES.filter((table) => sourceTables.has(table));

  if (!force) {
    const busy = [];
    for (const table of tables) if (await count(target, table) > 0) busy.push(table);
    if (busy.length) throw new Error(`Neon ya tiene datos en: ${busy.join(', ')}. Use --force para copiar igual.`);
  }

  const client = await target.connect();
  try {
    await client.query('BEGIN');
    for (const table of tables) {
      const { rows, fields } = await source.query(`SELECT * FROM ${table}`);
      const columns = fields.map((field) => field.name);
      const jsonColumns = new Set(fields.filter((field) => JSON_TYPES.has(field.dataTypeID)).map((field) => field.name));
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
      const insert = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
      for (const row of rows) {
        await client.query(insert, columns.map((column) =>
          (jsonColumns.has(column) && row[column] != null ? JSON.stringify(row[column]) : row[column])));
      }
      console.log(`  ${table}: ${rows.length} filas copiadas`);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  console.log('\nVerificación (Render → Neon):');
  let ok = true;
  for (const table of tables) {
    const [from, to] = [await count(source, table), await count(target, table)];
    if (from !== to && !force) ok = false;
    console.log(`  ${from === to ? '✓' : '✗'} ${table}: ${from} → ${to}`);
  }
  console.log(ok ? '\nMigración completa.' : '\nHay diferencias: revise las tablas marcadas con ✗.');
  process.exitCode = ok ? 0 : 1;
} catch (error) {
  console.error(`\nNo se migró nada: ${error.message}`);
  process.exitCode = 1;
} finally {
  await source.end();
  await target.end();
}
