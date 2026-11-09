/**
 * Static Site Generation (SSG) build: generates infrastructure/public/temporada/index.html once.
 * It runs in "npm run build" (Render: build command). The data comes from catalog-service over
 * gRPC: user, pricing and catalog are started for a moment on free ports, the season is asked
 * for, and they are stopped. With DATABASE_URL it reads Neon; without it the page is empty.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { GrpcClient, SERVICES, createPool, waitForDatabase, runSqlFile, closeHealthClients } from '@del-campo/shared';
import { loadConfig, SCHEMA_PATH } from '../src/config.js';
import { ServiceSupervisor } from '../src/supervisor/ServiceSupervisor.js';
import { MICROSERVICES } from '../src/supervisor/services.js';
import { freePort } from '../src/supervisor/freePort.js';
import { seasonJson } from '../src/gateway/restMappers.js';
import { seasonPage } from '../src/render/pages.js';

const NEEDED = ['user', 'pricing', 'catalog'];
const start = performance.now();
const config = loadConfig(process.env, { warn: () => {} });

// Free ports, so the build does not collide with a server that is already running
const env = { ...process.env, TOKEN_SECRET: config.tokenSecret };
for (const name of NEEDED) env[SERVICES[name].portEnv] = process.env[SERVICES[name].portEnv] = String(await freePort());

if (config.databaseUrl) {
  const pool = createPool(config.databaseUrl, { max: 1 });
  await waitForDatabase(pool);
  await runSqlFile(pool, SCHEMA_PATH);
  await pool.end();
}

const supervisor = new ServiceSupervisor({ services: MICROSERVICES.filter((s) => NEEDED.includes(s.name)), env });
const catalog = new GrpcClient('catalog', { deadlineMs: 30_000 });
try {
  await supervisor.startAll();
  const html = seasonPage(seasonJson(await catalog.call('GetSeason')), { frontendUrl: config.frontendUrl });

  // The URL stays in Spanish (/temporada/) because users see it
  const target = path.join(config.publicDir, 'temporada');
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, 'index.html'), html);
  console.log(`SSG: infrastructure/public/temporada/index.html (${(html.length / 1024).toFixed(1)} KB) en ${(performance.now() - start).toFixed(0)} ms`);
} finally {
  catalog.close();
  closeHealthClients();
  await supervisor.stopAll();
}
