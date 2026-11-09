/**
 * gRPC client of order-service: before accepting a rating, the order must exist,
 * the user must be one of its parties and it must be delivered. reputation-service never
 * reads purchase_order.
 */
export class OrderClient {
  /** @param {import('@del-campo/shared').GrpcClient} grpc */
  constructor(grpc) {
    this.grpc = grpc;
  }

  /** @returns {Promise<{id, buyerId, producerId, status, completed}>} */
  getOrder(id) {
    return this.grpc.call('GetOrder', { id });
  }
}
