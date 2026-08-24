import test from "node:test";
import assert from "node:assert/strict";
import { selectPriorityProduct } from "../lib/automation-priority.mjs";

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
