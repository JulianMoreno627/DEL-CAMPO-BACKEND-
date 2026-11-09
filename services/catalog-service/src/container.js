import { GrpcClient, createPool, waitForDatabase, uploadsDir } from '@del-campo/shared';
import { EventBus } from './model/EventBus.js';
import { Harvest } from './model/Harvest.js';
import { InMemoryHarvestRepository, PostgresHarvestRepository } from './repository/HarvestRepository.js';
import { InMemorySyncOperationRepository, PostgresSyncOperationRepository } from './repository/SyncOperationRepository.js';
import { PhotoStorage } from './repository/PhotoStorage.js';
import { UserClient } from './clients/UserClient.js';
import { PricingClient } from './clients/PricingClient.js';
import { ReputationClient } from './clients/ReputationClient.js';
import { OrderClient } from './clients/OrderClient.js';
import { HarvestService } from './service/HarvestService.js';
import { ListingService } from './service/ListingService.js';
import { CatalogService } from './service/CatalogService.js';
import { SyncService } from './service/SyncService.js';
import { CatalogController } from './controller/CatalogController.js';

/**
 * Composition root of catalog-service.
 *
 * @param {object} [options]
 * @param {string|null} [options.databaseUrl]
 * @param {string} [options.photosDir]
 * @param {object} [options.clients] { userClient, pricingClient, reputationClient, orderClient } (tests inject fakes)
 * @param {object[]} [options.harvests] initial harvests (tests)
 */
export async function createContainer({ databaseUrl = null, photosDir = uploadsDir(), clients = {}, harvests = [] } = {}) {
  const pool = databaseUrl ? createPool(databaseUrl) : null;
  if (pool) await waitForDatabase(pool);

  const harvestRepo = pool ? new PostgresHarvestRepository({ pool }) : new InMemoryHarvestRepository();
  const syncRepo = pool ? new PostgresSyncOperationRepository({ pool }) : new InMemorySyncOperationRepository();
  for (const data of harvests) await harvestRepo.save(new Harvest(data));

  const grpcClients = [];
  const remote = (service) => {
    const client = new GrpcClient(service);
    grpcClients.push(client);
    return client;
  };
  const userClient = clients.userClient ?? new UserClient(remote('user'));
  const pricingClient = clients.pricingClient ?? new PricingClient(remote('pricing'));
  const reputationClient = clients.reputationClient ?? new ReputationClient(remote('reputation'));
  const orderClient = clients.orderClient ?? new OrderClient(remote('order'));

  const bus = new EventBus();
  const photoStorage = new PhotoStorage({ directory: photosDir });
  const harvestService = new HarvestService({ harvestRepo, userClient, photoStorage, bus });
  const listingService = new ListingService({ harvestRepo, harvestService, userClient, orderClient, bus });
  const catalogService = new CatalogService({ harvestRepo, userClient, pricingClient, reputationClient });
  const syncService = new SyncService({ harvestService, harvestRepo, syncRepo });
  const controller = new CatalogController({ listingService, harvestService, catalogService, syncService, bus });

  return {
    bus, harvestRepo, syncRepo, harvestService, listingService, catalogService, syncService, controller,
    close: async () => {
      for (const client of grpcClients) client.close();
      await pool?.end();
    },
  };
}
