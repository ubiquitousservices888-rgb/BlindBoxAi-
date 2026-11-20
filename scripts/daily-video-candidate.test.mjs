import assert from 'node:assert/strict';
import test from 'node:test';
import { planDailyVideo } from '../lib/daily-video-plan.mjs';

const now = new Date('2026-10-16T14:00:00Z');
const products = ['one','two','three'].map((id) => ({ id, name: id, productUrl: 'https://blindboxai.com/series/' + id }));
const validateProduct = (product) => { if (product.id === 'stale') throw new Error('stale'); return product; };
const makeScript = (product) => ({ caption: 'Verified ' + product.id + ': #ad BlindBoxAI may earn a commission from qualifying purchases.', productUrl: product.productUrl });
const run = (patch = {}) => planDailyVideo({ products, history: [], now, validateProduct, makeScript, monthlyRenderLimit: 3, ...patch });
test('selects exactly one deterministic unused verified item', () => {
  assert.deepEqual(run(), run());
  assert.equal(run().status, 'READY_TO_RENDER');
  assert.ok(products.some((p) => p.id === run().productId));
});
test('does not reuse an item already staged in the last 30 days', () => {
  const first = run();
  const second = run({ history: [{ productId: first.productId, date: '2026-10-15' }] });
  assert.notEqual(second.productId, first.productId);
});
test('returns no candidate when verified inventory is exhausted', () => {
  const history = products.map((p) => ({ productId: p.id, date: '2026-10-15' }));
  assert.equal(run({ history }).status, 'NO_UNUSED_VERIFIED_PRODUCT');
  assert.equal(run({ history }).canRender, false);
});
test('rejects incomplete or malformed history instead of silently repeating', () => {
  assert.throws(() => run({ history: [{ date: '2026-10-15' }] }), /Malformed artifact history/);
  assert.throws(() => run({ history: [{ productId: 'one', date: 'tomorrow' }] }), /Malformed artifact history/);
});
test('never renders if monthly cap is zero or already consumed', () => {
  assert.equal(run({ monthlyRenderLimit: 0 }).canRender, false);
  const history = [{ productId: 'old1', date: '2026-10-02' }, { productId: 'old2', date: '2026-10-03' }];
  assert.equal(run({ history, monthlyRenderLimit: 2 }).canRender, false);
});
test('fails closed on invalid budget or missing verified script', () => {
  assert.throws(() => run({ monthlyRenderLimit: 40 }), /Monthly render limit/);
  assert.throws(() => run({ makeScript: () => ({ caption: 'invalid', productUrl: 'https://example.com' }) }), /disclosure/);
});
test('rejects off-site CTA and unauthorized redirects', () => {
  assert.throws(() => run({ makeScript: (p) => ({ caption: '#ad BlindBoxAI may earn a commission from qualifying purchases.', productUrl: 'https://evil.example/series/fake' }) }), /first-party/);
});
test('rejects stale inventory as defined by production validation', () => {
  assert.equal(run({ products: [{ id: 'stale' }] }).status, 'NO_UNUSED_VERIFIED_PRODUCT');
  const mixed = run({ products: [{ id: 'stale' }, products[0]] });
  assert.equal(mixed.status, 'READY_TO_RENDER');
  assert.equal(mixed.productId, 'one');
});

test('does not prepare an owner-retired product', () => {
  const blocked = products.map((product) => product.id);
  const result = run({ excludedProductIds: blocked });
  assert.equal(result.status, 'NO_UNUSED_VERIFIED_PRODUCT');
  assert.equal(result.canRender, false);
});
test('one retired product never reappears under the same ID', () => {
  const selected = run().productId;
  assert.notEqual(run({ excludedProductIds: [selected] }).productId, selected);
});
test('malformed retired product IDs fail closed', () => {
  assert.throws(() => run({ excludedProductIds: 'all' }), /Exact excluded product IDs/);
  assert.throws(() => run({ excludedProductIds: ['../outside'] }), /Exact excluded product IDs/);
});

test('second run on the same UTC date cannot rotate into another product', () => {
  assert.throws(() => run({ history: [{ productId: 'one', date: '2026-10-16' }] }), /already staged for this UTC day/);
});

test('deduplication excludes a product at 29 days but permits it at 31 days', () => {
  const single = [products[0]];
  const recent = run({ products: single, history: [{ productId: 'one', date: '2026-09-17' }] });
  const old = run({ products: single, history: [{ productId: 'one', date: '2026-09-15' }] });
  assert.equal(recent.status, 'NO_UNUSED_VERIFIED_PRODUCT');
  assert.equal(old.status, 'READY_TO_RENDER');
  assert.equal(old.productId, 'one');
});

test('a legitimate first-party CTA still requires exact written affiliate disclosure', () => {
  assert.throws(() => run({ makeScript: (product) => ({
    caption: 'Verified item without the required ad disclosure',
    productUrl: product.productUrl,
  }) }), /Verified script must include first-party CTA and disclosure/);
});

test('a positive limit permits a draft plan before the monthly request cap', () => {
  assert.equal(run({ monthlyRenderLimit: 1 }).canRender, true);
  assert.equal(run({ monthlyRenderLimit: 1, history: [{ productId: 'old1', date: '2026-10-02' }] }).canRender, false);
});
