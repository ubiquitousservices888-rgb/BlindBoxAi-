# Public trust audit — 2026-09-15

Release blockers addressed in this branch:

- require at least two documented completed sales before a market record can be verified
- keep common and secret headline ranges separate
- show last evidence date and stale warning after 30 days
- hide empty video UI instead of advertising an empty feed
- noindex series pages with zero verified market records
- remove unverified pull-odds language from metadata
- fix brand/title separator in series H1 text
- give `/ask` and `/pro` unique metadata

Mr. Know It All was browser-tested on production before this change and returned a deterministic no-match response for a Pokémon 30th Charizard query. The control worked; the missing useful result was a coverage gap, not a dead button.
