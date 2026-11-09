import { fileURLToPath } from 'node:url';

/**
 * Configuration read from environment variables. No secret has a default value here:
 * they only come from the environment (Render) or from a local .env that is never uploaded.
 */

/** gRPC port of each microservice (internal: they listen on 127.0.0.1 only). */
export const SERVICES = Object.freeze({
  user: { portEnv: 'USER_GRPC_PORT', defaultPort: 50051 },
  catalog: { portEnv: 'CATALOG_GRPC_PORT', defaultPort: 50052 },
  cart: { portEnv: 'CART_GRPC_PORT', defaultPort: 50053 },
  order: { portEnv: 'ORDER_GRPC_PORT', defaultPort: 50054 },
  reputation: { portEnv: 'REPUTATION_GRPC_PORT', defaultPort: 50055 },
  pricing: { portEnv: 'PRICING_GRPC_PORT', defaultPort: 50056 },
});

export function grpcPort(service) {
  const definition = SERVICES[service];
  if (!definition) throw new Error(`Unknown service: ${service}`);
  return Number(process.env[definition.portEnv] ?? definition.defaultPort);
}

export function grpcAddress(service) {
  return `${process.env.GRPC_HOST ?? '127.0.0.1'}:${grpcPort(service)}`;
}

/** Maximum time of a gRPC call (a call made inside another one never exceeds the parent's deadline). */
export const grpcDeadlineMs = () => Number(process.env.GRPC_DEADLINE_MS ?? 5000);

/** Neon connection string (pooled). Without it the services use in-memory repositories. */
export const databaseUrl = () => process.env.DATABASE_URL || null;

/**
 * Folder of the listing photos. catalog-service writes them and the gateway serves them at /uploads,
 * so both must read the same folder (they run on the same machine). Default: <repo>/data/uploads (ignored by git).
 */
export const uploadsDir = () => process.env.UPLOADS_DIR
  ?? fileURLToPath(new URL('../../../data/uploads/', import.meta.url));
