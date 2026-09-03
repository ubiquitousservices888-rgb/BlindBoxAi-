import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPartnershipCandidate, buildPartnershipPreview } from "../lib/partnership-flywheel.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputFile = path.resolve(ROOT, process.env.PARTNERSHIP_OPPORTUNITIES_FILE ?? "data/partnership-opportunities.json");
const outputDir = path.resolve(ROOT, process.env.PARTNERSHIP_OUTPUT_DIR ?? "output/partnership-flywheel");
const focusTerms = String(process.env.PARTNERSHIP_FOCUS_TERMS ?? "collectibles,blind-box,affiliate,ambassador,website")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const source = JSON.parse(fs.readFileSync(inputFile, "utf8"));
const candidate = buildPartnershipCandidate(source.opportunities ?? [], { focusTerms });

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "candidate.json"), JSON.stringify(candidate, null, 2) + "\n");
fs.writeFileSync(path.join(outputDir, "preview.md"), buildPartnershipPreview(candidate));

console.log(`PARTNERSHIP_READY_FOR_REVIEW: ${candidate.id}`);
console.log(`SELECTED: ${candidate.selected.name}`);
console.log(`TYPE: ${candidate.selected.type}`);
console.log(`ELIGIBILITY: ${candidate.selected.eligibilityStatus}`);
console.log("NO_AUTONOMOUS_CONTACT: true");
