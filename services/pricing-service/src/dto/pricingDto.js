/**
 * DTOs of pricing-service and their mapping from / to proto/pricing.proto.
 * A reference that does not exist travels as "not set" (null in JS).
 */

export const toReferenceDto = (reference) => (reference
  ? {
    product: reference.product,
    marketPrice: reference.marketPrice,
    middlemanPrice: reference.middlemanPrice,
    unit: reference.unit,
    fairRange: { min: reference.fairRange.min, max: reference.fairRange.max },
  }
  : null);

export const toEvaluationDto = ({ evaluation, reference }) => ({ evaluation, reference: toReferenceDto(reference) });

export const evaluateFromMessage = ({ items }) => items.map(({ product, price }) => ({ product, price }));

export const listingPhotoFromMessage = ({ content, contentType }) => ({ content, contentType });

export const toListingSuggestionDto = ({ suggestion, reference }) => ({
  recognized: suggestion.recognized,
  product: suggestion.product,
  category: suggestion.category,
  unit: suggestion.unit,
  description: suggestion.description,
  confidence: suggestion.confidence,
  photoTip: suggestion.photoTip,
  reference: toReferenceDto(reference),
  provider: suggestion.provider,
});
