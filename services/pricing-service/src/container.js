import { createPool, waitForDatabase } from '@del-campo/shared';
import { InMemoryMarketPriceRepository, PostgresMarketPriceRepository } from './repository/MarketPriceRepository.js';
import { MarketPriceRestClient } from './clients/MarketPriceRestClient.js';
import { GeminiRestClient } from './clients/GeminiRestClient.js';
import { GroqRestClient } from './clients/GroqRestClient.js';
import { PricingService } from './service/PricingService.js';
import { ListingAssistantService } from './service/ListingAssistantService.js';
import { PricingController } from './controller/PricingController.js';
import { demoPrices } from './seed.js';

/**
 * Composition root of pricing-service.
 *
 * @param {object} [options]
 * @param {string|null} [options.databaseUrl]
 * @param {object} [options.marketApi] { url, timeoutMs, token, cacheTtlMs } of the external REST source
 * @param {import('./clients/MarketPriceProvider.js').MarketPriceProvider} [options.provider] replaces the REST client (tests)
 * @param {object} [options.ai] { gemini: {apiKey, model}, groq: {apiKey, model}, timeoutMs, limit } of the AI assistant
 * @param {import('./clients/ProductRecognizer.js').ProductRecognizer[]} [options.recognizers] replace the AI clients (tests)
 */
export async function createContainer({ databaseUrl = null, marketApi = {}, provider, ai = {}, recognizers } = {}) {
  const pool = databaseUrl ? createPool(databaseUrl) : null;
  if (pool) await waitForDatabase(pool);

  const priceRepo = pool ? new PostgresMarketPriceRepository({ pool }) : new InMemoryMarketPriceRepository();
  if ((await priceRepo.findAll()).length === 0) await priceRepo.saveAll(demoPrices());

  const restProvider = provider
    ?? (marketApi.url ? new MarketPriceRestClient({ url: marketApi.url, timeoutMs: marketApi.timeoutMs, token: marketApi.token }) : null);
  const pricingService = new PricingService({ priceRepo, provider: restProvider, cacheTtlMs: marketApi.cacheTtlMs });

  // AI providers in order of preference: Gemini first, Groq as fallback (only the ones with an API key)
  const aiClients = recognizers ?? [
    ai.gemini?.apiKey && new GeminiRestClient({ apiKey: ai.gemini.apiKey, model: ai.gemini.model, timeoutMs: ai.timeoutMs }),
    ai.groq?.apiKey && new GroqRestClient({ apiKey: ai.groq.apiKey, model: ai.groq.model, timeoutMs: ai.timeoutMs }),
  ].filter(Boolean);
  const listingAssistant = new ListingAssistantService({ recognizers: aiClients, pricingService, limit: ai.limit });

  const controller = new PricingController({ pricingService, listingAssistant });
  return { priceRepo, pricingService, listingAssistant, controller, close: async () => pool?.end() };
}
