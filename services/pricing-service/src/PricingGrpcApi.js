import { unary } from '@del-campo/shared';
import { evaluateFromMessage } from './dto/pricingDto.js';

/**
 * gRPC API of pricing-service: the ONLY file of the service that knows gRPC.
 * Registers delcampo.pricing.PricingService (proto/pricing.proto) and delegates to the controller.
 *
 * @param {import('@del-campo/shared').GrpcServer} server
 * @param {import('./controller/PricingController.js').PricingController} controller
 */
export function registerPricingGrpcApi(server, controller) {
  server.addService('pricing', {
    getReference: unary(({ product }) => controller.getReference(product)),
    evaluatePrices: unary(async (message) => ({ items: await controller.evaluatePrices(evaluateFromMessage(message)) })),
  });
}
