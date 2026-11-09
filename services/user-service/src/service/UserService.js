import { Coordinate } from '../model/Coordinate.js';

/** Read queries over the users. */
export class UserService {
  constructor({ userRepo }) {
    this.userRepo = userRepo;
  }

  getUser(id) {
    return this.userRepo.getOrFail(id);
  }

  /** Missing ids are skipped: it is used to enrich lists in other services. */
  async getUsersByIds(ids) {
    const wanted = new Set(ids);
    return this.userRepo.list((user) => wanted.has(user.id));
  }

  listProducers() {
    return this.userRepo.list((user) => user.role === 'PRODUCER');
  }

  /** @returns {Promise<{ producer: import('../model/User.js').Producer, distanceKm: number }[]>} */
  async nearbyProducers({ lat, lng, radiusKm = 50 }) {
    const result = await this.userRepo.nearbyProducers(new Coordinate(lat, lng), Number(radiusKm));
    return result.map(({ producer, distanceKm }) => ({ producer, distanceKm: Number(distanceKm.toFixed(1)) }));
  }
}
