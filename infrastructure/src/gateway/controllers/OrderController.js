import { orderJson, orderDetailJson, ratingJson, reputationJson } from '../restMappers.js';

/** REST ↔ gRPC: orders (order-service) and two-way reputation (reputation-service). */
export class OrderController {
  /** @param {{order: import('@del-campo/shared').GrpcClient, reputation: import('@del-campo/shared').GrpcClient}} clients */
  constructor({ order, reputation }) {
    this.order = order;
    this.reputation = reputation;
  }

  list = async (_req, res) => {
    const { orders } = await this.order.call('ListOrders');
    res.json(orders.map(orderDetailJson));
  };

  create = async (req, res) => {
    const { harvestId, quantity } = req.body ?? {};
    res.status(201).json(orderJson(await this.order.call('CreateOrder', { harvestId, quantity })));
  };

  changeStatus = async (req, res) => {
    res.json(orderJson(await this.order.call('ChangeOrderStatus', { id: req.params.id, status: req.body?.status })));
  };

  rate = async (req, res) => {
    const { orderId, scores, comment } = req.body ?? {};
    const scoreMap = scores && typeof scores === 'object' && !Array.isArray(scores) ? scores : {};
    res.status(201).json(ratingJson(await this.reputation.call('Rate', { orderId, scores: scoreMap, comment })));
  };

  reputationOf = async (req, res) => {
    res.json(reputationJson(await this.reputation.call('GetReputation', { userId: req.params.id })));
  };
}
