import { expect, test } from "@playwright/test";

const SERIES_PATH = "/series/labubu-the-monsters-have-a-seat";
const CAMPAIGN = "qa-234-journey";

async function isolateExternalRequests(context) {
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1") return route.continue();
    return route.abort();
  });
}

test("social visit, consent, first-party event, and EPN outbound route stay attributed", async ({ page, context }) => {
  const outbound = [];
  await isolateExternalRequests(context);
  await context.route(/\/api\/out\/ebay\?/, async (route) => {
    // Fetch the actual Next handler, stop at its 302, and render a disposable
    // marketplace response. The popup redirect escaped the external route in CI.
    const response = await route.fetch({ maxRedirects: 0 });
    expect(response.status()).toBe(302);
    const target = new URL(response.headers().location);
    expect(target.hostname).toBe("www.ebay.com");
    outbound.push(target);
    await route.fulfill({ status: 200, contentType: "text/html", body: "<h1>QA marketplace stub</h1>" });
  });
  await page.goto(`${SERIES_PATH}?campaign=${CAMPAIGN}&source=youtube`);
  await expect(page.getByRole("heading", { name: /The Monsters: Have A Seat/ })).toBeVisible();

  const eventRequest = page.waitForRequest((request) => request.url().endsWith("/api/analytics/event") &&
    request.postDataJSON()?.event === "page_view");
  await page.getByRole("button", { name: "Accept optional analytics" }).click();
  const event = await eventRequest;
  expect(event.postDataJSON()).toMatchObject({ campaign: CAMPAIGN, source: "youtube" });
  expect((await event.response()).status()).toBe(202);

  const active = page.getByRole("link", { name: /View active listings on eBay/ }).first();
  const internal = new URL(await active.getAttribute("href"), "http://127.0.0.1:3205");
  expect(internal.pathname).toBe("/api/out/ebay");
  expect(internal.searchParams.get("campaign")).toBe(CAMPAIGN);
  expect(internal.searchParams.get("source")).toBe("youtube");

  const [marketplace] = await Promise.all([page.waitForEvent("popup"), active.click()]);
  await expect(marketplace.getByRole("heading", { name: "QA marketplace stub" })).toBeVisible();
  expect(outbound).toHaveLength(1);
  expect(outbound[0].searchParams.get("campid")).toBe("5339000000"); // CI-only fixture; never a production account ID.
  expect(outbound[0].searchParams.get("customid")).toContain("qa234journey");
  expect(outbound[0].searchParams.has("LH_Sold")).toBe(false);
});

test("separate visitors do not share consent or campaign state", async ({ browser }) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  try {
    await isolateExternalRequests(first);
    await isolateExternalRequests(second);
    const one = await first.newPage();
    const two = await second.newPage();
    await one.goto(`${SERIES_PATH}?campaign=${CAMPAIGN}&source=youtube`);
    await two.goto(SERIES_PATH);
    await one.waitForFunction(() => sessionStorage.getItem("bbai_landing_source_v1") === "youtube");
    await one.getByRole("button", { name: "Accept optional analytics" }).click();
    await expect.poll(() => one.evaluate(() => JSON.parse(localStorage.getItem("blindboxai_consent_v1") || "null")?.analytics)).toBe(true);
    expect(await two.evaluate(() => sessionStorage.getItem("bbai_landing_source_v1"))).toBeNull();
    expect(await two.evaluate(() => localStorage.getItem("blindboxai_consent_v1"))).toBeNull();
    const secondLink = new URL(await two.getByRole("link", { name: /View active listings on eBay/ }).first().getAttribute("href"), "http://127.0.0.1:3205");
    expect(secondLink.searchParams.has("campaign")).toBe(false);
    expect(secondLink.searchParams.has("source")).toBe(false);
  } finally {
    await first.close();
    await second.close();
  }
});
