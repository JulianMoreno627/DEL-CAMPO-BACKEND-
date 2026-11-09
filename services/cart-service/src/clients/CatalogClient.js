import { NotFound } from '@del-campo/shared';

/**
 * gRPC client of catalog-service. cart-service never reads the harvest table:
 * it asks catalog-service for the listings (price, free quantity and whether they accept reservations).
 */
export class CatalogClient {
  /** @param {import('@del-campo/shared').GrpcClient} grpc */
  constructor(grpc) {
    this.grpc = grpc;
  }

  /** @returns {Promise<object[]>} Harvest messages; missing ids are skipped */
  async getHarvestsByIds(ids) {
    if (ids.length === 0) return [];
    return (await this.grpc.call('GetHarvestsByIds', { ids })).harvests;
  }

  async getHarvest(id) {
    const [harvest] = await this.getHarvestsByIds([id]);
    if (!harvest) throw new NotFound('Cosecha');
    return harvest;
  }
}
