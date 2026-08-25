import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const layout = fs.readFileSync(new URL('../app/layout.jsx', import.meta.url), 'utf8');
const consent = fs.readFileSync(new URL('../app/_components/CookieConsent.jsx', import.meta.url), 'utf8');
const analytics = fs.readFileSync(new URL('../app/_components/CoreAnalytics.jsx', import.meta.url), 'utf8');
const notice = fs.readFileSync(new URL('../app/cookies/page.jsx', import.meta.url), 'utf8');

test('root layout does not mount Vercel Analytics directly', () => {
  assert.doesNotMatch(layout, /import\s+\{\s*Analytics\s*\}\s+from\s+['"]@vercel\/analytics\/next['"]/);
  assert.doesNotMatch(layout, /<Analytics\s*\/>/);
  assert.match(layout, /<CookieConsent\s*\/>/);
});

test('consent control provides accept and reject choices', () => {
  assert.match(consent, /Accept optional analytics/);
  assert.match(consent, /Reject optional analytics/);
  assert.match(consent, /blindboxai_consent_v1/);
  assert.match(consent, /analytics:\s*analytics\s*===\s*true/);
});

test('custom analytics fails closed without explicit consent', () => {
  assert.match(analytics, /blindboxai_consent_v1/);
  assert.match(analytics, /parsed\?\.analytics\s*===\s*true/);
  assert.match(analytics, /if\s*\(!allowed/);
});

test('privacy notice and settings link are present', () => {
  assert.match(layout, /Cookie & privacy notice/);
  assert.match(layout, /PrivacySettingsButton/);
  assert.match(notice, /Optional analytics/);
  assert.match(notice, /Affiliate links/);
});
