import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("../research/coins/preview.html", import.meta.url), "utf8");

function renderNotes(button, values) {
  const nodes = new Map();
  for (const [id, value] of Object.entries(values)) nodes.set(id, { value });
  nodes.set("result", { textContent: "" });
  nodes.set("currency-result", { textContent: "" });
  const handlers = new Map();
  for (const id of ["make", "make-currency"]) {
    nodes.set(id, { addEventListener: (event, callback) => {
      assert.equal(event, "click");
      handlers.set(id, callback);
    } });
  }
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, "local checklist script exists");
  runInNewContext(script, {
    document: { getElementById: (id) => {
      assert.ok(nodes.has(id), `Unexpected DOM ID: ${id}`);
      return nodes.get(id);
    } },
  }, { timeout: 1000 });
  assert.ok(handlers.has(button), "requested button registered its click handler");
  handlers.get(button)();
  return nodes.get(button === "make" ? "result" : "currency-result").textContent;
}

test("coin and currency previews remain review-only and never advertise a price or published appraisal", () => {
  assert.match(html, /noindex,nofollow/);
  assert.match(html, /RESEARCH PREVIEW/);
  assert.match(html, /1976 Bicentennial \$2 pair/);
  assert.match(html, /No value estimate/);
  assert.match(html, /Matching completed-sale evidence: pending/);
  assert.doesNotMatch(html, /\b[A-L]\d{8}[A-Z]\b/);
  assert.doesNotMatch(html, /<img\b|<form\b|<iframe\b|fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|<script\s+src=/i);
  assert.doesNotMatch(html, /\/api\/out\/ebay|affiliate commission earned|guaranteed resale/i);
});

test("coin notes are formatted locally without authenticating or pricing the item", () => {
  const result = renderNotes("make", {
    coin: "Morgan dollar",
    year: "1879",
    mint: "Not verified",
    weight: "",
  });
  assert.match(result, /Coin: Morgan dollar/);
  assert.match(result, /Year: 1879/);
  assert.match(result, /Mint mark: Not verified/);
  assert.match(result, /Sold-price comparisons: pending/);
  assert.match(result, /Authenticity: unverified/);
});

test("paper money notes preserve user input as text and explicitly mark sale evidence pending", () => {
  const result = renderNotes("make-currency", {
    "note-type": "1976 $2 <script>unsafe</script>",
    "note-pair": "Consecutive pair",
    "note-cancel": "Apr 13, 1976 — not authenticated",
    "note-condition": "Folds, ungraded",
  });
  assert.match(result, /Note: 1976 \$2 <script>unsafe<\/script>/);
  assert.match(result, /Quantity\/serial relationship: Consecutive pair/);
  assert.match(result, /Postal cancellation: Apr 13, 1976/);
  assert.match(result, /Condition: Folds, ungraded/);
  assert.match(result, /Matching completed-sale evidence: pending/);
  assert.match(result, /Resale value: not established/);
  assert.ok(result.includes("\n"), "output contains readable line breaks");
});
