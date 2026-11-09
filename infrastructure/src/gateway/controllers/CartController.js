import { cartJson, checkoutJson } from '../restMappers.js';

/**
 * REST ↔ gRPC: cart (cart-service) and checkout (order-service, which runs the saga).
 * The buyer is the session user, propagated in the metadata.
 */
export class CartController {
  /** @param {{cart: import('@del-campo/shared').GrpcClient, order: import('@del-campo/shared').GrpcClient}} clients */
  constructor({ cart, order }) {
    this.cart = cart;
    this.order = order;
  }

  view = async (_req, res) => {
    res.json(cartJson(await this.cart.call('GetCart')));
  };

  add = async (req, res) => {
    const { listingId, quantity = 1 } = req.body ?? {};
    res.status(201).json(cartJson(await this.cart.call('AddItem', { listingId, quantity })));
  };

  changeQuantity = async (req, res) => {
    res.json(cartJson(await this.cart.call('ChangeItemQuantity', { listingId: req.params.listingId, quantity: req.body?.quantity })));
  };

  remove = async (req, res) => {
    res.json(cartJson(await this.cart.call('RemoveItem', { listingId: req.params.listingId })));
  };

  clear = async (_req, res) => {
    res.json(cartJson(await this.cart.call('ClearCart')));
  };

  checkout = async (_req, res) => {
    res.status(201).json(checkoutJson(await this.order.call('CheckoutCart')));
  };
}
