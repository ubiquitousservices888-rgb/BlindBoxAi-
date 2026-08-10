import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DISCLOSURE,
  assertArtifactIsSecretFree,
  assertProductionContext,
  candidatePreview,
  createBufferImagePost,
  createCandidate,
  finalizeProductState,
  markFailedIfStaged,
  markStaged,
  publicationIsComplete,
  saveGithubState,
  selectNextProduct,
  updatePublicationState,
  validateCandidateHash,
  validatePublishableText,
  verifyLiveUrl,
} from "../lib/daily-product-pipeline.mjs";
import {
  assertBufferOrganizationId,
  assertCandidateCtas,
  discoverScopedBufferChannels,
  findExistingBufferPostPaginated,
  hardenCandidateForPublishing,
  loadGithubStatePaginated,
  verifyExclusiveEnvironmentGate,
} from "../lib/daily-product-publish-safety.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERIES_DIR = path.join(ROOT, "data", "series");
const OUTPUT_DIR = path.join(ROOT, "output", "daily-product");
const CANDIDATE_FILE = path.join(OUTPUT_DIR, "candidate.json");
const PREVIEW_FILE = path.join(OUTPUT_DIR, "preview.md");
const command = process.argv[2] ?? "stage";
const env = process.env;
const repo = env.GITHUB_REPOSITORY;
const githubToken = env.GITHUB_TOKEN;
const runId = env.GITHUB_RUN_ID ?? `local-${Date.now()}`;
const sourceCommit = env.GITHUB_SHA ?? null;
const siteUrl = env.BLINDBOXAI_SITE_URL ?? "https://www.blindboxai.com";

function loadSeries() {
  return fs.readdirSync(SERIES_DIR)
    .filter((name) => name.endsWith(".json") && !name.startsWith("_"))
    .map((name) => {
      try { return JSON.parse(fs.readFileSync(path.join(SERIES_DIR, name), "utf8")); }
      catch (error) { return { __invalidFile: name, __error: error.message }; }
    });
}
function writeOutput(name, value) {
  if (!env.GITHUB_OUTPUT) return;
  fs.appendFileSync(env.GITHUB_OUTPUT, `${name}=${String(value).replaceAll("\n", "%0A")}\n`);
}
function writeSummary(markdown) {
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  else console.log(markdown);
}
function readCandidate() {
  const candidate = JSON.parse(fs.readFileSync(CANDIDATE_FILE, "utf8"));
  validateCandidateHash(candidate);
  assertArtifactIsSecretFree(candidate);
  assertCandidateCtas(candidate);
  for (const caption of Object.values(candidate.captions ?? {})) validatePublishableText(caption);
  return candidate;
}
function stagedAwaitingApproval(state) {
  return Object.entries(state.products ?? {}).find(([, value]) => value?.status === "STAGED");
}

async function stage() {
  if (!repo || !githubToken) throw new Error("Stage requires GITHUB_REPOSITORY and GITHUB_TOKEN");
  const { state } = await loadGithubStatePaginated({ repo, token: githubToken });
  const staged = stagedAwaitingApproval(state);
  if (staged) {
    console.log(`WAITING_FOR_APPROVAL: ${staged[0]} (${staged[1].status})`);
    writeOutput("has_candidate", "false");
    writeOutput("reason", "waiting_for_existing_candidate");
    return;
  }
  const product = selectNextProduct(loadSeries(), state, { siteUrl });
  if (!product) {
    console.log("NO VERIFIED NEW PRODUCT AVAILABLE");
    writeOutput("has_candidate", "false");
    writeOutput("reason", "no_verified_new_product");
    return;
  }
  await verifyLiveUrl(product.ctaUrl);
  await verifyLiveUrl(product.graphicUrl, { requireImage: true });
  const candidate = hardenCandidateForPublishing(createCandidate(product, { runId, sourceCommit }));
  assertArtifactIsSecretFree(candidate);
  assertCandidateCtas(candidate);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(CANDIDATE_FILE, JSON.stringify(candidate, null, 2) + "\n");
  fs.writeFileSync(PREVIEW_FILE, candidatePreview(candidate));
  writeOutput("has_candidate", "true");
  console.log(`STAGED_ARTIFACT_READY: ${candidate.productId}`);
}

async function markCandidateStaged() {
  if (!repo || !githubToken) throw new Error("mark-staged requires GITHUB_REPOSITORY and GITHUB_TOKEN");
  const candidate = readCandidate();
  const loaded = await loadGithubStatePaginated({ repo, token: githubToken });
  const nextState = markStaged(loaded.state, candidate);
  await saveGithubState({ repo, token: githubToken, issue: loaded.issue, state: nextState });
  console.log(`STAGED: ${candidate.productId}`);
  writeSummary(candidatePreview(candidate));
}

async function markFailed() {
  if (!repo || !githubToken) throw new Error("mark-failed requires GITHUB_REPOSITORY and GITHUB_TOKEN");
  const candidate = readCandidate();
  const loaded = await loadGithubStatePaginated({ repo, token: githubToken });
  const nextState = markFailedIfStaged(loaded.state, candidate, env.FAILURE_REASON ?? "publish job did not complete");
  await saveGithubState({ repo, token: githubToken, issue: loaded.issue, state: nextState });
  console.log(`FAILURE_STATE_RECORDED: ${candidate.productId}`);
}

async function preflight() {
  const candidate = readCandidate();
  await verifyLiveUrl(candidate.ctaUrl);
  await verifyLiveUrl(candidate.graphicUrl, { requireImage: true });
  if (!candidate.captions || !Object.keys(candidate.captions).length) throw new Error("Candidate has no captions");
  assertCandidateCtas(candidate);
  for (const text of Object.values(candidate.captions)) {
    validatePublishableText(text);
    if (!text.includes(DISCLOSURE)) throw new Error("Disclosure missing");
  }
  console.log(`PREFLIGHT_OK: ${candidate.productId}`);
  return candidate;
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function publish() {
  const organizationId = assertBufferOrganizationId(env.BUFFER_ORGANIZATION_ID);
  assertProductionContext({ token: env.BUFFER_API_TOKEN, environmentName: env.PRODUCTION_ENVIRONMENT });
  if (!repo || !githubToken) throw new Error("Publish requires GITHUB_REPOSITORY and GITHUB_TOKEN");
  await verifyExclusiveEnvironmentGate({
    repo,
    token: githubToken,
    expectedReviewer: env.PRODUCTION_REVIEWER ?? "ubiquitousservices888-rgb",
  });
  const candidate = await preflight();
  const loaded = await loadGithubStatePaginated({ repo, token: githubToken });
  let state = loaded.state;
  const stateEntry = state.products?.[candidate.productId];
  if (!stateEntry || !["STAGED", "PARTIAL"].includes(stateEntry.status) || stateEntry.candidateHash !== candidate.candidateHash) {
    throw new Error("Approved artifact does not match persistent STAGED/PARTIAL state");
  }
  const channels = (await discoverScopedBufferChannels({
    token: env.BUFFER_API_TOKEN,
    organizationId,
  })).filter((channel) => candidate.captions[channel.service]);
  if (!channels.length) {
    state = finalizeProductState(state, candidate, []);
    await saveGithubState({ repo, token: githubToken, issue: loaded.issue, state });
    throw new Error("No compatible connected Buffer channels found in configured organization");
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    for (const channel of channels) {
      if (publicationIsComplete(state, candidate, channel)) continue;
      const text = candidate.captions[channel.service];
      try {
        const existing = await findExistingBufferPostPaginated({
          token: env.BUFFER_API_TOKEN,
          organizationId,
          channelId: channel.id,
          text,
        });
        const post = existing ?? await createBufferImagePost({
          token: env.BUFFER_API_TOKEN,
          channelId: channel.id,
          text,
          graphicUrl: candidate.graphicUrl,
        });
        state = updatePublicationState(state, candidate, channel, {
          status: "published",
          externalId: post.id,
          deduplicated: Boolean(existing),
          error: null,
        });
      } catch (error) {
        state = updatePublicationState(state, candidate, channel, {
          status: "failed",
          externalId: null,
          deduplicated: false,
          error: String(error.message ?? error).slice(0, 500),
        });
      }
      await saveGithubState({ repo, token: githubToken, issue: loaded.issue, state });
    }
    const failures = channels.filter((channel) => !publicationIsComplete(state, candidate, channel));
    if (!failures.length) break;
    if (attempt < 3) await sleep(1000 * (2 ** (attempt - 1)));
  }

  state = finalizeProductState(state, candidate, channels);
  await saveGithubState({ repo, token: githubToken, issue: loaded.issue, state });
  const entry = state.products[candidate.productId];
  const lines = Object.values(entry.publications ?? {}).map((result) => `- ${result.service} / ${result.name}: **${result.status}**${result.externalId ? ` · ${result.externalId}` : ""}${result.error ? ` · ${result.error}` : ""}`);
  writeSummary(`## Publish result — ${candidate.name}\n\nState: **${entry.status}**\n\n${lines.join("\n")}`);
  console.log(`${entry.status}: ${candidate.productId}`);
  if (entry.status !== "PUBLISHED") process.exitCode = 2;
}

async function localValidate() {
  const failures = [];
  let eligible = 0;
  for (const series of loadSeries()) {
    const identity = series?.slug ?? series?.__invalidFile ?? "unknown-series";
    try {
      if (series?.__error) throw new Error(series.__error);
      const product = selectNextProduct([series], { products: {} }, { siteUrl });
      if (!product) throw new Error("series is not baseline-eligible");
      const candidate = hardenCandidateForPublishing(createCandidate(product, { runId: "validation", sourceCommit: sourceCommit ?? "local" }));
      assertArtifactIsSecretFree(candidate);
      assertCandidateCtas(candidate);
      eligible++;
    } catch (error) {
      failures.push(`${identity}: ${String(error.message ?? error)}`);
    }
  }
  if (failures.length) {
    throw new Error(`Daily product schema validation failed for ${failures.length} file(s):\n- ${failures.join("\n- ")}`);
  }
  console.log(`Daily product pipeline schema validation complete: ${eligible} baseline-eligible series file(s).`);
}

if (command === "stage") await stage();
else if (command === "mark-staged") await markCandidateStaged();
else if (command === "mark-failed") await markFailed();
else if (command === "preflight") await preflight();
else if (command === "publish") await publish();
else if (command === "validate") await localValidate();
else throw new Error(`Unknown daily-product command: ${command}`);
