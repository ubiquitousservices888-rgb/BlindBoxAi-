import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { proFixtures, USER_A } from "../../tests/pro-fixtures.mjs";

const origin = "http://127.0.0.1:3376";
let fixture, app;
test.use({ viewport: { width: 390, height: 844 } });

test.beforeAll(async () => {
  fixture = await proFixtures();
  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3376", "-H", "127.0.0.1"], {
    env: { ...process.env, ...fixture.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_EPN_CAMPID: "5339000000" }, stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout.resume(); app.stderr.resume();
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(`${origin}/api/health`)).status === 200) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Disposable Pro app failed to start");
});
test.afterAll(async () => { if (app && app.exitCode === null) { app.kill("SIGTERM"); await once(app, "exit"); } await fixture?.close(); });

test("mobile customer journey uses actual Next routes, signed events and disposable PostgreSQL", async ({ page, context }) => {
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1") return route.continue();
    if (url.origin === "https://checkout.stripe.com") return route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Disposable checkout</h1>" });
    return route.abort();
  });
  await page.goto(`${origin}/pro`);
  await page.getByRole("link", { name: "Open your Pro account" }).click();
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("one@example.test");
  await page.getByLabel("Password", { exact: true }).fill("local-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Subscribe for $9.99/month", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Disposable checkout" })).toBeVisible();
  expect(fixture.state.checkoutCreates).toBe(1);
  await page.goto(`${origin}/pro/account?checkout=returned`);
  await expect(page.getByRole("heading", { name: "Your subscription", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Saved resale scenarios" })).toHaveCount(0);
  const account = await fixture.store.account(USER_A, false);
  const session = fixture.state.sessions.get(account.checkout_session_id);
  const sub = fixture.paidSubscription(account.stripe_customer_id);
  Object.assign(session, { status: "complete", payment_status: "paid", subscription: sub.id });
  async function deliver(type, object) {
    const signed = fixture.signed(fixture.event(type, object));
    const response = await context.request.post(`${origin}/api/pro/webhook`, { data: signed.raw, headers: { "Content-Type": "application/json", "Stripe-Signature": signed.signature } });
    expect(response.status()).toBe(200);
  }
  await deliver("checkout.session.completed", session);
  await page.getByRole("button", { name: "Refresh access", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Saved resale scenarios" })).toBeVisible();
  await page.getByLabel("Scenario name", { exact: true }).fill("My exact-card cost check");
  await page.getByLabel("Quantity", { exact: true }).fill("2");
  await page.getByLabel("Purchase price", { exact: true }).fill("10");
  await page.getByLabel("Expected resale price", { exact: true }).fill("30");
  await page.getByLabel("Selling fees (%)", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Save scenario", exact: true }).click();
  await expect(page.getByText("My exact-card cost check", { exact: true })).toBeVisible();
  const csv = await context.request.get(`${origin}/api/pro/scenarios/export`);
  expect(csv.status()).toBe(200); expect(await csv.text()).toContain("User assumptions; not verified sales or cash revenue");
  expect((await context.cookies(origin)).filter(cookie => cookie.name.startsWith("bbai-pro-auth")).every(cookie => cookie.httpOnly)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: "test-results/pro-mobile-workspace.png", fullPage: true });
  sub.cancel_at_period_end = true;
  await deliver("customer.subscription.updated", sub);
  await page.getByRole("button", { name: "Refresh access", exact: true }).click();
  await expect(page.getByText(/Your subscription ends at the close/)).toBeVisible();
  sub.status = "canceled"; await deliver("customer.subscription.deleted", sub);
  await page.getByRole("button", { name: "Refresh access", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Saved resale scenarios" })).toHaveCount(0);
  expect((await context.request.get(`${origin}/api/pro/scenarios`)).status()).toBe(402);
});

test("existing site keeps the free waitlist and payment-disabled default", async ({ page, request }) => {
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  await page.goto("/pro");
  await expect(page.getByRole("heading", { name: "Free resale margin check" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Join the waitlist →", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open your Pro account" })).toHaveCount(0);
  const response = await request.post("/api/pro/checkout", { data: {}, headers: { Origin: "https://blindboxai.com" } });
  expect(response.status()).toBe(503);
});
