/**
 * gRPC client of order-service (delcampo.order.OrderService).
 * catalog-service never reads purchase_order: it asks here whether a listing has orders.
 */
export class OrderClient {
  /** @param {import('@del-campo/shared').GrpcClient} grpc */
  constructor(grpc) {
    this.grpc = grpc;
  }

  async hasOrdersForHarvest(harvestId) {
    return (await this.grpc.call('HasOrdersForHarvest', { harvestId })).hasOrders;
  }
}
