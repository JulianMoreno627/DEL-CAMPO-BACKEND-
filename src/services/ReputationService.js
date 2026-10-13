import { Rating, Reputation } from '../domain/Reputation.js';
import { DomainError } from '../domain/errors.js';

/** Two-way reputation: buyers rate producers and vice versa. */
export class ReputationService {
  constructor({ ratingRepo, orderRepo, userRepo }) {
    this.ratingRepo = ratingRepo;
    this.orderRepo = orderRepo;
    this.userRepo = userRepo;
  }

  async rate({ orderId, fromUserId, scores, comment }) {
    const order = await this.orderRepo.getOrFail(orderId);
    // Only a real, finished transaction can be rated: prevents fake reviews between strangers.
    if (!order.completed) throw new DomainError('Solo se califica una reserva entregada', 409);

    let toUserId;
    if (fromUserId === order.buyerId) toUserId = order.producerId;
    else if (fromUserId === order.producerId) toUserId = order.buyerId;
    else throw new DomainError('No participó en esta reserva', 403);

    const alreadyRated = await this.ratingRepo.list((r) => r.orderId === orderId && r.fromUserId === fromUserId);
    if (alreadyRated.length) throw new DomainError('Ya calificó esta reserva', 409);

    // Polymorphism: the rated user (Producer or Buyer) defines its own criteria
    const ratedUser = await this.userRepo.getOrFail(toUserId);
    const expected = ratedUser.ratingCriteria();
    const received = Object.keys(scores ?? {});
    if (expected.length !== received.length || !expected.every((c) => received.includes(c))) {
      throw new DomainError(`Criterios esperados: ${expected.join(', ')}`);
    }

    const rating = new Rating({ orderId, fromUserId, toUserId, scores, comment });
    await this.ratingRepo.save(rating);
    return rating;
  }

  async reputationOf(userId) {
    const received = await this.ratingRepo.list((r) => r.toUserId === userId);
    return {
      ...new Reputation(received).toJSON(),
      recent: received
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 5)
        .map((r) => ({ scores: r.scores, comment: r.comment, date: r.updatedAt })),
    };
  }
}
