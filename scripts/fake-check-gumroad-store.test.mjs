import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const purchaseEmbed = fs.readFileSync(new URL("../app/_components/FakeCheckGumroadEmbeds.jsx", import.meta.url), "utf8");

test("Fake Check inspection still shows artwork, checklist and the two-product widget", () => {
  const fakeCheck = fs.readFileSync(new URL("../app/_components/FakeCheck.jsx", import.meta.url), "utf8");
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
  assert.match(flow, /const requestedPath = window\.sessionStorage\.getItem\(PREVIEW_FLAG\)/);
  assert.match(flow, /if \(requestedPath === pathname\) setEnabled\(true\)/);
  assert.match(flow, /window\.sessionStorage\.removeItem\(PREVIEW_FLAG\)/);
  assert.match(flow, /setEnabled\(false\);[\s\S]*?setLoaded\(false\);[\s\S]*?setLoadFailed\(false\)/);
  assert.match(flow, /\}, \[pathname\]\);/);
  assert.match(purchaseEmbed, /const handledPath = useRef\(null\)/);
  assert.match(flow, /function requestPreviews\(\) \{[\s\S]*?if \(enabled\) return;[\s\S]*?window\.sessionStorage\.setItem\(PREVIEW_FLAG, pathname\);[\s\S]*?window\.location\.reload\(\)/);
  assert.match(purchaseEmbed, /\{enabled \? \(\s*<>\s*<Script/);
  assert.match(purchaseEmbed, /src="https:\/\/gumroad\.com\/js\/gumroad-embed\.js"/);
  assert.equal((purchaseEmbed.match(/<Script\s/g) || []).length, 1);
  assert.doesNotMatch(purchaseEmbed, /document\.body\.appendChild\(script\)|script\.remove\(\)/);
});

test("Gumroad scripts are absent from the parent and root layout", () => {
  const fakeCheck = fs.readFileSync(new URL("../app/_components/FakeCheck.jsx", import.meta.url), "utf8");
  const rootLayout = fs.readFileSync(new URL("../app/layout.jsx", import.meta.url), "utf8");
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

// Execute the actual effect body with disposable storage and state; no network or React runtime.
function previewLifecycle(flag = null) {
  const effect = purchaseEmbed.match(/useEffect\(\(\) => \{([\s\S]*?)\n  \}, \[pathname\]\);/);
  assert.ok(effect, "preview effect must depend on pathname");
  const run = new vm.Script(`(() => {${effect[1]} })()`);
  const state = { enabled: false, loaded: false, failed: false };
  const storage = new Map();
  const key = "blindboxai_gumroad_previews_once";
  if (flag !== null) storage.set(key, flag);
  const context = vm.createContext({
    PREVIEW_FLAG: key,
    handledPath: { current: null },
    window: { sessionStorage: {
      getItem: (name) => storage.get(name) ?? null,
      removeItem: (name) => storage.delete(name),
    } },
    setEnabled: (value) => { state.enabled = value; },
    setLoaded: (value) => { state.loaded = value; },
    setLoadFailed: (value) => { state.failed = value; },
  });
  return {
    state, storage, key, context,
    visit(pathname) { context.pathname = pathname; run.runInContext(context); },
  };
}

test("preview lifecycle keeps a consumed opt-in through Strict Mode effect replay", () => {
  const life = previewLifecycle("/series/a");
  life.visit("/series/a");
  assert.equal(life.state.enabled, true);
  assert.equal(life.storage.has(life.key), false);
  life.visit("/series/a");
  assert.equal(life.state.enabled, true);
});

test("preview lifecycle resets on navigation and does not revive consent on return", () => {
  const life = previewLifecycle("/series/a");
  life.visit("/series/a");
  life.state.loaded = true;
  life.state.failed = true;
  life.visit("/series/b");
  assert.deepEqual(life.state, { enabled: false, loaded: false, failed: false });
  life.visit("/series/a");
  assert.equal(life.state.enabled, false);
});

test("preview lifecycle denies missing, mismatched and inaccessible consent", () => {
  const absent = previewLifecycle();
  absent.visit("/series/a");
  assert.equal(absent.state.enabled, false);
  const stale = previewLifecycle("/series/b");
  stale.visit("/series/a");
  assert.equal(stale.state.enabled, false);
  stale.visit("/series/b");
  assert.equal(stale.state.enabled, false);
  const blocked = previewLifecycle("/series/a");
  blocked.visit("/series/a");
  blocked.context.window.sessionStorage.getItem = () => { throw new Error("blocked"); };
  blocked.visit("/series/b");
  assert.deepEqual(blocked.state, { enabled: false, loaded: false, failed: false });
});

test("route-scoped remount denies stale consent before effects run", () => {
  assert.match(purchaseEmbed, /const pathname = usePathname\(\);[\s\S]*?return <RouteScopedPreviews key=\{pathname \?\? ""\} pathname=\{pathname\} \/>;/);
  assert.match(purchaseEmbed, /function RouteScopedPreviews\(\{ pathname \}\) \{\s*const \[enabled, setEnabled\] = useState\(false\);/);
  assert.match(purchaseEmbed, /function requestPreviews\(\) \{\s*if \(!pathname\) return;\s*if \(enabled\) return;/);
});
