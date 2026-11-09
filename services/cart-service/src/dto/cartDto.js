/**
 * DTOs of cart-service and their mapping from / to proto/cart.proto.
 * A line whose listing no longer exists travels with found = false.
 */

export function toCartLineDto(line) {
  if (line.product === null) {
    return { listingId: line.listingId, quantity: line.quantity, found: false, subtotal: 0, available: false };
  }
  return {
    listingId: line.listingId,
    quantity: line.quantity,
    found: true,
    product: line.product,
    photo: line.photo ?? undefined,
    unit: line.unit,
    price: line.price,
    subtotal: line.subtotal,
    availableQuantity: line.availableQuantity,
    available: line.available,
  };
}

export const toCartViewDto = ({ items, total }) => ({ items: items.map(toCartLineDto), total });

export const itemFromMessage = ({ listingId, quantity }) => ({ listingId, quantity });

export const toCartItemsDto = (items) => ({ items: items.map(({ listingId, quantity }) => ({ listingId, quantity })) });
