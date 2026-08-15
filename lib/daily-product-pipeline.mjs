import crypto from "node:crypto";

import {
  assertAffiliateEligibleSeries,
  assertAffiliateEligibilityRecord,
} from "./market-eligibility.mjs";

export const DISCLOSURE = "#ad BlindBoxAI may earn a commission from qualifying purchases.";
export const STATE_TITLE = "Automation state: Daily BlindBox product pipeline";
export const STATE_MARKER = "<!-- BLINDBOX_DAILY_STATE_V1 -->";
export const STATE_SCHEMA = "blindboxai.daily-product-state/v1";
export const CANDIDATE_SCHEMA = "blindboxai.daily-product-candidate/v2";
export const PRODUCTION_ENVIRONMENT = "social-production";
export const BUFFER_ENDPOINT = "https://api.buffer.com";
export const SITE_URL = "https://www.blindboxai.com";

export const IMAGE_COMPATIBLE_SERVICES = new Set([
  "twitter", "instagram", "facebook", "linkedin", "pinterest",
  "threads", "bluesky", "mastodon",
]);

const PLACEHOLDER_PATTERNS = [
  /\bADD_[A-Z0-9_]+\b/i,
  /\bREPLACE_[A-Z0-9_]+\b/i,
  /\bINSERT_[A-Z0-9_]+\b/i,
  /\bYOUR_[A-Z0-9_]+\b/i,
  /example\.com/i,
  /\bplaceholder\b/i,
];
const PROHIBITED_CONTENT = [
  /\bjackpot\b/i,
  /\bgambling\b/i,
  /\bguaranteed (?:value|profit|return|appreciation)\b/i,
  /\binvestment\b/i,
  /\bget rich\b/i,
  /\bscam(?:mer)?\b/i,
  /\bcounterfeit seller\b/i,
];
const SECRET_PATTERNS = [
  /AKIA[0-9A-Z]{16}/,
  /ghp_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sk-[A-Za-z0-9_-]{20,}/,
  /Bearer\s+[A-Za-z0-9._~-]{20,}/,
];

function isHttps(value) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}
function isBlindBoxUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["blindboxai.com", "www.blindboxai.com"].includes(url.hostname);
  } catch { return false; }
}
function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}
function cleanText(value, label = "value") {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  const text = value.trim();
  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text))) throw new Error(`${label} contains placeholder content`);
  if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) throw new Error(`${label} resembles a secret`);
  return text;
}
function normalizeBaseUrl(value = SITE_URL) {
  const url = new URL(value);
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}
function verifiedQuality(series, field) {
  const quality = series?._dataQuality?.[field];
  return Boolean(
    quality && quality.status === "verified" &&
    typeof quality.source === "string" && quality.source.trim() &&
    isIsoDate(quality.checked_at),
  );
}
function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableObject(value[key])]));
}
export function canonicalJson(value) { return JSON.stringify(stableObject(value)); }
export function candidateHash(candidate) {
  const copy = structuredClone(candidate);
  delete copy.candidateHash;
  return crypto.createHash("sha256").update(canonicalJson(copy)).digest("hex");
}
export function validateCandidateHash(candidate) {
  if (!candidate?.candidateHash || candidate.candidateHash !== candidateHash(candidate)) throw new Error("Candidate integrity hash mismatch");
  return true;
}

export function emptyState() { return { schema: STATE_SCHEMA, products: {}, updatedAt: null }; }
export function parseStateIssue(body) {
  if (!body || !body.includes(STATE_MARKER)) return emptyState();
  const match = body.match(/```json\s*([\s\S]*?)```/i);
  if (!match) throw new Error("State issue is missing its JSON block");
  const state = JSON.parse(match[1]);
  if (state.schema !== STATE_SCHEMA || typeof state.products !== "object" || !state.products) throw new Error("State issue schema is invalid");
  return state;
}
export function renderStateIssue(state) {
  return `${STATE_MARKER}\n\nThis issue is machine-managed. Do not edit the JSON block manually.\n\n\`\`\`json\n${JSON.stringify(state, null, 2)}\n\`\`\`\n`;
}

export function deriveSeriesUrl(series, siteUrl = SITE_URL) {
  const base = normalizeBaseUrl(siteUrl);
  if (series?.seriesPageUrl) {
    if (!isBlindBoxUrl(series.seriesPageUrl)) throw new Error(`${series.slug ?? "series"}: seriesPageUrl must be BlindBoxAI HTTPS`);
    return series.seriesPageUrl;
  }
  return `${base}/series/${encodeURIComponent(cleanText(series?.slug, "slug"))}`;
}

function optionalFacts(series) {
  const facts = [];
  if (series.retailUSD != null && verifiedQuality(series, "retailUSD")) {
    const retail = Number(series.retailUSD);
    if (Number.isFinite(retail) && retail > 0) {
      facts.push({
        field: "retailUSD",
        value: retail,
        text: `Official retail reference: $${retail.toFixed(retail % 1 ? 2 : 0)} USD.`,
        source: series._dataQuality.retailUSD.source,
        checked_at: series._dataQuality.retailUSD.checked_at,
        status: "verified",
      });
    }
  }
  if (series.pullOdds?.secret && verifiedQuality(series, "pullOdds")) {
    const odds = cleanText(String(series.pullOdds.secret), "pullOdds.secret");
    facts.push({
      field: "pullOdds.secret",
      value: odds,
      text: `Manufacturer-published secret pull odds: ${odds}.`,
      source: series._dataQuality.pullOdds.source,
      checked_at: series._dataQuality.pullOdds.checked_at,
      status: "verified",
    });
  }
  if (Array.isArray(series.figures) && series.figures.length && verifiedQuality(series, "figures")) {
    const cleanFigures = series.figures.filter((figure) => !figure?.needsReview && figure?.name && !PLACEHOLDER_PATTERNS.some((p) => p.test(String(figure.name))));
    if (cleanFigures.length === series.figures.length) {
      facts.push({
        field: "figureCount",
        value: cleanFigures.length,
        text: `Verified series checklist: ${cleanFigures.length} figures.`,
        source: series._dataQuality.figures.source,
        checked_at: series._dataQuality.figures.checked_at,
        status: "verified",
      });
    }
  }
  if (Array.isArray(series.checklist) && series.checklist.length && verifiedQuality(series, "checklist")) {
    const tips = series.checklist.slice(0, 2).map((tip) => cleanText(String(tip), "checklist item"));
    facts.push({
      field: "checklist",
      value: tips,
      text: `Verified inspection guidance: ${tips.join(" ")}`,
      source: series._dataQuality.checklist.source,
      checked_at: series._dataQuality.checklist.checked_at,
      status: "verified",
    });
  }
  return facts;
}

export function buildSeriesIdentity(series, { siteUrl = SITE_URL } = {}) {
  const slug = cleanText(series?.slug, "slug");
  const name = cleanText(series?.name, `${slug}.name`);
  const brand = cleanText(series?.brand, `${slug}.brand`);
  return {
    productId: slug,
    slug,
    name,
    brand,
    ctaUrl: deriveSeriesUrl(series, siteUrl),
    graphicUrl: `${normalizeBaseUrl(siteUrl)}/api/social-card/${encodeURIComponent(slug)}`,
    facts: optionalFacts(series),
  };
}

export function buildEligibleProduct(series, options = {}) {
  const product = buildSeriesIdentity(series, options);
  return {
    ...product,
    affiliateEligibility: assertAffiliateEligibleSeries(series),
  };
}

export function selectNextProduct(seriesList, state, options = {}) {
  const blocked = new Set(
    Object.entries(state?.products ?? {})
      .filter(([, entry]) => ["STAGED", "PARTIAL", "PUBLISHED"].includes(entry?.status))
      .map(([id]) => id),
  );
  const eligible = [];
  for (const series of seriesList) {
    try {
      const product = buildEligibleProduct(series, options);
      if (!blocked.has(product.productId)) eligible.push(product);
    } catch {}
  }
  eligible.sort((a, b) => a.productId.localeCompare(b.productId));
  return eligible[0] ?? null;
}

function hashtags(brand) {
  const brandTag = `#${String(brand).replace(/[^A-Za-z0-9]/g, "").slice(0, 24)}`;
  return ["#BlindBox", "#DesignerToys", "#BlindBoxAI", brandTag]
    .filter((tag, i, arr) => tag.length > 1 && arr.indexOf(tag) === i).join(" ");
}
function verifiedFactLines(facts) { return facts.slice(0, 2).map((fact) => `• ${fact.text}`); }

export function buildCaptions(product) {
  const tags = hashtags(product.brand);
  const facts = verifiedFactLines(product.facts);
  const factBlock = facts.length ? `\n\nVerified details:\n${facts.join("\n")}` : "";
  const base = `${product.name} by ${product.brand}`;
  const captions = {
    twitter: `${base}. Collector research before you buy. ${product.ctaUrl}\n\n${DISCLOSURE}`,
    bluesky: `${base}. Research the series before you buy: ${product.ctaUrl}\n\n${DISCLOSURE}`,
    threads: `${base}\n\nA cleaner collector reference: product context, evidence status, and buying research in one place.${factBlock}\n\n${product.ctaUrl}\n\n${DISCLOSURE}\n\n${tags}`,
    mastodon: `${base}\n\nCollector research before purchase.${factBlock}\n\n${product.ctaUrl}\n\n${DISCLOSURE}\n\n${tags}`,
    instagram: `COLLECTOR GUIDE — ${product.name}\n\nBrand: ${product.brand}\n\nBlindBoxAI keeps verified facts separate from data that still needs review, so you can research before buying.${factBlock}\n\nSee the complete guide: ${product.ctaUrl}\n\n${DISCLOSURE}\n\n${tags}`,
    facebook: `${base}\n\nBefore you buy, use the BlindBoxAI series guide as a compact collector reference.${factBlock}\n\nGuide: ${product.ctaUrl}\n\n${DISCLOSURE}\n\n${tags}`,
    linkedin: `${base}\n\nBlindBoxAI separates source-backed product facts from unverified market data, giving collectors and resellers a cleaner research workflow.${factBlock}\n\nReference: ${product.ctaUrl}\n\n${DISCLOSURE}`,
    pinterest: `${base} collector reference. Research the series before buying: ${product.ctaUrl}\n\n${DISCLOSURE}\n\n${tags}`,
  };
  const limits = { twitter: 280, bluesky: 300, threads: 500, mastodon: 500, pinterest: 500 };
  for (const [service, limit] of Object.entries(limits)) {
    if (captions[service].length > limit) {
      const suffix = `\n\n${DISCLOSURE}`;
      const room = limit - suffix.length;
      captions[service] = `${captions[service].slice(0, Math.max(0, room - 1)).trimEnd()}…${suffix}`;
    }
  }
  return captions;
}

export function validatePublishableText(text) {
  if (!text?.includes(DISCLOSURE)) throw new Error("Affiliate disclosure missing");
  if (PROHIBITED_CONTENT.some((pattern) => pattern.test(text))) throw new Error("Prohibited claim/framing detected");
  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text))) throw new Error("Placeholder content detected");
  if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) throw new Error("Possible secret detected in publishable content");
  if (/ebay\.com\//i.test(text)) throw new Error("Raw eBay URL is not allowed in social copy");
  return true;
}

export function createCandidate(product, { runId, sourceCommit, now = new Date() } = {}) {
  if (!runId) throw new Error("runId is required");
  assertAffiliateEligibilityRecord(product?.affiliateEligibility);
  const captions = buildCaptions(product);
  for (const text of Object.values(captions)) validatePublishableText(text);
  const candidate = {
    schema: CANDIDATE_SCHEMA,
    productId: product.productId,
    name: product.name,
    brand: product.brand,
    ctaUrl: product.ctaUrl,
    graphicUrl: product.graphicUrl,
    affiliateEligibility: structuredClone(product.affiliateEligibility),
    factsUsed: [
      { field: "name", value: product.name, source: "data/series repository record", status: "baseline" },
      { field: "brand", value: product.brand, source: "data/series repository record", status: "baseline" },
      ...product.facts,
    ],
    captions,
    targetServices: Object.keys(captions),
    runId: String(runId),
    sourceCommit: sourceCommit ?? null,
    createdAt: now.toISOString(),
  };
  candidate.candidateHash = candidateHash(candidate);
  return candidate;
}

export async function verifyLiveUrl(url, { fetchImpl = fetch, requireImage = false } = {}) {
  if (!isHttps(url)) throw new Error(`HTTPS URL required: ${url}`);
  const response = await fetchImpl(url, {
    method: "GET",
    redirect: "follow",
    headers: { "User-Agent": "BlindBoxAI-Daily-Pipeline/1.0" },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`URL check failed (${response.status}): ${url}`);
  if (requireImage) {
    const type = response.headers.get("content-type") ?? "";
    if (!type.toLowerCase().startsWith("image/")) throw new Error(`Graphic URL is not an image (${type || "unknown type"})`);
  }
  try { await response.body?.cancel?.(); } catch {}
  return true;
}

export function assertProductionContext({ token, environmentName }) {
  if (!token) throw new Error("BUFFER_API_TOKEN is required after approval");
  if (environmentName !== PRODUCTION_ENVIRONMENT) throw new Error(`Publishing must run in ${PRODUCTION_ENVIRONMENT}`);
  return true;
}

export async function bufferGraphQL(token, query, variables = {}, fetchImpl = fetch) {
  if (!token) throw new Error("Buffer token is required");
  const response = await fetchImpl(BUFFER_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`Buffer HTTP ${response.status}`);
  if (result.errors?.length) throw new Error(`Buffer GraphQL error: ${result.errors[0].message}`);
  return result.data;
}

export async function discoverBufferChannels(token, fetchImpl = fetch) {
  const orgData = await bufferGraphQL(token, `query Organizations { account { organizations { id name } } }`, {}, fetchImpl);
  const organizations = orgData?.account?.organizations ?? [];
  const channels = [];
  for (const org of organizations) {
    const data = await bufferGraphQL(token, `query Channels($organizationId: OrganizationId!) {
      channels(input: { organizationId: $organizationId, filter: { isLocked: false } }) {
        id name displayName service isQueuePaused isDisconnected isLocked
      }
    }`, { organizationId: org.id }, fetchImpl);
    for (const channel of data?.channels ?? []) channels.push({ ...channel, organizationId: org.id, organizationName: org.name });
  }
  return channels.filter((channel) => !channel.isLocked && !channel.isDisconnected && IMAGE_COMPATIBLE_SERVICES.has(channel.service));
}

export async function findExistingBufferPost({ token, organizationId, channelId, text, fetchImpl = fetch, now = new Date() }) {
  const start = new Date(now.getTime() - 45 * 86400000).toISOString();
  const data = await bufferGraphQL(token, `query Existing($organizationId: OrganizationId!, $channelIds: [ChannelId!], $startDate: DateTime!) {
    posts(first: 50, input: {
      organizationId: $organizationId,
      filter: { channelIds: $channelIds, status: [scheduled, sending, sent], startDate: $startDate },
      sort: [{ field: createdAt, direction: desc }]
    }) { edges { node { id text status channelId createdAt } } }
  }`, { organizationId, channelIds: [channelId], startDate: start }, fetchImpl);
  return (data?.posts?.edges ?? []).map((edge) => edge.node).find((post) => post.text?.trim() === text.trim()) ?? null;
}

export async function createBufferImagePost({ token, channelId, text, graphicUrl, fetchImpl = fetch }) {
  const data = await bufferGraphQL(token, `mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      __typename
      ... on PostActionSuccess { post { id text dueAt status } }
      ... on MutationError { message }
    }
  }`, {
    input: {
      text,
      channelId,
      schedulingType: "automatic",
      mode: "addToQueue",
      aiAssisted: true,
      source: "blindboxai-daily-product",
      assets: [{ image: { url: graphicUrl } }],
    },
  }, fetchImpl);
  const payload = data?.createPost;
  if (!payload) throw new Error("Buffer createPost returned no payload");
  if (payload.__typename === "MutationError" || payload.message) throw new Error(`Buffer MutationError: ${payload.message ?? "unknown error"}`);
  if (!payload.post?.id) throw new Error("Buffer createPost did not return a post ID");
  return payload.post;
}

export function markStaged(state, candidate, now = new Date()) {
  validateCandidateHash(candidate);
  const current = state.products?.[candidate.productId];
  if (current && ["STAGED", "PARTIAL", "PUBLISHED"].includes(current.status)) throw new Error(`${candidate.productId} is already ${current.status}`);
  const next = structuredClone(state);
  next.products ??= {};
  next.products[candidate.productId] = {
    status: "STAGED",
    candidateHash: candidate.candidateHash,
    runId: candidate.runId,
    stagedAt: now.toISOString(),
    publishedAt: null,
    publications: {},
    lastError: null,
  };
  next.updatedAt = now.toISOString();
  return next;
}

export function markFailedIfStaged(state, candidate, reason, now = new Date()) {
  const next = structuredClone(state);
  const entry = next.products?.[candidate.productId];
  if (!entry || entry.candidateHash !== candidate.candidateHash) return next;
  if (entry.status === "STAGED") {
    entry.status = "FAILED";
    entry.lastError = String(reason || "publish job did not complete").slice(0, 500);
    entry.failedAt = now.toISOString();
    next.updatedAt = now.toISOString();
  }
  return next;
}

export function updatePublicationState(state, candidate, channel, publication, now = new Date()) {
  const next = structuredClone(state);
  const entry = next.products?.[candidate.productId];
  if (!entry || entry.candidateHash !== candidate.candidateHash) throw new Error("State does not match approved candidate");
  entry.publications ??= {};
  entry.publications[channel.id] = {
    service: channel.service,
    name: channel.displayName || channel.name,
    ...publication,
    updatedAt: now.toISOString(),
  };
  next.updatedAt = now.toISOString();
  return next;
}

export function finalizeProductState(state, candidate, targetChannels, now = new Date()) {
  const next = structuredClone(state);
  const entry = next.products?.[candidate.productId];
  if (!entry || entry.candidateHash !== candidate.candidateHash) throw new Error("State does not match candidate");
  const results = targetChannels.map((channel) => entry.publications?.[channel.id]).filter(Boolean);
  if (!targetChannels.length) {
    entry.status = "FAILED";
    entry.lastError = "No compatible connected Buffer channels found";
  } else if (results.length === targetChannels.length && results.every((result) => result.status === "published")) {
    entry.status = "PUBLISHED";
    entry.publishedAt = now.toISOString();
    entry.lastError = null;
  } else {
    entry.status = "PARTIAL";
    entry.lastError = "One or more compatible Buffer channels failed";
  }
  next.updatedAt = now.toISOString();
  return next;
}
export function publicationIsComplete(state, candidate, channel) {
  return state.products?.[candidate.productId]?.publications?.[channel.id]?.status === "published";
}
export function channelsNeedingPublish(state, candidate, channels) {
  return channels.filter((channel) => !publicationIsComplete(state, candidate, channel));
}

export async function verifyEnvironmentGate({ repo, token, expectedReviewer, fetchImpl = fetch }) {
  if (!repo || !token || !expectedReviewer) throw new Error("Repository, GitHub token, and expected reviewer are required");
  const response = await fetchImpl(`https://api.github.com/repos/${repo}/environments/${encodeURIComponent(PRODUCTION_ENVIRONMENT)}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2026-03-10",
    },
  });
  if (!response.ok) throw new Error(`Unable to verify ${PRODUCTION_ENVIRONMENT} protection rules (${response.status})`);
  const environment = await response.json();
  const rule = (environment.protection_rules ?? []).find((item) => item.type === "required_reviewers");
  const reviewers = rule?.reviewers ?? [];
  const ownerIsReviewer = reviewers.some((item) => item.type === "User" && item.reviewer?.login === expectedReviewer);
  if (!ownerIsReviewer) throw new Error(`${PRODUCTION_ENVIRONMENT} must require approval from ${expectedReviewer}`);
  return true;
}

export async function githubRequest({ repo, token, path, method = "GET", body, fetchImpl = fetch }) {
  if (!repo || !token) throw new Error("GITHUB_REPOSITORY and GITHUB_TOKEN are required for state persistence");
  const response = await fetchImpl(`https://api.github.com/repos/${repo}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const result = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`GitHub state API ${method} ${path} failed: ${response.status}`);
  return result;
}
export async function loadGithubState({ repo, token, fetchImpl = fetch }) {
  const issues = await githubRequest({ repo, token, path: "/issues?state=open&per_page=100", fetchImpl });
  const issue = issues.find((item) => !item.pull_request && item.title === STATE_TITLE);
  return { issue, state: issue ? parseStateIssue(issue.body) : emptyState() };
}
export async function saveGithubState({ repo, token, issue, state, fetchImpl = fetch }) {
  const body = renderStateIssue(state);
  if (!issue) return githubRequest({ repo, token, path: "/issues", method: "POST", body: { title: STATE_TITLE, body }, fetchImpl });
  return githubRequest({ repo, token, path: `/issues/${issue.number}`, method: "PATCH", body: { body }, fetchImpl });
}

export function candidatePreview(candidate) {
  const factLines = candidate.factsUsed.map((fact) => `- **${fact.field}** — ${String(fact.value)} · ${fact.status}${fact.source ? ` · source: ${fact.source}` : ""}${fact.checked_at ? ` · checked: ${fact.checked_at}` : ""}`);
  const marketLines = candidate.affiliateEligibility.verifiedMarketRecords.map((record) => {
    const range = record.resaleLowUSD === record.resaleHighUSD
      ? `$${record.resaleLowUSD}`
      : `$${record.resaleLowUSD}–$${record.resaleHighUSD}`;
    return `- **${record.figure}** — ${range} USD · ${record.transactionEvidence}`;
  });
  const captions = Object.entries(candidate.captions).map(([service, text]) => `### ${service}\n\n${text}`).join("\n\n");
  return `# Daily BlindBox approval preview\n\n**Product:** ${candidate.name}\n\n**Brand:** ${candidate.brand}\n\n**Scope:** all blind-box collectibles\n\n**CTA:** ${candidate.ctaUrl}\n\n**Graphic:** ${candidate.graphicUrl}\n\n**Candidate hash:** \`${candidate.candidateHash}\`\n\n## Affiliate eligibility\n\nThe series qualified because it has reviewed positive-USD transaction evidence. This proves observed market activity, not profit or future value.\n\n${marketLines.join("\n")}\n\n## Facts actually used\n\n${factLines.join("\n")}\n\n## Exact captions\n\n${captions}\n`;
}
export function assertArtifactIsSecretFree(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) throw new Error("Artifact contains possible secret material");
  return true;
}
