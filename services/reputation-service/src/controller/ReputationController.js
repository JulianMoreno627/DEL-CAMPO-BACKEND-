import { toRatingDto, toReputationDto } from '../dto/reputationDto.js';

/** Receives DTOs (and who rates), calls the service and returns DTOs (no gRPC details). */
export class ReputationController {
  constructor({ reputationService }) {
    this.reputationService = reputationService;
  }

  async rate(fromUserId, { orderId, scores, comment }) {
    return toRatingDto(await this.reputationService.rate({ orderId, fromUserId, scores, comment }));
  }

  async getReputation(userId) {
    return toReputationDto(await this.reputationService.reputationOf(userId));
  }
}
