import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPartnershipCandidate, buildPartnershipPreview, partnershipEvidenceStatus } from "../lib/partnership-flywheel.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputFile = path.resolve(ROOT, process.env.PARTNERSHIP_OPPORTUNITIES_FILE ?? "data/partnership-opportunities.json");
const outputDir = path.resolve(ROOT, process.env.PARTNERSHIP_OUTPUT_DIR ?? "output/partnership-flywheel");
const focusTerms = String(process.env.PARTNERSHIP_FOCUS_TERMS ?? "pokemon,tcg,sealed,booster,graded,slab,authentication,reseal,mystery-box,japanese-exclusive,premium-art-toy,pop-mart,labubu,collectibles,affiliate")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

// Checked-at dates are evidence timestamps, not a renewable lease. Never
// change them automatically or stage an opportunity from outdated research.
const now = new Date();
const source = JSON.parse(fs.readFileSync(inputFile, "utf8"));
const recent = [];
const excluded = [];
for (const opportunity of source.opportunities ?? []) {
  if (opportunity?.active === false) continue;
  const evidenceStatus = partnershipEvidenceStatus(opportunity?.checkedAt, now);
  if (evidenceStatus !== "fresh") {
    excluded.push({
      id: opportunity?.id ?? "unknown",
      checkedAt: opportunity?.checkedAt ?? null,
      reason: evidenceStatus,
    });
    continue;
  }
  recent.push(opportunity);
}

fs.mkdirSync(outputDir, { recursive: true });
// Do not allow files left by a previous local invocation to masquerade as new output.
const candidatePath = path.join(outputDir, "candidate.json");
if (fs.existsSync(candidatePath)) fs.unlinkSync(candidatePath);

const status = {
  schema: "blindboxai.partnership-staging-status/v1",
  state: recent.length ? "READY_FOR_REVIEW" : "NEEDS_FRESH_RESEARCH",
  evaluatedAt: now.toISOString(),
  recentCount: recent.length,
  excluded,
};
fs.writeFileSync(path.join(outputDir, "status.json"), JSON.stringify(status, null, 2) + "\n");

if (!recent.length) {
  const preview = [
    "# Partnership Flywheel — fresh research required",
    "",
    "No active partnership opportunity has a valid completed-check UTC timestamp from the last 30 days.",
    "Do not treat this as an approval, a live availability check, or a candidate.",
    "A researcher must re-check official terms and eligibility, then record a completed-check ISO UTC timestamp (YYYY-MM-DDTHH:mm:ssZ) in checkedAt. Never backdate or automatically renew evidence.",
    "",
    "## Excluded sources",
    ...excluded.map(({ id, checkedAt, reason }) => `- ${id}: ${reason} (last checked ${checkedAt})`),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(outputDir, "preview.md"), preview);
  console.log("::warning::NEEDS_FRESH_RESEARCH: No currently checked partnership candidate was staged; see status.json.");
} else {
  const candidate = buildPartnershipCandidate(recent, { date: now, focusTerms });
  fs.writeFileSync(candidatePath, JSON.stringify(candidate, null, 2) + "\n");
  fs.writeFileSync(path.join(outputDir, "preview.md"), buildPartnershipPreview(candidate));
  console.log(`PARTNERSHIP_READY_FOR_REVIEW: ${candidate.id}`);
  console.log(`SELECTED: ${candidate.selected.name}`);
  console.log(`TYPE: ${candidate.selected.type}`);
  console.log(`ELIGIBILITY: ${candidate.selected.eligibilityStatus}`);
  console.log("NO_AUTONOMOUS_CONTACT: true");
  if (excluded.length) console.log(`::warning::Excluded ${excluded.length} stale, invalid, or future-dated partnership sources; see status.json.`);
}
