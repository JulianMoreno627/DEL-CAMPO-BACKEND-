/** gRPC client of cart-service: the internal operations the checkout saga needs. */
export class CartClient {
  /** @param {import('@del-campo/shared').GrpcClient} grpc */
  constructor(grpc) {
    this.grpc = grpc;
  }

  /** @returns {Promise<{listingId: string, quantity: number}[]>} */
  async items(buyerId) {
    return (await this.grpc.call('GetCartItems', { buyerId })).items;
  }

  async empty(buyerId) {
    await this.grpc.call('EmptyCart', { buyerId });
  }
}
