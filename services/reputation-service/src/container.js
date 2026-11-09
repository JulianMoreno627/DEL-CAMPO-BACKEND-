import { GrpcClient, createPool, waitForDatabase } from '@del-campo/shared';
import { Rating } from './model/Reputation.js';
import { InMemoryRatingRepository, PostgresRatingRepository } from './repository/RatingRepository.js';
import { OrderClient } from './clients/OrderClient.js';
import { UserClient } from './clients/UserClient.js';
import { ReputationService } from './service/ReputationService.js';
import { ReputationController } from './controller/ReputationController.js';

/**
 * Composition root of reputation-service.
 *
 * @param {object} [options]
 * @param {string|null} [options.databaseUrl]
 * @param {object} [options.clients] { orderClient, userClient } (tests inject doubles)
 * @param {object[]} [options.ratings] initial ratings (tests)
 */
export async function createContainer({ databaseUrl = null, clients = {}, ratings = [] } = {}) {
  const pool = databaseUrl ? createPool(databaseUrl) : null;
  if (pool) await waitForDatabase(pool);

  const ratingRepo = pool ? new PostgresRatingRepository({ pool }) : new InMemoryRatingRepository();
  for (const data of ratings) await ratingRepo.save(new Rating(data));

  const grpcClients = [];
  const remote = (service) => {
    const client = new GrpcClient(service);
    grpcClients.push(client);
    return client;
  };
  const orderClient = clients.orderClient ?? new OrderClient(remote('order'));
  const userClient = clients.userClient ?? new UserClient(remote('user'));

  const reputationService = new ReputationService({ ratingRepo, orderClient, userClient });
  const controller = new ReputationController({ reputationService });

  return {
    ratingRepo, reputationService, controller,
    close: async () => {
      for (const client of grpcClients) client.close();
      await pool?.end();
    },
  };
}
