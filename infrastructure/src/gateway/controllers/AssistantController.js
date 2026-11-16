/**
 * REST ↔ gRPC (pricing-service): the AI listing assistant ("Publica con una foto").
 * The photo arrives as binary (the same as the listing photo upload) and travels over gRPC as bytes.
 * The AI may need a few seconds (and a second provider if the first one fails), so this call has
 * a longer deadline than the rest.
 */
export class AssistantController {
  /**
   * @param {{pricing: import('@del-campo/shared').GrpcClient}} clients
   * @param {object} [options]
   * @param {number} [options.deadlineMs]
   */
  constructor({ pricing }, { deadlineMs = Number(process.env.AI_GATEWAY_DEADLINE_MS ?? 20_000) } = {}) {
    this.pricing = pricing;
    this.deadlineMs = deadlineMs;
  }

  suggestListing = async (req, res) => {
    const photo = {
      content: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
      contentType: req.get('Content-Type') ?? '',
    };
    const s = await this.pricing.call('SuggestListing', photo, { deadlineMs: this.deadlineMs });
    res.json({
      recognized: s.recognized,
      product: s.product,
      category: s.category,
      unit: s.unit,
      description: s.description,
      confidence: s.confidence,
      photoTip: s.photoTip,
      fairPrice: s.reference
        ? {
          product: s.reference.product,
          marketPrice: s.reference.marketPrice,
          unit: s.reference.unit,
          min: s.reference.fairRange.min,
          max: s.reference.fairRange.max,
        }
        : null,
      provider: s.provider,
    });
  };
}
