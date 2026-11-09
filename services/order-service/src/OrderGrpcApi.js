import { unary, currentContext } from '@del-campo/shared';
import { createOrderFromMessage } from './dto/orderDto.js';

/**
 * gRPC API of order-service: the ONLY file of the service that knows gRPC.
 * Registers delcampo.order.OrderService (proto/order.proto) and delegates to the controller.
 * The acting user comes from the metadata (x-user-id, x-user-role) that the gateway propagates.
 *
 * @param {import('@del-campo/shared').GrpcServer} server
 * @param {import('./controller/OrderController.js').OrderController} controller
 */
export function registerOrderGrpcApi(server, controller) {
  server.addService('order', {
    checkoutCart: unary(() => controller.checkoutCart(currentContext().userId)),
    createOrder: unary((message) => controller.createOrder(currentContext().userId, createOrderFromMessage(message))),
    listOrders: unary(async () => {
      const { userId, role } = currentContext();
      return { orders: await controller.listOrders(userId, role) };
    }),
    changeOrderStatus: unary(({ id, status }) => controller.changeOrderStatus(id, status, currentContext().userId)),
    // Internal (reputation-service, catalog-service)
    getOrder: unary(({ id }) => controller.getOrder(id)),
    hasOrdersForHarvest: unary(async ({ harvestId }) => ({ hasOrders: await controller.hasOrdersForHarvest(harvestId) })),
  });
}
