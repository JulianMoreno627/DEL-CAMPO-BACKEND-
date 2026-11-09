import { GrpcClient, createPool, waitForDatabase } from '@del-campo/shared';
import { InMemoryCartRepository, PostgresCartRepository } from './repository/CartRepository.js';
import { CatalogClient } from './clients/CatalogClient.js';
import { CartService } from './service/CartService.js';
import { CartController } from './controller/CartController.js';

/**
 * Composition root of cart-service.
 *
 * @param {object} [options]
 * @param {string|null} [options.databaseUrl]
 * @param {object} [options.catalogClient] test double of the catalog client
 */
export async function createContainer({ databaseUrl = null, catalogClient } = {}) {
  const pool = databaseUrl ? createPool(databaseUrl) : null;
  if (pool) await waitForDatabase(pool);

  const cartRepo = pool ? new PostgresCartRepository({ pool }) : new InMemoryCartRepository();
  const grpc = catalogClient ? null : new GrpcClient('catalog');
  const cartService = new CartService({ cartRepo, catalogClient: catalogClient ?? new CatalogClient(grpc) });
  const controller = new CartController({ cartService });

  return {
    cartRepo, cartService, controller,
    close: async () => {
      grpc?.close();
      await pool?.end();
    },
  };
}
