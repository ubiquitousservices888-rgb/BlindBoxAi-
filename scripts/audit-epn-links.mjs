import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  auditEpnUrl,
  buildEbaySearchUrl,
  shouldUseSkimlinks,
} from "../lib/affiliate-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const testCampid = "5339000000";
const collectibleQueries = [
  ["labubu", "POP MART Labubu"],
  ["hirono", "POP MART HIRONO"],
  ["skullpanda", "POP MART SKULLPANDA"],
  ["smiski", "SMISKI Series 1"],
  ["unicorno", "tokidoki Unicorno"],
];

for (const [family, query] of collectibleQueries) {
  for (const kind of ["active", "sold"]) {
    const url = buildEbaySearchUrl({
      query,
      kind,
      campid: testCampid,
      customId: `bb1s${family}fexamplek${kind}pseries`,
    });
    const result = auditEpnUrl(url, { kind, requireTracking: true });
    if (!result.ok) failures.push(`${family}/${kind}: ${result.reasons.join(", ")}`);
    if (shouldUseSkimlinks(url)) failures.push(`${family}/${kind}: eBay would be routed through Skimlinks`);
  }
}

const sourceRequirements = [
  ["lib/data.js", ["buildEbaySearchUrl", "NEXT_PUBLIC_EPN_CAMPID"]],
  ["lib/market-eligibility.mjs", ["all-blind-box-collectibles", "reviewed-positive-usd-transaction-evidence"]],
  ["lib/daily-product-pipeline.mjs", ["assertAffiliateEligibleSeries", "affiliateEligibility"]],
  ["app/api/out/ebay/route.js", ["ebayActiveLink", "ebaySoldLink", "NextResponse.redirect(target, 302)"]],
];

for (const [relativePath, requiredTokens] of sourceRequirements) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  for (const requiredToken of requiredTokens) {
    if (!source.includes(requiredToken)) failures.push(`${relativePath}: required affiliate path is missing`);
  }
}

if (failures.length > 0) {
  console.error("EPN links: FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`EPN links: PASS (${collectibleQueries.length} collectible families; active listings and sold comps audited separately)`);
  console.log("Skimlinks eBay exclusion: PASS");
}
