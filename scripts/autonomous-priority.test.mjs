import test from "node:test";
import assert from "node:assert/strict";
import { expireStaleStages, selectPriorityProduct } from "../lib/automation-priority.mjs";

test("prefers Twinkle over alphabetical fallback", () => {
  const products = [
    { productId: "hirono-a", name: "HIRONO A", brand: "POP MART" },
    { productId: "twinkle-twinkle-b", name: "Twinkle Twinkle B", brand: "POP MART" },
  ];
  assert.equal(selectPriorityProduct(products, { products: {} }).productId, "twinkle-twinkle-b");
});

test("falls back alphabetically when no priority term matches", () => {
  const products = [
    { productId: "skullpanda-z", name: "Z", brand: "POP MART" },
    { productId: "hirono-a", name: "A", brand: "POP MART" },
  ];
  assert.equal(selectPriorityProduct(products, { products: {} }).productId, "hirono-a");
});

test("never reselects staged, partial, or published products", () => {
  const products = [
    { productId: "twinkle-one", name: "Twinkle One", brand: "POP MART" },
    { productId: "hirono-a", name: "A", brand: "POP MART" },
  ];
  const state = { products: { "twinkle-one": { status: "STAGED" } } };
  assert.equal(selectPriorityProduct(products, state).productId, "hirono-a");
});

test("expires stale staged candidates but preserves fresh staged candidates", () => {
  const now = new Date("2026-08-24T20:00:00.000Z");
  const state = {
    products: {
      stale: { status: "STAGED", stagedAt: "2026-08-20T20:00:00.000Z" },
      fresh: { status: "STAGED", stagedAt: "2026-08-24T08:00:00.000Z" },
    },
  };
  const result = expireStaleStages(state, { now, ttlHours: 48 });
  assert.deepEqual(result.expired, ["stale"]);
  assert.equal(result.state.products.stale.status, "FAILED");
  assert.match(result.state.products.stale.lastError, /Expired stale STAGED candidate/);
  assert.equal(result.state.products.fresh.status, "STAGED");
});
