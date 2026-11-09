import { ServiceUnavailable } from '@del-campo/shared';

/**
 * gRPC client of pricing-service (delcampo.pricing.PricingService).
 * The price evaluation is auxiliary information: if pricing-service does not answer,
 * the catalog is still shown, with every price as NO_REFERENCE.
 */
export class PricingClient {
  /** @param {import('@del-campo/shared').GrpcClient} grpc */
  constructor(grpc, { log = console } = {}) {
    this.grpc = grpc;
    this.log = log;
  }

  /**
   * @param {{product: string, price: number}[]} items
   * @returns {Promise<{evaluation: string, reference: object|null}[]>} same order as items
   */
  async evaluate(items) {
    if (items.length === 0) return [];
    try {
      return (await this.grpc.call('EvaluatePrices', { items })).items;
    } catch (error) {
      if (!(error instanceof ServiceUnavailable)) throw error;
      this.log.warn?.(`[catalog] pricing-service unavailable: ${error.message}`);
      return items.map(() => ({ evaluation: 'NO_REFERENCE', reference: null }));
    }
  }
}
