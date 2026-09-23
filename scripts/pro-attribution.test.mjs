import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const analytics = fs.readFileSync(new URL("../app/_components/CoreAnalytics.jsx", import.meta.url), "utf8");
const waitlist = fs.readFileSync(new URL("../app/pro/waitlist.jsx", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../app/api/analytics/event/route.js", import.meta.url), "utf8");

test("page analytics accepts standard campaign and UTM campaign attribution", () => {
  assert.match(analytics, /params\.get\("campaign"\)/);
  assert.match(analytics, /params\.get\("utm_campaign"\)/);
  assert.match(analytics, /params\.get\("utm_source"\)/);
  assert.match(analytics, /params\.get\("utm_medium"\)/);
  assert.match(analytics, /params\.get\("utm_content"\)/);
  assert.match(analytics, /utmSource:\s*campaign\.utmSource/);
  assert.match(analytics, /utmCampaign:\s*campaign\.utmCampaign/);
});

test("pro waitlist success records path and attribution separately from email submission", () => {
  assert.match(waitlist, /function currentMarketingAttribution\(\)/);
  assert.match(waitlist, /path:\s*window\.location\.pathname\.slice/);
  assert.match(waitlist, /campaign:\s*campaign\s*\|\|\s*"none"/);
  assert.match(waitlist, /track\("waitlist_signup",\s*attribution\)/);
  assert.match(waitlist, /event:\s*"waitlist_signup",[\s\S]*\.\.\.attribution,[\s\S]*providerConfirmed:\s*true/);

  const analyticsBlock = waitlist.match(/body:\s*JSON\.stringify\(\{\s*event:\s*"waitlist_signup",[\s\S]*?\}\),/);
  assert.ok(analyticsBlock, "waitlist analytics request must exist");
  assert.doesNotMatch(analyticsBlock[0], /\bemail\b/);
});

test("analytics API stores bounded UTM fields as metadata", () => {
  assert.match(route, /const utmSource = cleanDimension\(body\?\.utmSource\)/);
  assert.match(route, /const utmMedium = cleanDimension\(body\?\.utmMedium\)/);
  assert.match(route, /const utmCampaign = cleanDimension\(body\?\.utmCampaign\)/);
  assert.match(route, /const utmContent = cleanDimension\(body\?\.utmContent\)/);
  assert.match(route, /metadata\.providerConfirmed = body\?\.providerConfirmed === true/);
  assert.match(route, /metadata:\s*Object\.keys\(metadata\)\.length \? metadata : undefined/);
});
