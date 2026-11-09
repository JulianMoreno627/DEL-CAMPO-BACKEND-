import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { databaseUrl, uploadsDir } from '@del-campo/shared';

/** Public folder of the gateway (the SSG page /temporada/ is generated here at build time). */
export const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
export const SCHEMA_PATH = fileURLToPath(new URL('../../db/schema.sql', import.meta.url));

/**
 * Configuration of infrastructure (gateway + supervisor), read from the environment.
 * See .env.example: no secret has a real value in the repository.
 */
export function loadConfig(env = process.env, log = console) {
  const frontendUrl = env.FRONTEND_URL ?? 'http://localhost:5173';
  const allowedOrigins = (env.ALLOWED_ORIGINS ?? `${frontendUrl},http://127.0.0.1:5173`)
    .split(',').map((origin) => origin.trim()).filter(Boolean);

  let tokenSecret = env.TOKEN_SECRET;
  if (!tokenSecret) {
    // Without TOKEN_SECRET sessions would not survive a restart: acceptable only in development
    tokenSecret = randomBytes(32).toString('base64url');
    log.warn('[infrastructure] TOKEN_SECRET no está definido: se generó uno temporal (las sesiones se pierden al reiniciar)');
  }

  return {
    port: Number(env.PORT ?? 3000),
    frontendUrl,
    allowedOrigins,
    tokenSecret,
    databaseUrl: databaseUrl(),
    uploadsDir: uploadsDir(),
    publicDir: PUBLIC_DIR,
    isrRevalidateSeconds: Number(env.ISR_REVALIDATE_SECONDS ?? 60),
    // Node flags of each microservice: 6 processes + the gateway must fit in the 512 MB of Render Free.
    // Measured on one service: no flags ≈ 60 MB RSS; these defaults ≈ 54 MB; adding --lite-mode ≈ 49 MB (slower JIT).
    serviceNodeFlags: (env.SERVICE_NODE_FLAGS ?? '--max-old-space-size=64 --max-semi-space-size=1').split(/\s+/).filter(Boolean),
  };
}
