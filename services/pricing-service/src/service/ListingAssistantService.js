import { DomainError } from '@del-campo/shared';
import { ListingSuggestion } from '../model/ListingSuggestion.js';

const IMAGE_TYPES = ['image/webp', 'image/jpeg', 'image/png'];
const MAX_BYTES = 600 * 1024;

/**
 * AI listing assistant ("Publica con una foto"): the producer takes a photo and gets the listing
 * filled in (name, category, unit, description) plus the fair price of the product.
 *
 * - The recognizers are tried in order (Gemini first, Groq as fallback): if one fails, times out
 *   or used up its free quota, the next one answers and the producer does not notice.
 * - Each producer can use it a limited number of times per window, so nobody burns the free quota.
 * - It only SUGGESTS: the producer reviews everything before publishing.
 */
export class ListingAssistantService {
  /**
   * @param {object} deps
   * @param {import('../clients/ProductRecognizer.js').ProductRecognizer[]} deps.recognizers in order of preference
   * @param {import('./PricingService.js').PricingService} deps.pricingService
   * @param {object} [deps.limit] { maxRequests, windowMs } per producer
   * @param {object} [deps.log]
   */
  constructor({ recognizers, pricingService, limit = { maxRequests: 10, windowMs: 10 * 60_000 }, log = console }) {
    this.recognizers = recognizers;
    this.pricingService = pricingService;
    this.limit = limit;
    this.log = log;
    this.usage = new Map(); // userId -> timestamps of the recent requests
  }

  get enabled() {
    return this.recognizers.length > 0;
  }

  /**
   * @param {string} userId who asks (one rate limit per producer)
   * @param {{content: Buffer, contentType: string}} photo
   * @returns {Promise<{suggestion: ListingSuggestion, reference: object|null}>}
   */
  async suggest(userId, photo) {
    if (!IMAGE_TYPES.includes(photo.contentType) || !photo.content?.length) throw new DomainError('Envíe una imagen WebP, JPEG o PNG');
    if (photo.content.length > MAX_BYTES) throw new DomainError('Archivo o cuerpo demasiado grande', 413);
    if (!this.enabled) throw new DomainError('El asistente de IA no está configurado en este servidor', 503);
    this.#checkLimit(userId);

    const suggestion = await this.#recognize(photo);
    const reference = suggestion.recognized ? await this.pricingService.closestReference(suggestion.product) : null;
    return { suggestion, reference };
  }

  async #recognize(photo) {
    for (const recognizer of this.recognizers) {
      try {
        return new ListingSuggestion(await recognizer.recognize(photo), recognizer.name);
      } catch (error) {
        this.log.warn?.(`[pricing] AI ${recognizer.name} failed: ${error.message}`);
      }
    }
    throw new DomainError('El asistente de IA no está disponible en este momento. Complete los datos a mano.', 503);
  }

  /** Sliding window per producer (kept in memory: it only protects the free quota of the AI). */
  #checkLimit(userId) {
    const now = Date.now();
    const recent = (this.usage.get(userId) ?? []).filter((time) => now - time < this.limit.windowMs);
    if (recent.length >= this.limit.maxRequests) {
      throw new DomainError('Ha usado el asistente muchas veces seguidas. Intente de nuevo en unos minutos.', 429);
    }
    recent.push(now);
    this.usage.set(userId, recent);
  }
}
