import { toReferenceDto, toEvaluationDto } from '../dto/pricingDto.js';

/** Receives DTOs, calls the service and returns DTOs (no gRPC details). */
export class PricingController {
  constructor({ pricingService }) {
    this.pricingService = pricingService;
  }

  async getReference(product) {
    return toReferenceDto(await this.pricingService.reference(product));
  }

  async evaluatePrices(items) {
    return (await this.pricingService.evaluate(items)).map(toEvaluationDto);
  }
}
