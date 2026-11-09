/** gRPC client of user-service: buyer check and names to enrich the orders. */
export class UserClient {
  /** @param {import('@del-campo/shared').GrpcClient} grpc */
  constructor(grpc) {
    this.grpc = grpc;
  }

  getUser(id) {
    return this.grpc.call('GetUser', { id });
  }

  async getUsersByIds(ids) {
    if (ids.length === 0) return [];
    return (await this.grpc.call('GetUsersByIds', { ids })).users;
  }
}
