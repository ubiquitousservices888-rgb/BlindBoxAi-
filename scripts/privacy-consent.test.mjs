import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { isAnalyticsConsentGranted, setPostHogConsent } from '../lib/posthog-client.mjs';

const layout = fs.readFileSync(new URL('../app/layout.jsx', import.meta.url), 'utf8');
const consent = fs.readFileSync(new URL('../app/_components/CookieConsent.jsx', import.meta.url), 'utf8');
const analytics = fs.readFileSync(new URL('../app/_components/CoreAnalytics.jsx', import.meta.url), 'utf8');
const posthog = fs.readFileSync(new URL('../lib/posthog-client.mjs', import.meta.url), 'utf8');
const notice = fs.readFileSync(new URL('../app/cookies/page.jsx', import.meta.url), 'utf8');

test('root layout does not mount Vercel Analytics directly', () => {
  assert.doesNotMatch(layout, /import\s+\{\s*Analytics\s*\}\s+from\s+['"]@vercel\/analytics\/next['"]/);
  assert.doesNotMatch(layout, /<Analytics\s*\/>/);
  assert.match(layout, /<CookieConsent\s*\/>/);
});

test('consent control provides accept and reject choices', () => {
  assert.match(consent, /Accept optional analytics/);
  assert.match(consent, /Reject optional analytics/);
  assert.match(consent, /POSTHOG_CONSENT_STORAGE_KEY/);
  assert.match(posthog, /POSTHOG_CONSENT_STORAGE_KEY\s*=\s*"blindboxai_consent_v2"/);
  assert.match(consent, /analytics:\s*analytics\s*===\s*true/);
  assert.match(consent, /addEventListener\('storage', onStorage\)/);
  assert.match(analytics, /addEventListener\("storage", onStorage\)/);
  const saveConsent = consent.slice(consent.indexOf('function saveConsent'), consent.indexOf('function respectAnalyticsConsent'));
  assert.ok(saveConsent.indexOf('setPostHogConsent') < saveConsent.indexOf('window.dispatchEvent'));
});

test('custom analytics fails closed without explicit consent', () => {
  assert.match(posthog, /if \(stored\.available\)/);
  assert.match(posthog, /return runtimeConsentFallback && runtimeConsent === true/);
  assert.match(analytics, /if\s*\(!allowed/);
});

test('privacy notice and settings link are present', () => {
  assert.match(layout, /Cookie & privacy notice/);
  assert.match(layout, /PrivacySettingsButton/);
  assert.match(notice, /Optional analytics/);
  assert.match(notice, /Affiliate links/);
});

test('runtime choice wins when persistence fails; stored consent wins across tabs otherwise', async (t) => {
  const originalWindow = globalThis.window;
  const originalToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const originalHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  let stored = null;
  delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
  globalThis.window = {
    localStorage: { getItem: () => stored, removeItem: () => {} },
    sessionStorage: { removeItem: () => {} },
    location: { hostname: 'localhost' },
  };
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalToken === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
    else process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = originalToken;
    if (originalHost === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
    else process.env.NEXT_PUBLIC_POSTHOG_HOST = originalHost;
  });

  stored = JSON.stringify({ analytics: false });
  await setPostHogConsent(true, { persistenceUnavailable: true });
  assert.equal(isAnalyticsConsentGranted(), true);

  stored = JSON.stringify({ analytics: true });
  await setPostHogConsent(false, { persistenceUnavailable: true });
  assert.equal(isAnalyticsConsentGranted(), false);

  await setPostHogConsent(false);
  assert.equal(isAnalyticsConsentGranted(), true);

  stored = null;
  await setPostHogConsent(true);
  assert.equal(isAnalyticsConsentGranted(), false);
});
