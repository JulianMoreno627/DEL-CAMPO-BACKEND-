import { randomBytes } from 'node:crypto';
import { InMemoryRepository } from './repositories/Repository.js';
import { UserRepository } from './repositories/UserRepository.js';
import { JsonPersistence } from './repositories/JsonPersistence.js';
import { Harvest } from './domain/Harvest.js';
import { Order } from './domain/Order.js';
import { Rating } from './domain/Reputation.js';
import { Cart } from './domain/Cart.js';
import { FairPriceCalculator, MarketPercentageStrategy } from './domain/FairPrice.js';
import { createUser } from './domain/User.js';
import { EventBus } from './services/EventBus.js';
import { CatalogService } from './services/CatalogService.js';
import { HarvestService } from './services/HarvestService.js';
import { OrderService } from './services/OrderService.js';
import { ReputationService } from './services/ReputationService.js';
import { SyncService } from './services/SyncService.js';
import { MetricsService } from './services/MetricsService.js';
import { AuthService } from './services/AuthService.js';
import { ListingService } from './services/ListingService.js';
import { CartService } from './services/CartService.js';
import * as seed from './data/seed.js';

/**
 * Composition root (manual dependency injection): here, and only here,
 * it is decided which concrete implementation each service receives.
 *
 * @param {object} options
 * @param {boolean} [options.withSeed] creates the demo accounts the first time
 * @param {boolean} [options.withDemoData] also loads sample products and ratings (tests only)
 * @param {string} [options.dataPath] JSON file where data is saved; without it everything stays in memory
 * @param {string} [options.tokenSecret] secret used to sign sessions
 */
export async function createContainer({ withSeed = true, withDemoData = false, dataPath = null, tokenSecret } = {}) {
  const persistence = dataPath ? new JsonPersistence(dataPath) : null;
  const hadData = (await persistence?.load()) ?? false;

  const bus = new EventBus();
  // Resource names are shown to the user in error messages ("Cosecha no encontrado"), so they stay in Spanish
  const userRepo = new UserRepository();
  const harvestRepo = new InMemoryRepository('Cosecha', (data) => new Harvest(data));
  const orderRepo = new InMemoryRepository('Reserva', (data) => new Order(data));
  const ratingRepo = new InMemoryRepository('Calificación', (data) => new Rating(data));
  const cartRepo = new InMemoryRepository('Carrito', (data) => new Cart(data));

  const priceCalculator = new FairPriceCalculator(new Map(seed.marketPrices), new MarketPercentageStrategy());

  const reputationService = new ReputationService({ ratingRepo, orderRepo, userRepo });
  const catalogService = new CatalogService({ harvestRepo, userRepo, priceCalculator, reputationService });
  const harvestService = new HarvestService({ harvestRepo, userRepo, bus });
  const orderService = new OrderService({ orderRepo, harvestRepo, userRepo, bus });
  const syncService = new SyncService({ harvestService, harvestRepo });
  const metricsService = new MetricsService();
  // Session secret: the environment variable, the saved one (sessions survive a restart) or a new one
  const secret = tokenSecret
    ?? (persistence?.initial.sessionSecret && Buffer.from(persistence.initial.sessionSecret, 'base64'))
    ?? randomBytes(32);
  const authService = new AuthService({ userRepo, secret });
  const listingService = new ListingService({ harvestRepo, userRepo, harvestService, bus });
  const cartService = new CartService({ cartRepo, harvestRepo, orderRepo, orderService });

  if (persistence) {
    persistence.repository('users', userRepo);
    persistence.repository('harvests', harvestRepo);
    persistence.repository('orders', orderRepo);
    persistence.repository('ratings', ratingRepo);
    persistence.repository('carts', cartRepo);
    persistence.register('credentials', {
      exportData: () => authService.exportCredentials(),
      importData: (rows) => authService.importCredentials(rows),
    });
    persistence.register('sessionSecret', { exportData: () => Buffer.from(secret).toString('base64'), importData: () => {} });
    authService.onChange = () => persistence.scheduleSave();
  }

  // Demo accounts are created only the first time; each producer publishes their own products
  if (withSeed && !hadData) {
    await Promise.all(seed.users.map(async ({ email, password, ...data }) => {
      await userRepo.save(createUser(data));
      await authService.addCredential(data.id, email, password);
    }));
    if (withDemoData) {
      for (const h of seed.harvests) await harvestRepo.save(new Harvest(h));
      for (const r of seed.ratings) await ratingRepo.save(new Rating(r));
    }
  }

  return {
    bus, userRepo, harvestRepo, orderRepo, ratingRepo, cartRepo, priceCalculator,
    catalogService, harvestService, orderService, reputationService, syncService, metricsService,
    authService, listingService, cartService, persistence,
  };
}
