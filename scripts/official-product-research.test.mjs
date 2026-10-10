import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOfficialProducts, refreshOfficialProducts, OFFICIAL_PRODUCT_URL, OFFICIAL_COLLECTION_URL } from '../lib/official-product-research.mjs';
import { researchFreshness } from '../lib/question-research.mjs';
const time = '2026-10-10T12:00:00Z';
const html = price => `<a href="${OFFICIAL_PRODUCT_URL}"><div>THE MONSTERS Hair Salon Series Vinyl Plush Pendant Blind Box</div><div>$${price}</div></a>`;
test('new retrieval extracts changed official retail price without making sold evidence', () => {
  const [item] = parseOfficialProducts(html('42.50'), time);
  assert.equal(item.retailUSD, 42.5);
  assert.equal(item.completedSaleEvidence, false);
  assert.equal(item.published, null);
  assert.equal(researchFreshness(item, Date.parse(time)), 'fresh');
  assert.equal(researchFreshness(item, Date.parse(time) + 49 * 3600000), 'stale');
});
test('ambiguous prices and other destinations never become verified facts', () => {
  assert.deepEqual(parseOfficialProducts(html('39.99 $50.00'), time), []);
  assert.deepEqual(parseOfficialProducts(html('39.99').replace(OFFICIAL_PRODUCT_URL, 'https://example.org'), time), []);
});
test('outage produces no replacement fact and fetch is fixed and redirect-free', async () => {
  const result = await refreshOfficialProducts({ fetchImpl: async (url, options) => {
    assert.equal(url, OFFICIAL_COLLECTION_URL);
    assert.equal(options.redirect, 'error');
    return new Response('down', { status: 503 });
  }});
  assert.deepEqual(result, []);
});
