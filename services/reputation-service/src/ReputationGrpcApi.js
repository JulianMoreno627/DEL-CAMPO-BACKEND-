import { unary, currentContext } from '@del-campo/shared';
import { rateFromMessage } from './dto/reputationDto.js';

/**
 * gRPC API of reputation-service: the ONLY file of the service that knows gRPC.
 * Registers delcampo.reputation.ReputationService (proto/reputation.proto) and delegates to the controller.
 * Who rates comes from the metadata (x-user-id) that the gateway propagates.
 *
 * @param {import('@del-campo/shared').GrpcServer} server
 * @param {import('./controller/ReputationController.js').ReputationController} controller
 */
export function registerReputationGrpcApi(server, controller) {
  server.addService('reputation', {
    rate: unary((message) => controller.rate(currentContext().userId, rateFromMessage(message))),
    getReputation: unary(({ userId }) => controller.getReputation(userId)),
  });
}
