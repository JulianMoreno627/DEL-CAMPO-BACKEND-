import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { fileURLToPath } from 'node:url';

/** Folder with the shared .proto contracts (root of the monorepo). */
export const PROTO_DIR = process.env.PROTO_DIR ?? fileURLToPath(new URL('../../../../proto/', import.meta.url));

/**
 * keepCase:false → the snake_case fields of the .proto become camelCase in JS (product_id → productId).
 * defaults:true  → scalar fields always arrive; `optional` fields that were not set do NOT arrive
 *                  (that is how "not sent" is told apart from 0 or "").
 */
const LOADER_OPTIONS = {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: [PROTO_DIR],
};

/** [file, package, service] of each contract. */
const CONTRACTS = Object.freeze({
  health: ['health.proto', 'grpc.health.v1', 'Health'],
  user: ['user.proto', 'delcampo.user', 'UserService'],
  pricing: ['pricing.proto', 'delcampo.pricing', 'PricingService'],
  reputation: ['reputation.proto', 'delcampo.reputation', 'ReputationService'],
  catalog: ['catalog.proto', 'delcampo.catalog', 'CatalogService'],
  cart: ['cart.proto', 'delcampo.cart', 'CartService'],
  order: ['order.proto', 'delcampo.order', 'OrderService'],
});

const cache = new Map();

/**
 * Loads a service contract.
 * @param {keyof CONTRACTS} name
 * @returns {{ Client: Function, definition: object, fullName: string }}
 *   Client: constructor of the client stub; definition: what grpc.Server#addService expects.
 */
export function loadContract(name) {
  if (cache.has(name)) return cache.get(name);
  const entry = CONTRACTS[name];
  if (!entry) throw new Error(`Unknown contract: ${name}`);
  const [file, packageName, serviceName] = entry;
  const root = grpc.loadPackageDefinition(protoLoader.loadSync(file, LOADER_OPTIONS));
  const Client = packageName.split('.').reduce((node, key) => node[key], root)[serviceName];
  const contract = { Client, definition: Client.service, fullName: `${packageName}.${serviceName}` };
  cache.set(name, contract);
  return contract;
}
