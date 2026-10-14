// One-time, fail-closed retirement of verified merged PR branches.
// Nothing executes outside the reviewed main-branch GitHub Actions workflow.
const REPO = "ubiquitousservices888-rgb/BlindBoxAi-";
const CANDIDATES = Object.freeze([
  { pr: 256, branch: "fix/one-blue-auto-repair-video-launch-20261003", head: "2003cc11500a40a508fac66c53897d2e072f828c", merge: "5c4d3e136f07a56ccca308fef487547c42f19674" },
  { pr: 268, branch: "fix/amazon-accessory-utm-attribution-2026-10-09", head: "f4735b5401e64b59ce7d1a3d7ea82d8e12e58600", merge: "5aa625e908e3bfdbbec1b1f07c3aab94bb275c9d" },
  { pr: 269, branch: "feat/daily-question-research-20261010", head: "bdfd70e7d537474145aeb2076608153a45a8c6d2", merge: "1e036bf5f774c0110cc1b243a993b3b8afaad67e" },
  { pr: 271, branch: "fix/epn-gemini-source-safety-20261012", head: "c1154124263b834a0ae1ca27f27ad6c5894fec43", merge: "6e973b3c372f704c8240642a0bd2f662855027b0" },
]);

if (process.env.GITHUB_REPOSITORY !== REPO || process.env.GITHUB_REF !== "refs/heads/main") {
  throw new Error("Retirement must run only on the protected main branch of the target repository");
}
if (!/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA || "")) {
  throw new Error("Exact reviewed main commit SHA is required");
}
const token = process.env.GH_TOKEN;
if (!token) throw new Error("GitHub Actions token is required");
// Read-only until a separately reviewed, race-safe deletion mechanism is provided.
const apply = false;
if (process.env.APPLY === "true") throw new Error("Branch deletion is disabled: safe atomic ref deletion is not available");

async function request(method, path, { allow404 = false } = {}) {
  const response = await fetch("https://api.github.com" + path, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (allow404 && response.status === 404) return null;
  if (!response.ok) throw new Error("GitHub " + method + " request failed with HTTP " + response.status);
  return response.status === 204 ? null : response.json();
}

const prefix = "/repos/" + REPO;
const approved = [];
for (const item of CANDIDATES) {
  if (!/^(?:fix|feat)\/[a-z0-9-]+$/.test(item.branch)) throw new Error("Unexpected branch allowlist entry");
  const pr = await request("GET", prefix + "/pulls/" + item.pr);
  if (pr.merged !== true || !pr.merged_at || pr.head?.ref !== item.branch ||
      pr.head?.sha !== item.head || pr.head?.repo?.full_name !== REPO || pr.base?.ref !== "main" ||
      pr.merge_commit_sha !== item.merge) {
    throw new Error("Merged PR metadata does not match allowlist for #" + item.pr);
  }
  const history = await request("GET", prefix + "/compare/" + item.merge + "..." + process.env.GITHUB_SHA);
  if (!["ahead", "identical"].includes(history.status)) {
    throw new Error("Merged commit is not an ancestor of reviewed main for #" + item.pr);
  }
  const active = await request("GET", prefix + "/pulls?state=open&head=" + encodeURIComponent("ubiquitousservices888-rgb:" + item.branch));
  if (!Array.isArray(active) || active.length) throw new Error("Branch still belongs to an open PR for #" + item.pr);
  const refPath = prefix + "/git/ref/heads/" + item.branch;
  const ref = await request("GET", refPath, { allow404: true });
  if (ref && ref.object?.sha !== item.head) {
    throw new Error("Branch has new work; refusing retirement of #" + item.pr);
  }
  approved.push({ ...item, present: Boolean(ref) });
}

for (const item of approved) {
  if (!item.present) {
    console.log("ALREADY_RETIRED PR #" + item.pr + ": " + item.branch);
    continue;
  }
  if (!apply) {
    console.log("DRY_RUN_ELIGIBLE PR #" + item.pr + ": " + item.branch);
    continue;
  }
  throw new Error("Deletion intentionally disabled until an atomic expected-SHA operation is available");
}
console.log("BRANCH_RETIREMENT_DONE eligible=" + approved.length + " apply=" + apply);
