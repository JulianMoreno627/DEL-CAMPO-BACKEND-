import { toCartViewDto, toCartItemsDto } from '../dto/cartDto.js';

/** Receives DTOs (and the buyer), calls the service and returns DTOs (no gRPC details). */
export class CartController {
  constructor({ cartService }) {
    this.cartService = cartService;
  }

  async getCart(buyerId) {
    return toCartViewDto(await this.cartService.view(buyerId));
  }

  async addItem(buyerId, { listingId, quantity }) {
    return toCartViewDto(await this.cartService.add(buyerId, listingId, quantity));
  }

  async changeItemQuantity(buyerId, { listingId, quantity }) {
    return toCartViewDto(await this.cartService.changeQuantity(buyerId, listingId, quantity));
  }

  async removeItem(buyerId, { listingId }) {
    return toCartViewDto(await this.cartService.remove(buyerId, listingId));
  }

  async clearCart(buyerId) {
    return toCartViewDto(await this.cartService.clear(buyerId));
  }

  async getCartItems(buyerId) {
    return toCartItemsDto(await this.cartService.items(buyerId));
  }

  async emptyCart(buyerId) {
    await this.cartService.empty(buyerId);
  }
}
