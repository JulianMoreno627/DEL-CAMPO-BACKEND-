import { startService, databaseUrl } from '@del-campo/shared';
import { createContainer } from './container.js';
import { registerPricingGrpcApi } from './PricingGrpcApi.js';

const env = process.env;
const container = await createContainer({
  databaseUrl: databaseUrl(),
  marketApi: {
    url: env.MARKET_PRICES_API_URL || null,
    token: env.MARKET_PRICES_API_TOKEN || null,
    timeoutMs: Number(env.MARKET_PRICES_API_TIMEOUT_MS ?? 4000),
    cacheTtlMs: Number(env.MARKET_PRICES_CACHE_TTL_MS ?? 6 * 3_600_000),
  },
  // AI listing assistant: the keys only come from the environment (never from the code)
  ai: {
    gemini: { apiKey: env.GEMINI_API_KEY || null, model: env.GEMINI_MODEL || undefined },
    groq: { apiKey: env.GROQ_API_KEY || null, model: env.GROQ_MODEL || undefined },
    timeoutMs: Number(env.AI_TIMEOUT_MS ?? 8000),
  },
});
console.log(`[pricing] asistente de IA: ${container.listingAssistant.recognizers.map((r) => r.name).join(' → ') || 'desactivado (sin claves)'}`);
// Warm the cache in the background (does not delay the start)
container.pricingService.refresh().catch((error) => console.error('[pricing]', error.message));

await startService({
  name: 'pricing',
  register: (server) => registerPricingGrpcApi(server, container.controller),
  onStop: container.close,
});
