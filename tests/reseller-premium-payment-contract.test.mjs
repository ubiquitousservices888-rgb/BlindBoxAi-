import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("premium checkout must not be advertised before paid fulfillment exists", () => {
  const page = read("app/pro/page.jsx");
  assert.match(page, /EARLY ACCESS · NO CHARGE/);
  assert.match(page, /not live paid services|not an active subscription/);
});

test("existing waitlist must remain free and independent of payment", () => {
  const waitlist = read("app/pro/waitlist.jsx");
  assert.match(waitlist, /\/api\/waitlist/);
  assert.doesNotMatch(waitlist, /checkout|stripe\.com|payment_intent/i);
});

test("payment implementation requires server-only checkout, verified webhook and entitlements", () => {
  const checkout = "app/api/pro/checkout/route.js";
  const webhook = "app/api/pro/webhook/route.js";
  const access = "lib/pro-entitlements.mjs";
  assert.ok(existsSync(new URL(checkout, root)), "MISSING: server-side Stripe Checkout endpoint");
  assert.ok(existsSync(new URL(webhook, root)), "MISSING: signed Stripe webhook handler");
  assert.ok(existsSync(new URL(access, root)), "MISSING: server-side subscription entitlement resolver");
});

test("never activate premium access from a browser success redirect", () => {
  const page = read("app/pro/page.jsx");
  assert.doesNotMatch(page, /setPremium\(true\)|localStorage\.setItem\(.premium/i);
});
