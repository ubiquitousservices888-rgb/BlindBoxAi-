import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildShoppingCandidate, validateShoppingConfig } from "../lib/evergreen-shopping.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = process.env.SHOPPING_OPPORTUNITIES_FILE ?? path.join(root, "data", "evergreen-shopping-opportunities.json");
const outputDir = process.env.SHOPPING_OUTPUT_DIR ?? path.join(root, "output", "shopping");
const config = JSON.parse(fs.readFileSync(source, "utf8"));
validateShoppingConfig(config);

const candidate = buildShoppingCandidate(config, {
  amazonEligible: process.env.AMAZON_ASSOCIATES_ACTIVE === "true",
  youtubeShoppingEligible: process.env.YOUTUBE_SHOPPING_AFFILIATE_ACTIVE === "true",
});

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "candidate.json"), JSON.stringify(candidate, null, 2) + "\n");
fs.writeFileSync(path.join(outputDir, "preview.md"), [
  `# ${candidate.title}`,
  "",
  candidate.publicCaption,
  "",
  `Amazon tag lookup: ${candidate.productTagging.searchTerm}`,
  `Tagging ready: ${candidate.productTagging.ready ? "yes" : "no — account eligibility must be confirmed"}`,
  "",
  "State: READY_FOR_REVIEW",
].join("\n"));

console.log(`READY_FOR_REVIEW: ${candidate.id}`);
console.log(`YOUTUBE_AMAZON_TAGGING_READY: ${candidate.productTagging.ready}`);
