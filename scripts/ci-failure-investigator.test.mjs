import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { classifyJobs, renderReport, investigate } from "./ci-failure-investigator.mjs";

const SHA = "a".repeat(40);
const REPO = "ubiquitousservices888-rgb/BlindBoxAi-";
const run = { name: "BlindBoxAI release gate", path: ".github/workflows/release-gate.yml@refs/pull/99/merge", repository: { full_name: REPO }, status: "completed", conclusion: "failure", head_sha: SHA };
const jobs = [
  { id: 123, name: "Test", conclusion: "failure", steps: [{ name: "Run isolated module and safety tests", conclusion: "failure" }] },
  { id: 124, name: "Build", conclusion: "success", steps: [{ name: "Build production application", conclusion: "success" }] },
];

const fake = (runData = run, jobData = jobs) => async (url, init) => {
  assert.equal(init.method, "GET");
  assert.equal(init.redirect, "error");
  assert.match(url, /^https:\/\/api\.github\.com\/repos\/ubiquitousservices888-rgb\/BlindBoxAi-\/actions\/runs\/123456/);
  return new Response(JSON.stringify(url.includes("/jobs?") ? { jobs: jobData } : runData), { status: 200, headers: { "content-type": "application/json" } });
};

test("classifies exact known failing steps without fetching or executing logs", async () => {
  const result = await investigate({ runId: "123456", token: "test-fixture-token", fetchImpl: fake() });
  assert.equal(result.skipped, false);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].category, "UNIT_TESTS");
  assert.match(result.report, /Run isolated module|reproduce/i);
  assert.match(result.report, /\/actions\/runs\/123456\/job\/123/);
  assert.doesNotMatch(result.report, /test-fixture-token/);
});

test("unknown steps and injection-like names never reach Markdown", () => {
  const bad = '<script>alert("stolen")</script>';
  const findings = classifyJobs([{ id: 789, name: bad, conclusion: "failure", steps: [{ name: bad, conclusion: "failure" }] }]);
  assert.equal(findings[0].category, "UNKNOWN_STEP");
  const report = renderReport({ runId: 123456, sha: SHA, findings });
  assert.doesNotMatch(report, /script|alert|stolen/);
  assert.match(report, /UNKNOWN_STEP/);
  assert.throws(() => classifyJobs(new Array(201)), /Invalid/);
});

test("foreign repository, workflow, ongoing, or malformed metadata fails closed", async () => {
  for (const changed of [
    { name: "Publish approved review videos" },
    { repository: { full_name: "attacker/repo" } },
    { status: "in_progress" },
    { path: ".github/workflows/other.yml" },
    { head_sha: "non-commit" },
  ]) {
    await assert.rejects(investigate({ runId: 123456, token: "fake", fetchImpl: fake({ ...run, ...changed }) }), /Unapproved/);
  }
  await assert.rejects(investigate({ runId: "../123", token: "fake", fetchImpl: fake() }), /Missing/);
  await assert.rejects(investigate({ runId: 123456, token: "", fetchImpl: fake() }), /Missing/);
});

test("a successful run is skipped without requesting jobs", async () => {
  let calls = 0;
  const result = await investigate({ runId: 123456, token: "fake", fetchImpl: async (url, opts) => {
    calls++;
    return fake({ ...run, conclusion: "success" })(url, opts);
  } });
  assert.equal(result.skipped, true);
  assert.equal(calls, 1);
});

test("workflow is read-only and never executes pull-request source or post APIs", () => {
  const yml = readFileSync(new URL("../.github/workflows/ci-failure-investigation.yml", import.meta.url), "utf8");
  assert.match(yml, /workflow_run:/);
  assert.match(yml, /workflows: \["BlindBoxAI release gate"\]/);
  assert.match(yml, /actions: read/);
  assert.match(yml, /contents: read/);
  assert.match(yml, /ref: main/);
  assert.match(yml, /persist-credentials: false/);
  assert.match(yml, /timeout-minutes: 3/);
  assert.doesNotMatch(yml, /write|push|pull_request_target|repository_dispatch|secrets\.|curl|upload-artifact|npm ci|gh aw run/);
});
