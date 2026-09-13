# BlindBoxAI collectible-intelligence coverage

## Objective

BlindBoxAI is not limited to blind boxes. The research layer should cover collectible cards and collectible toys with one evidence policy: identify the exact item first, attach source and date to every value, separate retail/asking prices from completed-sale evidence, and show missing data as missing.

## Coverage model

### Collectible cards

The system should recognize and research Pokemon TCG, Magic: The Gathering, Yu-Gi-Oh!, sports cards, One Piece, Disney Lorcana, Digimon, Flesh and Blood, Dragon Ball, Star Wars Unlimited, Weiss Schwarz, Final Fantasy TCG, Cardfight!! Vanguard, Union Arena, and any other collectible/trading card through a generic fallback vertical.

For card identity, preserve at minimum: franchise/game, set, year, card name/subject, card number or catalog identifier, language, finish/parallel, serial numbering, autograph/relic attributes, raw/graded condition, grader and grade where applicable.

### Collectible toys

The system should recognize and research POP MART and its current character/series catalog, blind boxes and designer art toys generally, vinyl figures, plush pendants/dolls, action figures, MEGA/large-format figures, sofubi, limited designer figures, Funko, Bearbrick/Medicom, Sonny Angel, Smiski, Kidrobot, Hot Toys, and other collectible-toy makers through a generic fallback vertical.

For toy identity, preserve at minimum: maker/brand, franchise/character, series, item/figure, edition/rarity/secret status, size/format, release region, condition, packaging completeness and authenticity evidence.

## Evidence hierarchy

1. Official source for identity, release date, MSRP/retail price, checklist/set composition and manufacturer-published rarity or odds.
2. Completed-sale provider or marketplace evidence for secondary-market value. Prefer multiple exact-item completed transactions.
3. Market-price API when its methodology and update timestamp are available. Label it as a market-price estimate rather than a completed sale.
4. Active asking/listing prices are discovery only. Never present asking prices as proven value.
5. No evidence means no price claim.

Every public value should carry source, observed/updated date, currency, condition/variant, evidence type and confidence.

## Source strategy

- Existing BlindBoxAI reviewed catalog + public sold-history verifier: collectible toys and current blind-box records.
- The Card API: sports-card completed-sale verification when configured.
- TCGplayer API: broad TCG catalog/pricing only for an account that already has authorized API access. TCGplayer states that new API access is not currently being granted.
- Scryfall: Magic catalog/printing metadata and permitted API/bulk-data use, observing its published rate guidance.
- Pokemon: official Pokemon.com for release/checklist announcements. The older Pokemon TCG API is deprecated and should not become a new production dependency; use a maintained replacement/provider for machine-readable catalog/pricing.
- eBay Browse API: active-market discovery only. eBay's sold-history Marketplace Insights API is Limited Release, so do not assume access.
- POP MART official catalog: product identity, launch data and retail price; secondary-market value still requires sold evidence.

## Pokemon 30th priority

Pokemon TCG: 30th Celebration is a priority watch vertical. Official Pokemon sources state a worldwide release date of 2026-09-16. Before release, BlindBoxAI may publish official identity/release information but must not invent market values. After release, price research should prioritize exact-card/finish/condition matches and separate launch volatility from stable historical comps.

## Research order

1. Pokemon 30th Celebration and adjacent Pokemon 2026 releases.
2. Magic: The Gathering broad catalog and current sets.
3. Sports cards already registered in `data/know-it-all/sports-card-research-targets.json`.
4. Yu-Gi-Oh!, One Piece, Lorcana, Digimon, Flesh and Blood, Dragon Ball, Star Wars Unlimited, Weiss Schwarz, Final Fantasy, Vanguard and Union Arena.
5. POP MART full current catalog, then other collectible-toy manufacturers.
6. Generic fallback research for any collectible card or toy not yet explicitly mapped.

## Public-answer rule

A query must never cross categories merely because generic words overlap. A Pokemon question cannot return a POP MART result; a sports-card question cannot return a blind-box result; a Magic query cannot silently substitute another TCG. If the requested vertical has no verified value yet, return that limitation and preserve the query for research rather than substituting unrelated inventory.
