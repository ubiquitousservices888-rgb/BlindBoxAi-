import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { proFixtures, USER_A, USER_B } from "./pro-fixtures.mjs";

const fixture = await proFixtures();
const origin = "http://127.0.0.1:3377";
fixture.env.PRO_APP_ORIGIN = origin;
const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3377", "-H", "127.0.0.1"], {
  env: { ...process.env, ...fixture.env, NODE_ENV: "production", NEXT_PUBLIC_EPN_CAMPID: "5339000000", NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
app.stdout.resume(); app.stderr.resume();
let cookie = "";
async function request(path, { method = "GET", body, headers = {} } = {}) {
  return fetch(`${origin}${path}`, { method, headers: { Origin: origin, "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...headers }, ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }), redirect: "error" });
}
async function deliver(type, object, options) {
  const signed = fixture.signed(fixture.event(type, object, options));
  return request("/api/pro/webhook", { method: "POST", body: signed.raw, headers: { "stripe-signature": signed.signature } });
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await request("/api/health")).status === 200) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, "built disposable Next app starts");
  let releaseProvider, deadlineTimer, reader, html = "";
  fixture.state.providerGate = new Promise(resolve => { releaseProvider = resolve; });
  const deadline = new Promise((_, reject) => { deadlineTimer = setTimeout(() => reject(new Error("free calculator blocked on billing probes")), 3000); });
  const decoder = new TextDecoder();
  try {
    const page = await Promise.race([request("/pro"), deadline]); assert.equal(page.status, 200);
    reader = page.body.getReader();
    while (!html.includes("Free resale margin check")) {
      const chunk = await Promise.race([reader.read(), deadline]);
      assert.equal(chunk.done, false, "free calculator renders while Stripe probes are blocked");
      html += decoder.decode(chunk.value, { stream: true });
    }
  } finally { clearTimeout(deadlineTimer); fixture.state.providerGate = null; releaseProvider(); }
  while (true) { const chunk = await reader.read(); if (chunk.done) break; html += decoder.decode(chunk.value, { stream: true }); }
  assert.match(html, /Open your Pro account/);
  fixture.state.deliveryValid = false;
  assert.doesNotMatch(await (await request("/pro")).text(), /Open your Pro account/);
  fixture.state.deliveryValid = true;
  assert.equal((await request("/api/pro/checkout", { method: "POST", body: {} })).status, 401);
  assert.equal(fixture.state.writes, 0);
  const login = await request("/api/pro/auth", { method: "POST", body: { action: "login", email: "one@example.test", password: "local-test-password" } });
  assert.equal(login.status, 200, await login.clone().text());
  const cookies = login.headers.getSetCookie(); assert.ok(cookies.length); assert.ok(cookies.every(c => /httponly/i.test(c)));
  cookie = cookies.map(c => c.split(";", 1)[0]).join("; ");
  const checkouts = await Promise.all([request("/api/pro/checkout", { method: "POST", body: {} }), request("/api/pro/checkout", { method: "POST", body: {} })]);
  for (const response of checkouts) assert.equal(response.status, 201, await response.clone().text());
  assert.equal((await checkouts[0].json()).url, (await checkouts[1].json()).url);
  assert.equal(fixture.state.checkoutCreates, 1);
  const access = async () => { const response = await request("/api/pro/access"); assert.equal(response.status, 200, await response.clone().text()); return response.json(); };
  assert.equal((await access()).allowed, false);
  assert.equal((await request("/pro/account?checkout=returned")).status, 200);
  assert.equal((await access()).allowed, false, "return URL grants no entitlement");
  assert.equal((await request("/api/pro/webhook", { method: "POST", body: "{}", headers: { "stripe-signature": "forged" } })).status, 400);
  const account = await fixture.store.account(USER_A, false);
  const session = fixture.state.sessions.get(account.checkout_session_id);
  const sub = fixture.paidSubscription(account.stripe_customer_id);
  Object.assign(session, { status: "complete", payment_status: "paid", subscription: sub.id });
  assert.equal((await deliver("checkout.session.completed", session)).status, 200);
  assert.equal((await access()).allowed, true);
  const scenario = fixture.scenario(); scenario.name = "=SUM(1,2)";
  const saved = await request("/api/pro/scenarios", { method: "POST", body: { ...scenario, user_id: USER_B } });
  assert.equal(saved.status, 200, await saved.clone().text());
  assert.equal((await fixture.store.scenarios(USER_A)).length, 1);
  assert.equal((await fixture.store.scenarios(USER_B)).length, 0);
  const csv = await request("/api/pro/scenarios/export"); assert.equal(csv.status, 200); assert.match(await csv.text(), /"'=SUM/);
  assert.equal((await deliver("invoice.paid", sub.latest_invoice, { live: true })).status, 400);
  sub.status = "canceled";
  assert.equal((await deliver("customer.subscription.deleted", sub)).status, 200);
  assert.equal((await request("/api/pro/scenarios")).status, 402);
  assert.equal((await request("/api/pro/portal", { method: "POST", body: {} })).status, 201);
  assert.equal((await request("/api/pro/checkout", { method: "POST", body: {}, headers: { Origin: "https://attacker.example" } })).status, 403);
  fixture.state.schemaDown = true;
  const readiness = await request("/api/owner/pro-status", { headers: { Authorization: `Bearer ${fixture.env.OWNER_CONTROL_CODE}` } });
  assert.equal(readiness.status, 200);
  const readinessResult = await readiness.json();
  assert.equal(readinessResult.ready, false);
  const checks = readinessResult.checks;
  assert.equal(checks.schema, false); assert.equal(checks.price, true); assert.equal(checks.delivery, true);
  const logout = await request("/api/pro/auth", { method: "DELETE" }); assert.equal(logout.status, 200);
  assert.ok(logout.headers.getSetCookie().some(c => /Max-Age=0/i.test(c)));
  cookie = "";
  assert.equal((await request("/api/pro/access")).status, 401);
  assert.equal((await request("/api/owner/pro-status")).status, 401);
  console.log("PRO_NEXT_E2E: PASS — actual Next routes, confirmed identity, one checkout, signed fulfillment, private save/export, cancellation and logout; disposable providers only; zero production requests.");
} finally {
  if (app.exitCode === null) { app.kill("SIGTERM"); await once(app, "exit"); }
  await fixture.close();
}
