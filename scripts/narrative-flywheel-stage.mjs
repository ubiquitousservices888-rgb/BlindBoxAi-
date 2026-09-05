import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildNarrativeCandidate,
  buildNarrativePreview,
  selectNarrativeSeries,
} from "../lib/narrative-flywheel.mjs";
import {
  buildUesNetworkCandidate,
  buildUesNetworkPreview,
} from "../lib/ues-network-flywheel.mjs";
import {
  buildCompoundingCycle,
  buildCompoundingPreview,
} from "../lib/generational-compounding.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERIES_DIR = path.join(ROOT, "data", "series");
const OUTPUT_DIR = path.resolve(ROOT, process.env.NARRATIVE_OUTPUT_DIR ?? "output/narrative-flywheel");
const priorityTerms = String(process.env.BLINDBOXAI_PRIORITY_TERMS ?? "twinkle")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function loadSeries() {
  return fs.readdirSync(SERIES_DIR)
    .filter((name) => name.endsWith(".json") && !name.startsWith("_"))
    .map((name) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(SERIES_DIR, name), "utf8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

const selected = selectNarrativeSeries(loadSeries(), { priorityTerms });
if (!selected) throw new Error("No verified evidence-backed series is available for narrative staging");

const candidate = buildNarrativeCandidate(selected, { priorityTerms });
const connectionCandidate = buildUesNetworkCandidate();
const compoundingCycle = buildCompoundingCycle(candidate);

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUTPUT_DIR, "candidate.json"), JSON.stringify(candidate, null, 2) + "\n");
fs.writeFileSync(path.join(OUTPUT_DIR, "preview.md"), buildNarrativePreview(candidate));
fs.writeFileSync(path.join(OUTPUT_DIR, "ues-network-candidate.json"), JSON.stringify(connectionCandidate, null, 2) + "\n");
fs.writeFileSync(path.join(OUTPUT_DIR, "ues-network-preview.md"), buildUesNetworkPreview(connectionCandidate));
fs.writeFileSync(path.join(OUTPUT_DIR, "generational-compounding-cycle.json"), JSON.stringify(compoundingCycle, null, 2) + "\n");
fs.writeFileSync(path.join(OUTPUT_DIR, "generational-compounding-preview.md"), buildCompoundingPreview(compoundingCycle));

console.log(`NARRATIVE_READY_FOR_REVIEW: ${candidate.id}`);
console.log(`HOOK_FAMILY: ${candidate.hookFamily}`);
console.log(`SERIES: ${candidate.source.seriesName}`);
console.log(`UES_NETWORK_READY_FOR_REVIEW: ${connectionCandidate.id}`);
console.log(`UES_NETWORK_CAMPAIGN: ${connectionCandidate.campaign.id}`);
console.log(`COMPOUNDING_CYCLE_READY_FOR_REVIEW: ${compoundingCycle.cycleId}`);
console.log(`COMPOUNDING_AUTOMATIC_PROMOTION: ${compoundingCycle.promotionGate.automaticPromotion}`);
console.log("NO_AUTONOMOUS_PUBLISH: true");
