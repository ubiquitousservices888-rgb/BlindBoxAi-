import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  evaluateOfferPrice,
  revenueOfferId,
  sortRevenueOffers,
  TWINKLE_STRONG_BREAD_OFFER,
  verifiedFigureOffer,
} from '../lib/buy-or-pass-core.mjs';

const redirectRoute = fs.readFileSync(new URL('../app/api/out/offer/route.js', import.meta.url), 'utf8');
const indexPage = fs.readFileSync(new URL('../app/tools/buy-or-pass/page.jsx', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('../app/sitemap.js', import.meta.url), 'utf8');

test('Twinkle Strong Bread is the priority buyer-intent offer', () => {
  assert.equal(TWINKLE_STRONG_BREAD_OFFER.id, 'twinkle-twinkle-savor-the-moment--strong-bread');
  assert.equal(TWINKLE_STRONG_BREAD_OFFER.referenceLow, 43);
  assert.equal(TWINKLE_STRONG_BREAD_OFFER.referenceCurrent, 46);
  assert.equal(TWINKLE_STRONG_BREAD_OFFER.referenceHigh, 55);
  assert.match(TWINKLE_STRONG_BREAD_OFFER.sourceUrl, /^https:\/\//);
  assert.match(TWINKLE_STRONG_BREAD_OFFER.officialUrl, /^https:\/\//);
});

test('verified series figures become deterministic revenue offers', () => {
  const offer = verifiedFigureOffer(
    { slug: 'sample-series', name: 'Sample Series', brand: 'Sample Brand', marketPricing: { checkedAt: '2026-08-25' } },
    { name: 'Figure A', rarity: 'common', resaleLow: 30, resaleHigh: 50, needsReview: false, evidence: 'Reviewed sold transaction evidence' },
  );
  assert.equal(offer.id, 'sample-series--figure-a');
  assert.equal(offer.referenceCurrent, 40);
  assert.equal(offer.checkedAt, '2026-08-25');
});

test('unreviewed or placeholder figures never become offers', () => {
  assert.equal(verifiedFigureOffer(
    { slug: 'sample', name: 'Sample', brand: 'Brand' },
    { name: 'Figure', resaleLow: 10, resaleHigh: 20, needsReview: true, evidence: 'Reviewed evidence' },
  ), null);
  assert.equal(verifiedFigureOffer(
    { slug: 'sample', name: 'Sample', brand: 'Brand' },
    { name: 'Figure', resaleLow: 10, resaleHigh: 20, needsReview: false, evidence: 'placeholder estimate' },
  ), null);
});

test('price engine rejects invalid prices and separates verify/good/fair/high', () => {
  const offer = TWINKLE_STRONG_BREAD_OFFER;
  assert.equal(evaluateOfferPrice(offer, '').ok, false);
  assert.equal(evaluateOfferPrice(offer, 20).verdict.code, 'VERIFY');
  assert.equal(evaluateOfferPrice(offer, 47).verdict.code, 'GOOD');
  assert.equal(evaluateOfferPrice(offer, 52).verdict.code, 'FAIR');
  assert.equal(evaluateOfferPrice(offer, 60).verdict.code, 'HIGH');
});

test('offer ids are URL-safe and stable', () => {
  assert.equal(revenueOfferId('Skullpanda The Mirage', 'The One & Only'), 'skullpanda-the-mirage--the-one-only');
});

test('priority sort keeps Twinkle first', () => {
  const offers = sortRevenueOffers([
    { id: 'b', priority: 100, seriesName: 'B', figure: 'B' },
    TWINKLE_STRONG_BREAD_OFFER,
  ]);
  assert.equal(offers[0].id, TWINKLE_STRONG_BREAD_OFFER.id);
});

test('affiliate redirect is allowlisted and never accepts raw marketplace URLs', () => {
  assert.match(redirectRoute, /getRevenueOffer\(offerId\)/);
  assert.match(redirectRoute, /buildEbaySearchUrl/);
  assert.match(redirectRoute, /placement:\s*"buy_or_pass"/);
  assert.doesNotMatch(redirectRoute, /url\.searchParams\.get\(["'](?:target|url|destination)["']\)/);
  assert.doesNotMatch(redirectRoute, /ebay\.com\/itm\//i);
});

test('buyer-intent index contains nearby affiliate-independence disclosure and sitemap discovery', () => {
  assert.match(indexPage, /commission does not change the Buy-or-Pass result/);
  assert.match(sitemap, /tools\/buy-or-pass/);
});
