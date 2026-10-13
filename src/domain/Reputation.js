import { Entity } from './Entity.js';
import { DomainError } from './errors.js';

/** Rating that one party of an order gives to the other. */
export class Rating extends Entity {
  constructor({ orderId, fromUserId, toUserId, scores, comment = '', ...base }) {
    super(base);
    if (!orderId || !fromUserId || !toUserId) throw new DomainError('Calificación incompleta');
    if (fromUserId === toUserId) throw new DomainError('No puede calificarse a sí mismo');
    for (const [criterion, value] of Object.entries(scores ?? {})) {
      if (!Number.isInteger(value) || value < 1 || value > 5) {
        throw new DomainError(`Puntaje de "${criterion}" debe ser un entero de 1 a 5`);
      }
    }
    this.orderId = orderId;
    this.fromUserId = fromUserId;
    this.toUserId = toUserId;
    this.scores = scores;
    this.comment = comment;
  }

  get average() {
    const values = Object.values(this.scores);
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      orderId: this.orderId,
      fromUserId: this.fromUserId,
      toUserId: this.toUserId,
      scores: this.scores,
      comment: this.comment,
    };
  }
}

/**
 * Value object that summarizes a user's reputation.
 * Uses a Bayesian average: with few ratings the score stays close to the global mean (3.5),
 * so a new user with a single 5 (or 1) does not end up at the extremes.
 */
export class Reputation {
  static PRIOR_MEAN = 3.5;
  static PRIOR_WEIGHT = 3;

  constructor(ratings = []) {
    this.total = ratings.length;
    this.byCriterion = {};
    const sums = {};
    for (const rating of ratings) {
      for (const [criterion, value] of Object.entries(rating.scores)) {
        sums[criterion] ??= { sum: 0, count: 0 };
        sums[criterion].sum += value;
        sums[criterion].count += 1;
      }
    }
    for (const [criterion, { sum, count }] of Object.entries(sums)) {
      this.byCriterion[criterion] = Number((sum / count).toFixed(2));
    }
    const sumOfAverages = ratings.reduce((a, rating) => a + rating.average, 0);
    this.score = Number(
      ((Reputation.PRIOR_MEAN * Reputation.PRIOR_WEIGHT + sumOfAverages) / (Reputation.PRIOR_WEIGHT + this.total)).toFixed(2),
    );
  }

  get level() {
    if (this.total < 3) return 'NEW';
    if (this.score >= 4.3) return 'TRUSTED';
    if (this.score >= 3) return 'REGULAR';
    return 'AT_RISK';
  }

  toJSON() {
    return { total: this.total, score: this.score, level: this.level, byCriterion: this.byCriterion };
  }
}
