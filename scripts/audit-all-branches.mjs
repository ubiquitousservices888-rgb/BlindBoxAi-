// Read-only full branch inventory. Ahead commits are NOT proof of unmerged work:
// squash merges retain old source-branch commits outside main's history.
import { mkdir, writeFile } from "node:fs/promises";
const repo = "ubiquitousservices888-rgb/BlindBoxAi-";
if (process.env.GITHUB_REPOSITORY !== repo || process.env.GITHUB_REF !== "refs/heads/main") throw new Error("Only main of the expected repository may run this audit");
const token = process.env.GH_TOKEN;
if (!token) throw new Error("Missing read-only token");
async function get(path) {
  const response = await fetch("https://api.github.com/repos/" + repo + path, {
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error("GitHub read failed HTTP " + response.status + " path=" + path);
  return response.json();
}
const repoInfo = await get("");
if (repoInfo.default_branch !== "main") throw new Error("Unexpected default branch");
const main = await get("/branches/main");
const branches = [];
for (let page = 1; ; page++) {
  if (page > 50) throw new Error("Pagination exceeded safety limit");
  const batch = await get("/branches?per_page=100&page=" + page);
  if (!Array.isArray(batch)) throw new Error("Unexpected branch list");
  branches.push(...batch);
  if (batch.length < 100) break;
}
const unique = new Map(branches.map(x => [x.name, x]));
if (unique.size !== branches.length) throw new Error("Duplicate branch names in API response");
const records = [];
// Sequential API calls reduce abuse/rate-limit risk and keep output deterministic.
for (const b of branches) {
  if (b.name === "main") continue;
  const compare = await get("/compare/" + encodeURIComponent("main") + "..." + encodeURIComponent(b.name));
  const status = compare.status;
  if (!["ahead", "behind", "diverged", "identical"].includes(status)) throw new Error("Unexpected compare status: " + status);
  const ahead = compare.ahead_by, behind = compare.behind_by;
  const category = ahead === 0 ? "ANCESTOR_ONLY_CANDIDATE" : "REVIEW_REQUIRED";
  records.push({ branch: b.name, sha: b.commit.sha, protected: Boolean(b.protected),
    compareStatus: status, ahead, behind, category,
    warning: ahead > 0 ? "Ahead commits may already be squash-merged; inspect PRs and file diffs before making any cleanup decision." : null });
}
const report = {
  generatedAt: new Date().toISOString(), repository: repo, baseSha: main.commit.sha,
  branchCount: branches.length, inspected: records.length,
  safety: "READ_ONLY. No branch deletion, force-push, merge, publishing, or production mutation.",
  classificationRule: "Branches with ahead_by=0 are ancestor-only candidates, not deletion approvals; all other branches require PR, file-diff and dependency review.",
  records,
};
await mkdir("output/repository-audit", { recursive: true });
await writeFile("output/repository-audit/branch-classification.json", JSON.stringify(report, null, 2) + "\n");
const totals = records.reduce((a, x) => (a[x.category] = (a[x.category] || 0) + 1, a), {});
console.log(JSON.stringify({ branchCount: report.branchCount, inspected: report.inspected, totals, report: "output/repository-audit/branch-classification.json" }));
