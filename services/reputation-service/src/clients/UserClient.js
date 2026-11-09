/**
 * gRPC client of user-service: the rated user (Producer or Buyer) defines its own
 * rating criteria (polymorphism), which travel in the User message.
 */
export class UserClient {
  /** @param {import('@del-campo/shared').GrpcClient} grpc */
  constructor(grpc) {
    this.grpc = grpc;
  }

  /** @returns {Promise<string[]>} */
  async ratingCriteriaOf(userId) {
    return (await this.grpc.call('GetUser', { id: userId })).ratingCriteria;
  }
}
