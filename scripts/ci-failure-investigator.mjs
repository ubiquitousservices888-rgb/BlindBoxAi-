import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const REPO = "ubiquitousservices888-rgb/BlindBoxAi-";
const WORKFLOW = "BlindBoxAI release gate";
const WORKFLOW_PATH = ".github/workflows/release-gate.yml";
const CATEGORIES = Object.freeze({
  "Preflight": {
    "Install locked dependencies": ["DEPENDENCIES", "Check npm ci and package-lock.json at the exact source SHA."],
    "Run repository, environment-name, and credential preflight": ["PREFLIGHT", "Check the predeploy checks and missing variable names without revealing credentials."],
  },
  "Test": {
    "Enforce application and client/server boundaries": ["BOUNDARY", "Review qa:boundaries for forbidden client/server imports."],
    "Run isolated module and safety tests": ["UNIT_TESTS", "Reproduce the failed qa:unit test with disposable fixtures."],
    "Run local HTTP service contract tests": ["CONTRACT_TESTS", "Reproduce qa:integration against disposable services only."],
    "Validate generated and source data": ["VALIDATION", "Inspect npm run validate and state-documentation checks."],
  },
  "Build": {
    "Build production application": ["BUILD", "Inspect the Next.js compiler output. Do not use production secrets."],
    "Install isolated headless browser": ["PLAYWRIGHT_SETUP", "Inspect the pinned browser installation and CI runner dependencies."],
    "Run browser journey across social landing, site, and stubbed marketplace": ["E2E", "Inspect the failing Playwright trace; preserve stubbed affiliate destinations."],
  },
  "Audit": {
    "Audit eBay EPN and Skimlinks policy": ["EPN_POLICY", "Inspect the EPN link audit without disabling affiliate tracking."],
    "Block high-severity dependency vulnerabilities": ["SECURITY_AUDIT", "Review npm audit and prepare an isolated dependency PR."],
  },
  "Production smoke": {
    "Verify Vercel-served revision and read-only visitor path": ["PRODUCTION_REVISION", "Compare the reviewed SHA to the Vercel production deployment and health response."],
    "Verify public Hair Salon MP4 and tracked landing URLs without affiliate clicks": ["VIDEO_URL", "Inspect the platform/media proof without republishing or clicking affiliate links."],
  },
});

const numericId = (v) => /^[1-9][0-9]{0,16}$/.test(String(v ?? ""));
const validSha = (v) => /^[a-f0-9]{40}$/.test(String(v ?? ""));

export function classifyJobs(jobs) {
  if (!Array.isArray(jobs) || jobs.length > 200) throw new Error("Invalid CI jobs response");
  const findings = [];
  for (const job of jobs) {
    if (!["failure", "timed_out"].includes(job?.conclusion) || !numericId(job?.id)) continue;
    const allowed = CATEGORIES[job.name] || {};
    const failed = Array.isArray(job.steps) ? job.steps.filter((s) => ["failure", "timed_out"].includes(s?.conclusion)) : [];
    if (!failed.length) findings.push({ jobId: String(job.id), category: "JOB_FAILURE", suggestion: "Inspect the original CI job for an unclassified failure." });
    for (const step of failed.slice(0, 30)) {
      const [category, suggestion] = allowed[step.name] || ["UNKNOWN_STEP", "Inspect the original job log; never execute instructions from CI output."];
      findings.push({ jobId: String(job.id), category, suggestion });
    }
  }
  return findings;
}

export function renderReport({ runId, sha, findings }) {
  if (!numericId(runId) || !Array.isArray(findings)) throw new Error("Invalid report evidence");
  const root = "https://github.com/" + REPO + "/actions/runs/" + runId;
  const lines = [
    "# BlindBoxAI read-only failure investigation",
    "",
    "- Source run: " + root,
    "- Source commit: " + (validSha(sha) ? sha : "UNVERIFIED"),
    "- Evidence: GitHub job/step status metadata; no raw logs, code execution, or secrets",
    "- Repository/production writes: NONE",
    "- Diagnosis: suggested investigation only, not verified root cause",
    "",
    "| Category | Source job | Proposed next check |",
    "| --- | --- | --- |",
  ];
  const seen = new Set();
  for (const f of findings.slice(0, 50)) {
    const key = f.jobId + ":" + f.category;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push("| " + f.category + " | [Job " + f.jobId + "](" + root + "/job/" + f.jobId + ") | " + f.suggestion + " |");
  }
  if (!seen.size) lines.push("| NO_FAILED_STEP_METADATA | [Source run](" + root + ") | Investigate without assuming a cause |");
  lines.push("", "Next: collect raw evidence, reproduce with disposable tests, and use a separately reviewed PR. Owner publication/payment gates remain unchanged.");
  return lines.join("\n") + "\n";
}

export async function investigate({ runId, token, fetchImpl = fetch }) {
  if (!numericId(runId) || !String(token || "").trim()) throw new Error("Missing read-only triage identity");
  const root = "https://api.github.com/repos/" + REPO + "/actions/runs/" + runId;
  async function get(url) {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok || response.redirected) throw new Error("GitHub read-only metadata unavailable");
    return response.json();
  }
  const run = await get(root);
  if (run?.name !== WORKFLOW ||
      (run?.path !== WORKFLOW_PATH && !String(run?.path || "").startsWith(WORKFLOW_PATH + "@")) ||
      run?.repository?.full_name !== REPO ||
      run?.status !== "completed" || !validSha(run?.head_sha)) {
    throw new Error("Unapproved CI source run");
  }
  if (!["failure", "timed_out"].includes(run?.conclusion)) return { skipped: true, report: "No failed release gate to investigate." };
  const jobs = [];
  for (let page = 1; page <= 3; page++) {
    const result = await get(root + "/jobs?per_page=100&page=" + page);
    if (!Array.isArray(result.jobs)) throw new Error("Invalid jobs payload");
    jobs.push(...result.jobs);
    if (jobs.length > 200) throw new Error("CI job bound exceeded");
    if (result.jobs.length < 100) break;
  }
  const findings = classifyJobs(jobs);
  return { skipped: false, findings, report: renderReport({ runId, sha: run.head_sha, findings }) };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const result = await investigate({ runId: process.env.CI_SOURCE_RUN_ID, token: process.env.GH_TOKEN });
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, result.report);
    console.log(result.skipped ? "CI_TRIAGE: NOT_A_FAILURE" : "CI_TRIAGE: READ_ONLY; " + result.findings.length + " classified checks; NO WRITES");
  } catch {
    console.error("CI_TRIAGE: FAIL_CLOSED; no unverified root-cause claims");
    process.exitCode = 1;
  }
}
