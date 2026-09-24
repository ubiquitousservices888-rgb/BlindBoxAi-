import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const analytics = fs.readFileSync(new URL("../app/_components/CoreAnalytics.jsx", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../app/pro/page.jsx", import.meta.url), "utf8");
const waitlist = fs.readFileSync(new URL("../app/pro/waitlist.jsx", import.meta.url), "utf8");
const analyticsRoute = fs.readFileSync(new URL("../app/api/analytics/event/route.js", import.meta.url), "utf8");
const waitlistRoute = fs.readFileSync(new URL("../app/api/waitlist/route.js", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../supabase/migrations/20260924144500_owned_waitlist.sql", import.meta.url), "utf8");

test("page analytics accepts standard campaign and UTM campaign attribution", () => {
  assert.match(analytics, /params\.get\("campaign"\)/);
  assert.match(analytics, /params\.get\("utm_campaign"\)/);
  assert.match(analytics, /params\.get\("utm_source"\)/);
  assert.match(analytics, /params\.get\("utm_medium"\)/);
  assert.match(analytics, /params\.get\("utm_content"\)/);
  assert.match(analytics, /utmSource:\s*campaign\.utmSource/);
  assert.match(analytics, /utmCampaign:\s*campaign\.utmCampaign/);
});

test("pro waitlist posts only to the first-party API route", () => {
  assert.doesNotMatch(page, /NEXT_PUBLIC_WAITLIST_ENDPOINT/);
  assert.match(page, /<Waitlist\s*\/>/);
  assert.match(waitlist, /fetch\("\/api\/waitlist"/);
  assert.doesNotMatch(waitlist, /NEXT_PUBLIC_WAITLIST_ENDPOINT|endpoint\s*\}/);
});

test("first-party waitlist preserves attribution without putting email into analytics", () => {
  assert.match(waitlist, /body:\s*JSON\.stringify\(\{ email, companyWebsite, \.\.\.attribution \}\)/);
  assert.match(waitlistRoute, /waitlist_submit_attempt/);
  assert.match(waitlistRoute, /waitlist_submit_failed/);
  assert.match(waitlistRoute, /waitlist_signup/);
  assert.match(waitlistRoute, /ownedStorage:\s*true/);
  assert.match(waitlistRoute, /piiStored:\s*false/);
  const eventBuilder = waitlistRoute.match(/function eventFrom[\s\S]*?\n\}/);
  assert.ok(eventBuilder);
  assert.doesNotMatch(eventBuilder[0], /email/);
});

test("waitlist shows collection purpose and unsubscribe disclosure", () => {
  const privacy = fs.readFileSync(new URL("../app/cookies/page.jsx", import.meta.url), "utf8");
  assert.match(waitlist, /store your email only to notify you about BlindBoxAI reseller tools/i);
  assert.match(waitlist, /unsubscribe link/i);
  assert.match(waitlist, /href="\/cookies"/);
  assert.match(privacy, /Reseller tools waitlist/);
  assert.match(privacy, /Waitlist emails are not placed into analytics or affiliate telemetry/);
  assert.match(privacy, /unsubscribe option/);
});

test("waitlist storage is server-only Supabase with RLS", () => {
  assert.match(waitlistRoute, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(waitlist, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_URL/);
  assert.match(migration, /create table if not exists public\.waitlist_signups/);
  assert.match(migration, /email text not null unique/);
  assert.match(migration, /enable row level security/);
  assert.doesNotMatch(migration, /create policy/i);
});

test("analytics API still stores bounded UTM fields as metadata", () => {
  assert.match(analyticsRoute, /const utmSource = cleanDimension\(body\?\.utmSource\)/);
  assert.match(analyticsRoute, /const utmMedium = cleanDimension\(body\?\.utmMedium\)/);
  assert.match(analyticsRoute, /const utmCampaign = cleanDimension\(body\?\.utmCampaign\)/);
  assert.match(analyticsRoute, /const utmContent = cleanDimension\(body\?\.utmContent\)/);
});


test("waitlist hardening rejects duplicate inserts, traps bots, and uses friendly copy", () => {
  assert.match(waitlistRoute, /on_conflict=email&select=id/);
  assert.match(waitlistRoute, /resolution=ignore-duplicates,return=representation/);
  assert.match(waitlistRoute, /waitlist_submit_duplicate/);
  assert.match(waitlistRoute, /companyWebsite/);
  assert.match(waitlistRoute, /bot_honeypot/);
  assert.match(waitlist, /You're already on the list/);
  assert.match(waitlist, /You're on the list — we'll email you when reseller tools launch/);
});

test("waitlist demand reporting excludes owner tests", () => {
  const migration = fs.readFileSync(
    new URL("../supabase/migrations/20260924151500_waitlist_hardening_reporting.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /event_name = 'waitlist_signup'/);
  assert.match(migration, /coalesce\(source,''\) <> 'owner_test'/);
  assert.match(migration, /metadata->>'ownedStorage'/);
});
