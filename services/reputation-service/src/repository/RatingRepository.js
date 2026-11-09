import { InMemoryRepository, PostgresRepository } from '@del-campo/shared';
import { Rating } from '../model/Reputation.js';

const factory = (data) => new Rating(data);

/** Ratings in memory (development and tests). */
export class InMemoryRatingRepository extends InMemoryRepository {
  constructor() {
    super('Calificación', factory);
  }
}

/** Table rating (owned by reputation-service). */
export class PostgresRatingRepository extends PostgresRepository {
  constructor({ pool }) {
    super({ pool, table: 'rating', resourceName: 'Calificación', factory });
  }
}
