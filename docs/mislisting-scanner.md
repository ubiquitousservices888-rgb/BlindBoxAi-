# Mislisting Scanner v1

Research-only scanner. It never creates videos and never publishes.

Policy limits implemented:
- Browse API only, application access token via client-credentials.
- Hard budget: 500 Browse calls/day maximum; initial watchlist uses 2/day.
- Seller names are not persisted.
- Only identifier/variant mismatch flags are generated. Active listing prices are displayed as listing facts only; they are not used to suggest or model prices.
- Flag records expire after six hours.

eBay API License Agreement rule implemented:
> "Displayed item listing information may not be more than six (6) hours older than information displayed on the eBay Site."

Source: https://developer.ebay.com/join/api-license-agreement
