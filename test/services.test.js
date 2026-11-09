import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContainer } from '../src/container.js';
import { createApp } from '../src/app.js';

test('order → delivery → both parties rate each other', async () => {
  const c = await createContainer({ withDemoData: true });
  const order = await c.orderService.create({ harvestId: 'cos-2', buyerId: 'c-ana', quantity: 20 });
  assert.equal((await c.harvestRepo.get('cos-2')).reservedQuantity, 20);

  await assert.rejects(c.reputationService.rate({ orderId: order.id, fromUserId: 'c-ana', scores: { quality: 5, reliability: 5 } }), /entregada/);
  await assert.rejects(c.orderService.changeStatus(order.id, 'CONFIRMED', 'c-ana'), /Solo el productor/);
  await c.orderService.changeStatus(order.id, 'CONFIRMED', 'p-rosa');
  await c.orderService.changeStatus(order.id, 'DELIVERED', 'p-rosa');

  await c.reputationService.rate({ orderId: order.id, fromUserId: 'c-ana', scores: { quality: 5, reliability: 4 } });
  await c.reputationService.rate({ orderId: order.id, fromUserId: 'p-rosa', scores: { paysOnTime: 5, seriousness: 5 } });
  await assert.rejects(c.reputationService.rate({ orderId: order.id, fromUserId: 'p-rosa', scores: { paysOnTime: 1, seriousness: 1 } }), /Ya calificó/);
  assert.equal((await c.reputationService.reputationOf('c-ana')).total, 2);
});

test('HTTP: SSR with ISR cache (MISS → HIT → invalidation) and Server-Timing', async () => {
  const c = await createContainer({ withDemoData: true });
  const server = createApp(c).listen(0);
  const base = `http://localhost:${server.address().port}`;
  try {
    const r1 = await fetch(`${base}/productores/p-rosa`);
    assert.equal(r1.headers.get('x-cache-isr'), 'MISS');
    assert.match(await r1.text(), /La Esperanza/);
    assert.match(r1.headers.get('server-timing'), /app;dur=/);

    const r2 = await fetch(`${base}/productores/p-rosa`);
    assert.equal(r2.headers.get('x-cache-isr'), 'HIT');

    await c.harvestService.update('cos-1', { unitPrice: 2700 }, { producerId: 'p-rosa' });
    const r3 = await fetch(`${base}/productores/p-rosa`);
    assert.equal(r3.headers.get('x-cache-isr'), 'MISS');

    const api = await fetch(`${base}/api/catalog`, { headers: { Origin: 'http://localhost:5173' } });
    assert.equal(api.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  } finally {
    server.close();
  }
});
