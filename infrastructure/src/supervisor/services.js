import { fileURLToPath } from 'node:url';

const entry = (folder) => fileURLToPath(new URL(`../../../services/${folder}/src/server.js`, import.meta.url));

/**
 * The microservices of the monorepo, in start order (user first: it creates the demo accounts).
 * They do not depend on each other to start: the gRPC clients connect when they are first used.
 */
export const MICROSERVICES = Object.freeze([
  { name: 'user', entry: entry('user-service') },
  { name: 'pricing', entry: entry('pricing-service') },
  { name: 'reputation', entry: entry('reputation-service') },
  { name: 'catalog', entry: entry('catalog-service') },
  { name: 'cart', entry: entry('cart-service') },
  { name: 'order', entry: entry('order-service') },
]);
