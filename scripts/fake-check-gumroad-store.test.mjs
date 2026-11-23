import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../app/_components/FakeCheck.jsx", import.meta.url), "utf8");

test("the existing fake-check panel links to the exact owner-provided Gumroad storefront", () => {
  assert.match(source, /data-testid="fake-check-gumroad-store"/);
  assert.equal((source.match(/href="https:\/\/ubiquity6\.gumroad\.com\/"/g) || []).length, 1);
  assert.match(source, /target="_blank"/);
  assert.match(source, /rel="noopener noreferrer"/);
  assert.match(source, /Gumroad handles any purchases/);
});

test("fake-check drawings and inspection list remain intact; no Gumroad scripts or embeds added", () => {
  assert.match(source, /function Figure\(/);
  assert.match(source, /className="fc-diagram"/);
  assert.match(source, /className="fc-tells"/);
  assert.match(source, /checklist\.map\(/);
  assert.match(source, /className="fc-note"/);
  assert.doesNotMatch(source, /<iframe|<script|gumroad\.js|<form/);
  assert.match(source, /not an authenticity certificate/);
});
