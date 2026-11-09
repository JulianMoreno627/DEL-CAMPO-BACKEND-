import { createPool, waitForDatabase } from '@del-campo/shared';
import { InMemoryMarketPriceRepository, PostgresMarketPriceRepository } from './repository/MarketPriceRepository.js';
import { MarketPriceRestClient } from './clients/MarketPriceRestClient.js';
import { PricingService } from './service/PricingService.js';
import { PricingController } from './controller/PricingController.js';
import { demoPrices } from './seed.js';

/**
 * Composition root of pricing-service.
 *
 * @param {object} [options]
 * @param {string|null} [options.databaseUrl]
 * @param {object} [options.marketApi] { url, timeoutMs, token, cacheTtlMs } of the external REST source
 * @param {import('./clients/MarketPriceProvider.js').MarketPriceProvider} [options.provider] replaces the REST client (tests)
 */
export async function createContainer({ databaseUrl = null, marketApi = {}, provider } = {}) {
  const pool = databaseUrl ? createPool(databaseUrl) : null;
  if (pool) await waitForDatabase(pool);

  const priceRepo = pool ? new PostgresMarketPriceRepository({ pool }) : new InMemoryMarketPriceRepository();
  if ((await priceRepo.findAll()).length === 0) await priceRepo.saveAll(demoPrices());

  const restProvider = provider
    ?? (marketApi.url ? new MarketPriceRestClient({ url: marketApi.url, timeoutMs: marketApi.timeoutMs, token: marketApi.token }) : null);
  const pricingService = new PricingService({ priceRepo, provider: restProvider, cacheTtlMs: marketApi.cacheTtlMs });
  const controller = new PricingController({ pricingService });

  return { priceRepo, pricingService, controller, close: async () => pool?.end() };
}
