import { unary } from '@del-campo/shared';
import { registerFromMessage, loginFromMessage, nearbyFromMessage } from './dto/userDto.js';

/**
 * gRPC API of user-service: the ONLY file of the service that knows gRPC.
 * It registers delcampo.user.UserService (proto/user.proto), converts messages ↔ DTOs
 * and delegates to the controller. It is how the rest of the microservices talk to this one.
 *
 * @param {import('@del-campo/shared').GrpcServer} server
 * @param {import('./controller/UserController.js').UserController} controller
 */
export function registerUserGrpcApi(server, controller) {
  server.addService('user', {
    register: unary((message) => controller.register(registerFromMessage(message))),
    login: unary((message) => controller.login(loginFromMessage(message))),
    getUser: unary(({ id }) => controller.getUser(id)),
    getUsersByIds: unary(async ({ ids }) => ({ users: await controller.getUsersByIds(ids) })),
    listProducers: unary(async () => ({ users: await controller.listProducers() })),
    nearbyProducers: unary(async (message) => ({ producers: await controller.nearbyProducers(nearbyFromMessage(message)) })),
  });
}
