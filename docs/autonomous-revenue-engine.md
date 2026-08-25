# BlindBoxAI autonomous revenue engine

## Purpose

Turn reviewed blind-box price evidence into buyer-intent utilities that can earn affiliate revenue without giving an agent spending, financial-account, marketplace-account, DNS, or broad production-admin permissions.

## Production behavior

1. `allRevenueOffers()` builds an allowlisted offer catalog from reviewed series figures plus the dated Twinkle Twinkle Strong Bread reference.
2. `/tools/buy-or-pass` exposes only reviewed offers and prioritizes Twinkle.
3. Each `/tools/buy-or-pass/<offer>` page calculates a deterministic price result before presenting marketplace links.
4. The marketplace links call `/api/out/offer`, which resolves only a known offer ID. Callers cannot supply an arbitrary destination URL.
5. The redirect adds the existing EPN campaign tracking, logs a non-PII click event privately, and sends the visitor to an eBay search rather than a specific seller listing.
6. `sitemap.xml` automatically includes buyer-intent pages, allowing search engines to discover every reviewed offer without creating low-value placeholder pages.
7. New reviewed figures added to the existing series dataset automatically become eligible buyer-intent offers on the next deployment; unreviewed, missing-price, malformed, and placeholder records are rejected.

## Autonomy boundary

The buyer-intent revenue surface is autonomous after deployment. It does not require a person to calculate prices, create individual offer pages, build affiliate search URLs, or maintain the sitemap.

The existing external social publishing pipeline keeps its protected production approval gate. This revenue engine does not remove that control and does not add any spending or financial permissions.

## Cost

No additional paid service, database, CMP, keyword platform, or API is required by this engine.
