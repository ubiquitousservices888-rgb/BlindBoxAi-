import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const fakeCheck = fs.readFileSync(new URL("../app/_components/FakeCheck.jsx", import.meta.url), "utf8");
const purchaseEmbed = fs.readFileSync(new URL("../app/_components/FakeCheckGumroadEmbeds.jsx", import.meta.url), "utf8");
const rootLayout = fs.readFileSync(new URL("../app/layout.jsx", import.meta.url), "utf8");

test("Fake Check inspection still shows artwork, checklist and the two-product widget", () => {
  assert.match(fakeCheck, /import FakeCheckGumroadEmbeds from/);
  assert.match(fakeCheck, /<FakeCheckGumroadEmbeds \/>/);
  assert.match(fakeCheck, /function Figure\(/);
  assert.match(fakeCheck, /className="fc-diagram"/);
  assert.match(fakeCheck, /className="fc-tells"/);
  assert.match(fakeCheck, /checklist\.map\(/);
  assert.match(fakeCheck, /className="fc-note"/);
  assert.doesNotMatch(fakeCheck, /fake-check-gumroad-store|Visit the Ubiquitous Services Gumroad store/);
});

test("each verified Gumroad URL stays paired with its exact product ID and title", () => {
  const actual = [...purchaseEmbed.matchAll(/Object\.freeze\(\{\s*id: "([^"]+)",\s*title: "([^"]+)",\s*url: "([^"]+)",\s*\}\)/g)]
    .map(([, id, title, url]) => ({ id, title, url }));
  assert.deepEqual(actual, [
    {
      id: "bjfpgf",
      title: "The Fake-Check Field Guide — Pop Mart and Pokémon",
      url: "https://ubiquity6.gumroad.com/l/bjfpgf",
    },
    {
      id: "fxloos",
      title: "Sports Card Collecting Series — Beginner, Novice and Pro (3 volumes)",
      url: "https://ubiquity6.gumroad.com/l/fxloos",
    },
  ]);
  assert.match(purchaseEmbed, /className="gumroad-product-embed"/);
  assert.match(purchaseEmbed, /data-gumroad-product-id=\{product\.id\}/);
  assert.match(purchaseEmbed, /href=\{product\.url\}/);
});

test("the Gumroad script loads only after a visitor-clicked full reload", () => {
  assert.match(purchaseEmbed, /^"use client";/);
  assert.match(purchaseEmbed, /const \[enabled, setEnabled\] = useState\(false\)/);
  assert.match(purchaseEmbed, /const PREVIEW_FLAG = "blindboxai_gumroad_previews_once"/);
  const flow = purchaseEmbed.slice(purchaseEmbed.indexOf("  useEffect(() => {"), purchaseEmbed.indexOf("  return ("));
  assert.match(flow, /if \(window\.sessionStorage\.getItem\(PREVIEW_FLAG\) === pathname\) \{[\s\S]*?setEnabled\(true\)/);
  assert.match(flow, /function requestPreviews\(\) \{[\s\S]*?if \(enabled\) return;[\s\S]*?window\.sessionStorage\.setItem\(PREVIEW_FLAG, pathname\);[\s\S]*?window\.location\.reload\(\)/);
  assert.match(purchaseEmbed, /\{enabled \? \(\s*<>\s*<Script/);
  assert.match(purchaseEmbed, /src="https:\/\/gumroad\.com\/js\/gumroad-embed\.js"/);
  assert.equal((purchaseEmbed.match(/<Script\s/g) || []).length, 1);
  assert.doesNotMatch(purchaseEmbed, /document\.body\.appendChild\(script\)|script\.remove\(\)/);
  assert.doesNotMatch(rootLayout, /gumroad-embed\.js|gumroad\.js/);
  assert.doesNotMatch(fakeCheck, /gumroad-embed\.js|<iframe|<script/);
});

test("the opt-in button remains focusable and products retain safe links when widgets fail", () => {
  assert.match(purchaseEmbed, /<button\s+type="button"\s+data-testid="load-gumroad-product-previews"/);
  assert.match(purchaseEmbed, /onClick=\{requestPreviews\}/);
  assert.doesNotMatch(purchaseEmbed, /aria-expanded=\{enabled\}/);
  assert.match(purchaseEmbed, /id="gumroad-product-choices"/);
  assert.doesNotMatch(purchaseEmbed, /\{!enabled \? \(\s*<button/);
  assert.match(purchaseEmbed, /target="_blank"/);
  assert.match(purchaseEmbed, /rel="noopener noreferrer"/);
  assert.match(purchaseEmbed, /onError=\{\(\) => setLoadFailed\(true\)\}/);
  assert.match(purchaseEmbed, /Product previews could not load/);
  assert.match(purchaseEmbed, /complete any purchase securely on Gumroad/i);
  assert.match(purchaseEmbed, /do not authenticate or appraise collectibles/);
  assert.doesNotMatch(purchaseEmbed, /earn a commission|verified delivery|successful sale|guaranteed/);
});
