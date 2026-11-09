import { GrpcClient, createPool, waitForDatabase } from '@del-campo/shared';
import { EventBus } from './model/EventBus.js';
import { InMemoryOrderRepository, PostgresOrderRepository } from './repository/OrderRepository.js';
import { CatalogClient } from './clients/CatalogClient.js';
import { CartClient } from './clients/CartClient.js';
import { UserClient } from './clients/UserClient.js';
import { OrderService } from './service/OrderService.js';
import { CheckoutSaga } from './service/CheckoutSaga.js';
import { OrderController } from './controller/OrderController.js';

/**
 * Composition root of order-service.
 *
 * @param {object} [options]
 * @param {string|null} [options.databaseUrl]
 * @param {object} [options.clients] { catalogClient, cartClient, userClient } (tests inject doubles)
 * @param {object} [options.log]
 * @param {number} [options.retryDelayMs] wait between compensation attempts of the saga
 */
export async function createContainer({ databaseUrl = null, clients = {}, log = console, retryDelayMs } = {}) {
  const pool = databaseUrl ? createPool(databaseUrl) : null;
  if (pool) await waitForDatabase(pool);

  const orderRepo = pool ? new PostgresOrderRepository({ pool }) : new InMemoryOrderRepository();

  const grpcClients = [];
  const remote = (service) => {
    const client = new GrpcClient(service);
    grpcClients.push(client);
    return client;
  };
  const catalogClient = clients.catalogClient ?? new CatalogClient(remote('catalog'));
  const cartClient = clients.cartClient ?? new CartClient(remote('cart'));
  const userClient = clients.userClient ?? new UserClient(remote('user'));

  const bus = new EventBus();
  const orderService = new OrderService({ orderRepo, catalogClient, userClient, bus, log });
  const checkoutSaga = new CheckoutSaga({ orderRepo, cartClient, catalogClient, orderService, bus, log, retryDelayMs });
  const controller = new OrderController({ orderService, checkoutSaga });

  return {
    bus, orderRepo, orderService, checkoutSaga, controller,
    close: async () => {
      for (const client of grpcClients) client.close();
      await pool?.end();
    },
  };
}
