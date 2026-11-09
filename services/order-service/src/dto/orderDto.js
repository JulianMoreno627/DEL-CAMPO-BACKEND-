/** DTOs of order-service and their mapping from / to proto/order.proto. */

export function toOrderDto(order) {
  const o = order.toJSON();
  return {
    id: o.id,
    version: o.version,
    updatedAt: o.updatedAt,
    harvestId: o.harvestId,
    producerId: o.producerId,
    buyerId: o.buyerId,
    quantity: o.quantity,
    unitPrice: o.unitPrice,
    total: o.total,
    status: o.status,
    completed: order.completed,
  };
}

export const toOrderDetailDto = ({ order, product, unit, availableOn, producerName, buyerName }) =>
  ({ order: toOrderDto(order), product, unit, availableOn, producerName, buyerName });

export const toCheckoutDto = ({ orders, total }) => ({ orders: orders.map(toOrderDto), total });

export const createOrderFromMessage = ({ harvestId, quantity }) => ({ harvestId, quantity });
