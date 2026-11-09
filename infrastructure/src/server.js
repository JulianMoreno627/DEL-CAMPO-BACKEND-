import { SessionToken, createPool, waitForDatabase, runSqlFile } from '@del-campo/shared';
import { loadConfig, SCHEMA_PATH } from './config.js';
import { ServiceSupervisor } from './supervisor/ServiceSupervisor.js';
import { MICROSERVICES } from './supervisor/services.js';
import { createGrpcClients } from './clients.js';
import { createGateway } from './gateway/app.js';
import { IsrCache } from './render/IsrCache.js';
import { HarvestChangeSubscriber } from './render/HarvestChangeSubscriber.js';
import { MetricsService } from './metrics/MetricsService.js';

/**
 * Entry point of the backend (the only process Render starts):
 *   1. If there is DATABASE_URL (Neon), runs db/schema.sql ONCE (idempotent) before the services.
 *   2. Starts the 6 microservices as child processes and waits for their gRPC health check.
 *   3. Opens the public PORT with the REST API Gateway (+ SSR/SSG/ISR pages and metrics).
 */
const config = loadConfig();
const env = { ...process.env, TOKEN_SECRET: config.tokenSecret };

// 1. Schema (a single small connection; the services open their own pools)
let pool = null;
if (config.databaseUrl) {
  pool = createPool(config.databaseUrl, { max: 1 });
  await waitForDatabase(pool);
  await runSqlFile(pool, SCHEMA_PATH);
  console.log('[infrastructure] esquema verificado en PostgreSQL');
}

// 2. Microservices
const supervisor = new ServiceSupervisor({
  services: MICROSERVICES,
  env,
  execArgv: config.serviceNodeFlags,
});
await supervisor.startAll();
console.log(`[infrastructure] microservicios listos: ${MICROSERVICES.map((s) => s.name).join(', ')}`);

// 3. Gateway
const clients = createGrpcClients();
const isrCache = new IsrCache({ revalidateSeconds: config.isrRevalidateSeconds });
const subscriber = new HarvestChangeSubscriber({ catalog: clients.catalog, isrCache }).start();

const app = createGateway({
  clients,
  sessionToken: new SessionToken(config.tokenSecret),
  isrCache,
  metricsService: new MetricsService(),
  frontendUrl: config.frontendUrl,
  allowedOrigins: config.allowedOrigins,
  uploadsDir: config.uploadsDir,
  publicDir: config.publicDir,
  healthProbe: async () => ({
    services: await supervisor.health(),
    database: pool ? await pool.query('SELECT 1').then(() => 'UP', () => 'DOWN') : 'IN_MEMORY',
    memory: { gatewayRssMb: Number((process.memoryUsage().rss / 1048576).toFixed(1)), services: supervisor.memory() },
  }),
});

const server = app.listen(config.port, () => {
  console.log(`API Gateway (REST) en http://localhost:${config.port}/api`);
  console.log(`  SSR + ISR: http://localhost:${config.port}/productores/p-rosa`);
  console.log(`  SSG:       http://localhost:${config.port}/temporada/`);
  console.log(`  CORS permitido para: ${config.allowedOrigins.join(', ')}`);
  console.log(`  Persistencia: ${config.databaseUrl ? 'PostgreSQL (Neon)' : 'en memoria'}`);
});

// Orderly shutdown (Render sends SIGTERM on every deploy)
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    console.log(`[infrastructure] apagando (${signal})`);
    server.close();
    subscriber.stop();
    clients.close();
    await supervisor.stopAll();
    await pool?.end();
    process.exit(0);
  });
}
