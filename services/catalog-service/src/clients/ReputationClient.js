/** gRPC client of reputation-service (delcampo.reputation.ReputationService). */
export class ReputationClient {
  /** @param {import('@del-campo/shared').GrpcClient} grpc */
  constructor(grpc) {
    this.grpc = grpc;
  }

  getReputation(userId) {
    return this.grpc.call('GetReputation', { userId });
  }
}
