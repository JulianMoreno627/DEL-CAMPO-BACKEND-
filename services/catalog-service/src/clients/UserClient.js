/**
 * gRPC client of user-service (delcampo.user.UserService). catalog-service never reads the
 * app_user table: it asks for the producers' data here.
 * Users arrive as DTOs: { id, role, name, farm, village, town, location: {lat,lng}|null, ... }.
 */
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

  async listProducers() {
    return (await this.grpc.call('ListProducers')).users;
  }
}
