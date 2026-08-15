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
const testCustomId = "bb1sreleasegatefexamplekactivepseries";

for (const kind of ["active", "sold"]) {
  const url = buildEbaySearchUrl({
    query: "POP MART Labubu",
    kind,
    campid: testCampid,
    customId: testCustomId.replace("active", kind),
  });
  const result = auditEpnUrl(url, { kind, requireTracking: true });
  if (!result.ok) failures.push(`${kind}: ${result.reasons.join(", ")}`);
  if (shouldUseSkimlinks(url)) failures.push(`${kind}: eBay would be routed through Skimlinks`);
}

const sourceRequirements = [
  ["lib/data.js", ["buildEbaySearchUrl", "NEXT_PUBLIC_EPN_CAMPID"]],
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
  console.log("EPN links: PASS (active listings and sold comps audited separately)");
  console.log("Skimlinks eBay exclusion: PASS");
}

