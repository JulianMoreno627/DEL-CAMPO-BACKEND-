import { test } from 'node:test';
import assert from 'node:assert/strict';
import grpc from '@grpc/grpc-js';
import {
  GrpcServer, GrpcClient, unary, runWithContext, currentContext, checkHealth, closeHealthClients,
  DomainError, NotFound, VersionConflict, InvalidTransition, ServiceUnavailable,
  toGrpcError, fromGrpcError,
} from '../src/index.js';

/** Starts a server with the pricing contract and the given handlers on a free port. */
async function startPricing(handlers) {
  const server = new GrpcServer({ name: 'pricing-test' });
  server.addService('pricing', handlers);
  const port = await server.start(0);
  const client = new GrpcClient('pricing', { address: `127.0.0.1:${port}`, deadlineMs: 2000 });
  return { server, client, port, close: async () => { client.close(); await server.stop(); } };
}

test('error mapping: every domain status survives the round trip, with its type and current value', () => {
  const cases = [
    [new DomainError('Correo inválido'), grpc.status.INVALID_ARGUMENT, 400],
    [new DomainError('Inicie sesión para continuar', 401), grpc.status.UNAUTHENTICATED, 401],
    [new DomainError('Solo los productores pueden hacer esto', 403), grpc.status.PERMISSION_DENIED, 403],
    [new NotFound('Cosecha'), grpc.status.NOT_FOUND, 404],
    [new DomainError('Este anuncio ya tiene pedidos', 409), grpc.status.FAILED_PRECONDITION, 409],
    [new VersionConflict({ id: 'h1', version: 3, product: 'Ñame' }), grpc.status.ABORTED, 409],
    [new DomainError('Lote demasiado grande', 413), grpc.status.RESOURCE_EXHAUSTED, 413],
    [new InvalidTransition('PLANTED', 'SOLD_OUT'), grpc.status.FAILED_PRECONDITION, 422],
  ];
  for (const [error, code, status] of cases) {
    const grpcError = toGrpcError(error);
    assert.equal(grpcError.code, code, error.message);
    const rebuilt = fromGrpcError({ ...grpcError, details: grpcError.details }, 'test');
    assert.ok(rebuilt instanceof DomainError);
    assert.equal(rebuilt.status, status);
    assert.equal(rebuilt.name, error.name);
    assert.equal(rebuilt.message, error.message);
    assert.deepEqual(rebuilt.current, error.current);
  }
});

test('error mapping: an unexpected error is hidden as "Error interno" and a dead service is 503', () => {
  const original = console.error;
  console.error = () => {};
  try {
    const internal = toGrpcError(new TypeError('x is undefined'));
    assert.equal(internal.code, grpc.status.INTERNAL);
    assert.equal(internal.details, 'Error interno');
  } finally {
    console.error = original;
  }
  const unavailable = fromGrpcError({ code: grpc.status.UNAVAILABLE, details: 'No connection established' }, 'catalog');
  assert.ok(unavailable instanceof ServiceUnavailable);
  assert.equal(unavailable.status, 503);
  assert.equal(toGrpcError(unavailable).code, grpc.status.UNAVAILABLE);
});

test('gRPC: a remote DomainError arrives with the same status, type and Spanish message', async () => {
  const pricing = await startPricing({
    getReference: unary(async ({ product }) => { throw new DomainError(`Sin precio para «${product}»`, 404); }),
    evaluatePrices: unary(async () => { throw new VersionConflict({ nota: 'versión 2' }); }),
  });
  try {
    await assert.rejects(pricing.client.call('GetReference', { product: 'ñame' }), (error) => {
      assert.equal(error.status, 404);
      assert.equal(error.message, 'Sin precio para «ñame»');
      return true;
    });
    await assert.rejects(pricing.client.call('EvaluatePrices', { items: [] }), (error) => {
      assert.equal(error.name, 'VersionConflict');
      assert.deepEqual(error.current, { nota: 'versión 2' });
      return true;
    });
  } finally {
    await pricing.close();
  }
});

test('gRPC: the context (request id, user, role) travels in the metadata and the deadline is respected', async () => {
  let seen;
  const pricing = await startPricing({
    getReference: unary(async () => {
      seen = currentContext();
      return { product: 'papa', marketPrice: 1, middlemanPrice: 1, unit: 'kg', fairRange: { min: 1, max: 1 } };
    }),
    evaluatePrices: unary(() => new Promise(() => {})), // never answers
  });
  try {
    const timings = [];
    await runWithContext({ requestId: 'req-1', userId: 'p-rosa', role: 'PRODUCER', timings }, async () => {
      await pricing.client.call('GetReference', { product: 'papa' });
    });
    assert.equal(seen.requestId, 'req-1');
    assert.equal(seen.userId, 'p-rosa');
    assert.equal(seen.role, 'PRODUCER');
    assert.ok(seen.deadline > Date.now());
    assert.equal(timings[0].name, 'pricing.GetReference');

    // The parent's deadline (300 ms) wins over the client's (2 s)
    const start = Date.now();
    await assert.rejects(
      runWithContext({ deadline: Date.now() + 300 }, () => pricing.client.call('EvaluatePrices', { items: [] })),
      ServiceUnavailable);
    assert.ok(Date.now() - start < 1500);
  } finally {
    await pricing.close();
  }
});

test('health check: SERVING while it runs, UNREACHABLE when it stops', async () => {
  const pricing = await startPricing({ getReference: unary(async () => ({})), evaluatePrices: unary(async () => ({})) });
  const address = `127.0.0.1:${pricing.port}`;
  assert.equal(await checkHealth(address), 'SERVING');
  assert.equal(await checkHealth(address, { service: 'delcampo.pricing.PricingService' }), 'SERVING');
  await pricing.close();
  assert.equal(await checkHealth(address, { timeoutMs: 300 }), 'UNREACHABLE');
  closeHealthClients();
});
