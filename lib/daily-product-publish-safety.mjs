import {
  DISCLOSURE,
  PRODUCTION_ENVIRONMENT,
  STATE_TITLE,
  bufferGraphQL,
  candidateHash,
  emptyState,
  githubRequest,
  parseStateIssue,
  validateCandidateHash,
} from "./daily-product-pipeline.mjs";

export const SAFE_IMAGE_SERVICES = new Set([
  "twitter",
  "instagram",
  "facebook",
  "linkedin",
  "threads",
  "bluesky",
  "mastodon",
]);

const CAPTION_LIMITS = Object.freeze({
  twitter: 280,
  bluesky: 300,
  threads: 500,
  mastodon: 500,
});

export function assertBufferOrganizationId(value) {
  const id = String(value ?? "").trim();
  if (!id) throw new Error("BUFFER_ORGANIZATION_ID is required for production publishing");
  if (/^(?:ADD_|REPLACE_|INSERT_|YOUR_|placeholder)/i.test(id)) {
    throw new Error("BUFFER_ORGANIZATION_ID contains placeholder content");
  }
  return id;
}

function compactCaption(candidate, service) {
  const suffix = `\n\n${candidate.ctaUrl}\n\n${DISCLOSURE}`;
  const limit = CAPTION_LIMITS[service];
  let lead = `${candidate.name} by ${candidate.brand}. Collector research before you buy.`;
  if (!limit) return `${lead}${suffix}`;
  if (suffix.length >= limit) throw new Error(`${service}: required CTA/disclosure cannot fit platform limit`);
  const room = limit - suffix.length;
  if (lead.length > room) {
    lead = room > 1 ? `${lead.slice(0, room - 1).trimEnd()}…` : "";
  }
  return `${lead}${suffix}`;
}

export function hardenCandidateForPublishing(candidate) {
  const next = structuredClone(candidate);
  if (!next?.ctaUrl || !next?.captions) throw new Error("Candidate CTA and captions are required");

  // Buffer requires a Pinterest boardServiceId. Until board choice is an
  // explicit approved input, Pinterest is intentionally excluded.
  delete next.captions.pinterest;
  next.targetServices = Object.keys(next.captions);

  for (const [service, text] of Object.entries(next.captions)) {
    if (!String(text).includes(next.ctaUrl) || !String(text).includes(DISCLOSURE)) {
      next.captions[service] = compactCaption(next, service);
    }
  }

  next.candidateHash = candidateHash(next);
  validateCandidateHash(next);
  assertCandidateCtas(next);
  return next;
}

export function assertCandidateCtas(candidate) {
  if (!candidate?.ctaUrl || !candidate?.captions || !Object.keys(candidate.captions).length) {
    throw new Error("Candidate CTA and captions are required");
  }
  for (const [service, text] of Object.entries(candidate.captions)) {
    if (!String(text).includes(candidate.ctaUrl)) throw new Error(`${service}: full BlindBoxAI CTA is missing`);
    if (!String(text).includes(DISCLOSURE)) throw new Error(`${service}: affiliate disclosure is missing`);
    const limit = CAPTION_LIMITS[service];
    if (limit && String(text).length > limit) throw new Error(`${service}: caption exceeds ${limit} characters`);
  }
  return true;
}

export async function discoverScopedBufferChannels({ token, organizationId, fetchImpl = fetch }) {
  const targetId = assertBufferOrganizationId(organizationId);
  const orgData = await bufferGraphQL(
    token,
    `query Organizations { account { organizations { id name } } }`,
    {},
    fetchImpl,
  );
  const organizations = orgData?.account?.organizations ?? [];
  const organization = organizations.find((org) => String(org.id) === targetId);
  if (!organization) throw new Error(`Configured Buffer organization ${targetId} is not available to this API key`);

  const data = await bufferGraphQL(
    token,
    `query Channels($organizationId: OrganizationId!) {
      channels(input: { organizationId: $organizationId, filter: { isLocked: false } }) {
        id name displayName service isQueuePaused isDisconnected isLocked
      }
    }`,
    { organizationId: organization.id },
    fetchImpl,
  );

  return (data?.channels ?? [])
    .filter((channel) => !channel.isLocked && !channel.isDisconnected && SAFE_IMAGE_SERVICES.has(channel.service))
    .map((channel) => ({
      ...channel,
      organizationId: organization.id,
      organizationName: organization.name,
    }));
}

export async function findExistingBufferPostPaginated({
  token,
  organizationId,
  channelId,
  text,
  fetchImpl = fetch,
  now = new Date(),
}) {
  const start = new Date(now.getTime() - 45 * 86400000).toISOString();
  let after = null;
  const seenCursors = new Set();

  for (;;) {
    const data = await bufferGraphQL(
      token,
      `query Existing($organizationId: OrganizationId!, $channelIds: [ChannelId!], $startDate: DateTime!, $after: String) {
        posts(first: 50, after: $after, input: {
          organizationId: $organizationId,
          filter: { channelIds: $channelIds, status: [scheduled, sending, sent], startDate: $startDate },
          sort: [{ field: createdAt, direction: desc }]
        }) {
          edges { node { id text status channelId createdAt } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { organizationId, channelIds: [channelId], startDate: start, after },
      fetchImpl,
    );

    const posts = (data?.posts?.edges ?? []).map((edge) => edge.node);
    const existing = posts.find((post) => post.text?.trim() === text.trim());
    if (existing) return existing;

    const pageInfo = data?.posts?.pageInfo;
    if (!pageInfo?.hasNextPage) return null;
    const nextCursor = pageInfo.endCursor;
    if (!nextCursor || seenCursors.has(nextCursor)) throw new Error("Buffer pagination returned an invalid/repeated cursor");
    seenCursors.add(nextCursor);
    after = nextCursor;
  }
}

async function githubJson(url, token, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2026-03-10",
    },
  });
  if (!response.ok) throw new Error(`GitHub protection API failed (${response.status})`);
  return response.json();
}

export async function verifyExclusiveEnvironmentGate({ repo, token, expectedReviewer, fetchImpl = fetch }) {
  if (!repo || !token || !expectedReviewer) throw new Error("Repository, GitHub token, and expected reviewer are required");
  const environmentName = encodeURIComponent(PRODUCTION_ENVIRONMENT);
  const base = `https://api.github.com/repos/${repo}/environments/${environmentName}`;
  const environment = await githubJson(base, token, fetchImpl);

  const rule = (environment.protection_rules ?? []).find((item) => item.type === "required_reviewers");
  const reviewers = rule?.reviewers ?? [];
  const soleOwnerReviewer = reviewers.length === 1
    && reviewers[0]?.type === "User"
    && reviewers[0]?.reviewer?.login === expectedReviewer;
  if (!soleOwnerReviewer) {
    throw new Error(`${PRODUCTION_ENVIRONMENT} must have exactly one required reviewer: ${expectedReviewer}`);
  }
  if (rule?.prevent_self_review === true) {
    throw new Error(`${PRODUCTION_ENVIRONMENT} must allow the owner to approve their own scheduled/manual deployment`);
  }

  const branchPolicy = environment.deployment_branch_policy;
  if (branchPolicy?.protected_branches !== false || branchPolicy?.custom_branch_policies !== true) {
    throw new Error(`${PRODUCTION_ENVIRONMENT} must use a custom main-only deployment branch policy`);
  }

  const policies = await githubJson(`${base}/deployment-branch-policies?per_page=100`, token, fetchImpl);
  const branchPolicies = policies?.branch_policies ?? [];
  if (policies?.total_count !== 1 || branchPolicies.length !== 1 || branchPolicies[0]?.name !== "main") {
    throw new Error(`${PRODUCTION_ENVIRONMENT} must allow exactly one deployment branch: main`);
  }
  return true;
}

export async function loadGithubStatePaginated({ repo, token, fetchImpl = fetch }) {
  if (!repo || !token) throw new Error("GITHUB_REPOSITORY and GITHUB_TOKEN are required for state persistence");
  const seenIssueIds = new Set();
  for (let page = 1; ; page++) {
    const issues = await githubRequest({
      repo,
      token,
      path: `/issues?state=open&per_page=100&page=${page}`,
      fetchImpl,
    });
    if (!Array.isArray(issues)) throw new Error("GitHub issues API returned an invalid state page");
    for (const issue of issues) {
      if (issue?.id != null) {
        if (seenIssueIds.has(issue.id)) throw new Error("GitHub issue pagination repeated an issue; refusing to reset automation state");
        seenIssueIds.add(issue.id);
      }
      if (!issue?.pull_request && issue?.title === STATE_TITLE) {
        return { issue, state: parseStateIssue(issue.body) };
      }
    }
    if (issues.length < 100) return { issue: null, state: emptyState() };
  }
}
