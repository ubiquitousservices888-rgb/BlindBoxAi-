import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateStrongBreadPrice,
  TWINKLE_STRONG_BREAD_REFERENCE,
} from '../lib/twinkle-buy-or-pass.mjs';

test('reference snapshot is internally consistent', () => {
  const { low, current, high } = TWINKLE_STRONG_BREAD_REFERENCE.market;
  assert.ok(low > 0);
  assert.ok(low <= current);
  assert.ok(current <= high);
  assert.match(TWINKLE_STRONG_BREAD_REFERENCE.sources.official, /^https:\/\//);
  assert.match(TWINKLE_STRONG_BREAD_REFERENCE.sources.market, /^https:\/\//);
});

test('rejects invalid prices', () => {
  assert.equal(evaluateStrongBreadPrice('').ok, false);
  assert.equal(evaluateStrongBreadPrice('abc').ok, false);
  assert.equal(evaluateStrongBreadPrice(0).ok, false);
});

test('flags implausibly low prices for verification', () => {
  const result = evaluateStrongBreadPrice(20);
  assert.equal(result.ok, true);
  assert.equal(result.verdict.code, 'VERIFY');
});

test('rates a below-range but plausible price as good', () => {
  const result = evaluateStrongBreadPrice(40);
  assert.equal(result.verdict.code, 'GOOD');
});

test('rates a near-current price as good', () => {
  const result = evaluateStrongBreadPrice(47);
  assert.equal(result.verdict.code, 'GOOD');
});

test('rates an in-range upper price as fair', () => {
  const result = evaluateStrongBreadPrice(52);
  assert.equal(result.verdict.code, 'FAIR');
});

test('rates a price above the observed high as high', () => {
  const result = evaluateStrongBreadPrice(60);
  assert.equal(result.verdict.code, 'HIGH');
});
