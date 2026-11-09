/**
 * gRPC client of catalog-service: reservations (and their compensation) and the listing data
 * used to enrich the orders. order-service never reads the harvest table.
 */
export class CatalogClient {
  /** @param {import('@del-campo/shared').GrpcClient} grpc */
  constructor(grpc) {
    this.grpc = grpc;
  }

  /** @returns {Promise<{producerId: string, unitPrice: number}>} the reserved harvest */
  reserve(harvestId, quantity) {
    return this.grpc.call('ReserveHarvest', { harvestId, quantity });
  }

  release(harvestId, quantity) {
    return this.grpc.call('ReleaseHarvest', { harvestId, quantity });
  }

  async getHarvestsByIds(ids) {
    if (ids.length === 0) return [];
    return (await this.grpc.call('GetHarvestsByIds', { ids })).harvests;
  }
}
