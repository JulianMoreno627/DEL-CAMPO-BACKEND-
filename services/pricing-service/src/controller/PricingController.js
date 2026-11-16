import { toReferenceDto, toEvaluationDto, toListingSuggestionDto } from '../dto/pricingDto.js';

/** Receives DTOs, calls the services and returns DTOs (no gRPC details). */
export class PricingController {
  constructor({ pricingService, listingAssistant }) {
    this.pricingService = pricingService;
    this.listingAssistant = listingAssistant;
  }

  async getReference(product) {
    return toReferenceDto(await this.pricingService.reference(product));
  }

  async evaluatePrices(items) {
    return (await this.pricingService.evaluate(items)).map(toEvaluationDto);
  }

  async suggestListing(userId, photo) {
    return toListingSuggestionDto(await this.listingAssistant.suggest(userId, photo));
  }
}
