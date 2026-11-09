import { unary, currentContext } from '@del-campo/shared';
import { itemFromMessage } from './dto/cartDto.js';

/** The buyer, propagated by the gateway in the metadata (x-user-id). */
const buyer = () => currentContext().userId;

/**
 * gRPC API of cart-service: the ONLY file of the service that knows gRPC.
 * Registers delcampo.cart.CartService (proto/cart.proto) and delegates to the controller.
 *
 * @param {import('@del-campo/shared').GrpcServer} server
 * @param {import('./controller/CartController.js').CartController} controller
 */
export function registerCartGrpcApi(server, controller) {
  server.addService('cart', {
    getCart: unary(() => controller.getCart(buyer())),
    addItem: unary((message) => controller.addItem(buyer(), itemFromMessage(message))),
    changeItemQuantity: unary((message) => controller.changeItemQuantity(buyer(), itemFromMessage(message))),
    removeItem: unary((message) => controller.removeItem(buyer(), itemFromMessage(message))),
    clearCart: unary(() => controller.clearCart(buyer())),
    // Internal (checkout saga): the buyer is explicit in the request
    getCartItems: unary(({ buyerId }) => controller.getCartItems(buyerId)),
    emptyCart: unary(async ({ buyerId }) => { await controller.emptyCart(buyerId); return {}; }),
  });
}
