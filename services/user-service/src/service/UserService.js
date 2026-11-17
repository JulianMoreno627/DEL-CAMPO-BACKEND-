import { Coordinate } from '../model/Coordinate.js';
import { AvatarStorage } from '../repository/AvatarStorage.js';

/** Queries over the users and the profile of the acting user (data and photo). */
export class UserService {
  constructor({ userRepo, avatarStorage, log = console }) {
    this.userRepo = userRepo;
    this.avatarStorage = avatarStorage;
    this.log = log;
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

  /** Edits the profile of the user; optimistic concurrency (another device may have edited it). */
  async updateProfile(userId, changes) {
    const user = await this.userRepo.getOrFail(userId);
    const readVersion = user.version;
    if (user.updateProfile(changes).length) await this.userRepo.save(user, { expectedVersion: readVersion });
    return user;
  }

  /** Replaces the profile photo; the previous one is deleted so it does not fill the free storage. */
  async uploadAvatar(userId, photo) {
    AvatarStorage.validate(photo);
    const user = await this.userRepo.getOrFail(userId);
    const readVersion = user.version;
    const url = await this.avatarStorage.save(photo);
    const previous = user.changeAvatar(url);
    try {
      await this.userRepo.save(user, { expectedVersion: readVersion });
    } catch (error) {
      await this.#discard(url); // the new photo could not be linked
      throw error;
    }
    await this.#discard(previous);
    return user;
  }

  getAvatar(fileName) {
    return this.avatarStorage.get(fileName);
  }

  async #discard(url) {
    await this.avatarStorage.delete(url).catch((error) =>
      this.log.warn?.(`[user] could not delete the photo ${url}: ${error.message}`));
  }
}
