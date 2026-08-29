import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertArtifactIsSecretFree,
  buildEligibleProduct,
  candidatePreview,
  createCandidate,
  saveGithubState,
  verifyLiveUrl,
} from "../lib/daily-product-pipeline.mjs";
import {
  assertCandidateCtas,
  hardenCandidateForPublishing,
  loadGithubStatePaginated,
} from "../lib/daily-product-publish-safety.mjs";
import { expireStaleStages, selectPriorityProduct } from "../lib/automation-priority.mjs";
import { applySocialAttribution } from "../lib/social-attribution.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERIES_DIR = path.join(ROOT, "data", "series");
const OUTPUT_DIR = path.join(ROOT, "output", "daily-product");
const env = process.env;
const repo = env.GITHUB_REPOSITORY;
const githubToken = env.GITHUB_TOKEN;
const runId = env.GITHUB_RUN_ID ?? `local-${Date.now()}`;
const sourceCommit = env.GITHUB_SHA ?? null;
const siteUrl = env.BLINDBOXAI_SITE_URL ?? "https://www.blindboxai.com";
const priorityTerms = String(env.BLINDBOXAI_PRIORITY_TERMS ?? "twinkle")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const stagedTtlHours = Number(env.BLINDBOXAI_STAGED_TTL_HOURS ?? 48);

function writeOutput(name, value) {
  if (!env.GITHUB_OUTPUT) return;
  fs.appendFileSync(env.GITHUB_OUTPUT, `${name}=${String(value).replaceAll("\n", "%0A")}\n`);
}

function loadSeries() {
  return fs.readdirSync(SERIES_DIR)
    .filter((name) => name.endsWith(".json") && !name.startsWith("_"))
    .map((name) => {
      try { return JSON.parse(fs.readFileSync(path.join(SERIES_DIR, name), "utf8")); }
      catch { return null; }
    })
    .filter(Boolean);
}

if (!repo || !githubToken) throw new Error("Autonomous stage requires GITHUB_REPOSITORY and GITHUB_TOKEN");

const loaded = await loadGithubStatePaginated({ repo, token: githubToken });
let state = loaded.state;
const stale = expireStaleStages(state, { ttlHours: stagedTtlHours });
if (stale.expired.length) {
  state = stale.state;
  await saveGithubState({ repo, token: githubToken, issue: loaded.issue, state });
  console.log(`EXPIRED_STALE_STAGED: ${stale.expired.join(",")}`);
}

const alreadyStaged = Object.entries(state.products ?? {}).find(([, value]) => value?.status === "STAGED");
if (alreadyStaged) {
  console.log(`WAITING_FOR_APPROVAL: ${alreadyStaged[0]}`);
  writeOutput("has_candidate", "false");
  writeOutput("reason", "waiting_for_existing_candidate");
  process.exit(0);
}

const eligible = [];
for (const series of loadSeries()) {
  try {
    const product = buildEligibleProduct(series, { siteUrl });
    eligible.push({
      ...product,
      automationPriority: series.automationPriority,
      marketSelection: series.marketSelection,
    });
  } catch {}
}

const product = selectPriorityProduct(eligible, state, { priorityTerms });
if (!product) {
  console.log("NO VERIFIED NEW PRODUCT AVAILABLE");
  writeOutput("has_candidate", "false");
  writeOutput("reason", "no_verified_new_product");
  process.exit(0);
}

await verifyLiveUrl(product.ctaUrl);
await verifyLiveUrl(product.graphicUrl, { requireImage: true });
const candidate = hardenCandidateForPublishing(
  applySocialAttribution(createCandidate(product, { runId, sourceCommit })),
);
assertArtifactIsSecretFree(candidate);
assertCandidateCtas(candidate);
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUTPUT_DIR, "candidate.json"), JSON.stringify(candidate, null, 2) + "\n");
fs.writeFileSync(path.join(OUTPUT_DIR, "preview.md"), candidatePreview(candidate));
writeOutput("has_candidate", "true");
writeOutput("reason", priorityTerms.some((term) => `${product.productId} ${product.name}`.toLowerCase().includes(term.toLowerCase())) ? "priority_candidate" : "fallback_candidate");
console.log(`STAGED_ARTIFACT_READY: ${candidate.productId}`);
