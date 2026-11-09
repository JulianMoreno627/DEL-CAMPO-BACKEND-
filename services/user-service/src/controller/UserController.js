import { toUserDto, toSessionDto, toNearbyProducerDto } from '../dto/userDto.js';

/**
 * Receives DTOs, calls the services and returns DTOs. It knows nothing about gRPC:
 * the same controller could be exposed by another transport.
 */
export class UserController {
  constructor({ authService, userService }) {
    this.authService = authService;
    this.userService = userService;
  }

  async register(dto) {
    return toSessionDto(await this.authService.register(dto));
  }

  async login(dto) {
    return toSessionDto(await this.authService.login(dto));
  }

  async getUser(id) {
    return toUserDto(await this.userService.getUser(id));
  }

  async getUsersByIds(ids) {
    return (await this.userService.getUsersByIds(ids)).map(toUserDto);
  }

  async listProducers() {
    return (await this.userService.listProducers()).map(toUserDto);
  }

  async nearbyProducers(dto) {
    return (await this.userService.nearbyProducers(dto)).map(toNearbyProducerDto);
  }
}
