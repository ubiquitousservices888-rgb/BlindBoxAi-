import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const fakeCheck = fs.readFileSync(new URL("../app/_components/FakeCheck.jsx", import.meta.url), "utf8");
const purchaseEmbed = fs.readFileSync(new URL("../app/_components/FakeCheckGumroadEmbeds.jsx", import.meta.url), "utf8");
const rootLayout = fs.readFileSync(new URL("../app/layout.jsx", import.meta.url), "utf8");

test("Fake Check inspection still shows artwork, checklist and the opt-in two-product widget", () => {
  assert.match(fakeCheck, /import FakeCheckGumroadEmbeds from/);
  assert.match(fakeCheck, /<FakeCheckGumroadEmbeds \/>/);
  assert.match(fakeCheck, /function Figure\(/);
  assert.match(fakeCheck, /className="fc-diagram"/);
  assert.match(fakeCheck, /className="fc-tells"/);
  assert.match(fakeCheck, /checklist\.map\(/);
  assert.match(fakeCheck, /className="fc-note"/);
  assert.doesNotMatch(fakeCheck, /fake-check-gumroad-store|Visit the Ubiquitous Services Gumroad store/);
});

test("Fake-Check guide and sports-card bundle use the exact owner-provided product URLs", () => {
  for (const [slug, label] of [
    ["bjfpgf", "The Fake-Check Field Guide"],
    ["fxloos", "Sports Card Collecting Series"],
  ]) {
    assert.match(purchaseEmbed, new RegExp(`id: "${slug}"`));
    assert.match(purchaseEmbed, new RegExp(`url: "https:\\/\\/ubiquity6\\.gumroad\\.com\\/l\\/${slug}"`));
    assert.match(purchaseEmbed, new RegExp(label));
  }
  assert.equal((purchaseEmbed.match(/id: "(?:bjfpgf|fxloos)"/g) || []).length, 2);
  assert.match(purchaseEmbed, /className="gumroad-product-embed"/);
  assert.match(purchaseEmbed, /data-gumroad-product-id=\{product\.id\}/);
  assert.match(purchaseEmbed, /href=\{product\.url\}/);
});

test("third-party embed script is loaded once only after explicit visitor interaction", () => {
  assert.match(purchaseEmbed, /^"use client";/);
  assert.match(purchaseEmbed, /const \[enabled, setEnabled\] = useState\(false\)/);
  assert.match(purchaseEmbed, /onClick=\{\(\) => setEnabled\(true\)\}/);
  assert.match(purchaseEmbed, /\{enabled \? \(\s*<>\s*<Script/);
  assert.match(purchaseEmbed, /src="https:\/\/gumroad\.com\/js\/gumroad-embed\.js"/);
  assert.equal((purchaseEmbed.match(/<Script\s/g) || []).length, 1);
  assert.doesNotMatch(rootLayout, /gumroad-embed\.js|gumroad\.js/);
  assert.doesNotMatch(fakeCheck, /gumroad-embed\.js|<iframe|<script/);
});

test("failed or unavailable embeds retain safe direct product links and honest checkout ownership", () => {
  assert.match(purchaseEmbed, /target="_blank"/);
  assert.match(purchaseEmbed, /rel="noopener noreferrer"/);
  assert.match(purchaseEmbed, /onError=\{\(\) => setLoadFailed\(true\)\}/);
  assert.match(purchaseEmbed, /Product previews could not load/);
  assert.match(purchaseEmbed, /checkout securely on Gumroad/i);
  assert.match(purchaseEmbed, /do not authenticate or appraise collectibles/);
  assert.doesNotMatch(purchaseEmbed, /earn a commission|verified delivery|successful sale|guaranteed/);
});
