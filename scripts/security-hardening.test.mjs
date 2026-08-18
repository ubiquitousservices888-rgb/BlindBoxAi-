import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { assertOwnerDashboardCode } from "../lib/owner-auth.mjs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("owner dashboard uses a credential distinct from evidence upload", () => {
  const route = read("app/api/owner/dashboard/route.js");
  assert.match(route, /assertOwnerDashboardCode/);
  assert.doesNotMatch(route, /assertUploadCode|EVIDENCE_UPLOAD_CODE/);

  const previousOwner = process.env.OWNER_DASHBOARD_CODE;
  const previousEvidence = process.env.EVIDENCE_UPLOAD_CODE;
  process.env.OWNER_DASHBOARD_CODE = "owner-only-test-secret";
  process.env.EVIDENCE_UPLOAD_CODE = "evidence-only-test-secret";
  try {
    assert.equal(assertOwnerDashboardCode("owner-only-test-secret"), true);
    assert.throws(() => assertOwnerDashboardCode("evidence-only-test-secret"));
  } finally {
    if (previousOwner === undefined) delete process.env.OWNER_DASHBOARD_CODE;
    else process.env.OWNER_DASHBOARD_CODE = previousOwner;
    if (previousEvidence === undefined) delete process.env.EVIDENCE_UPLOAD_CODE;
    else process.env.EVIDENCE_UPLOAD_CODE = previousEvidence;
  }
});

test("hosted LLM execution and dependency are absent from the executable Mr Know It All implementation", () => {
  const agent = read("lib/mr-know-it-all-agent.mjs");
  const envExample = read(".env.example");
  const pkg = JSON.parse(read("package.json"));

  assert.doesNotMatch(agent, /@openai\/agents|webSearchTool|OPENAI_API_KEY|\bAgent\b|\brun\(/);
  assert.match(agent, /Hosted generative-AI execution is disabled/);
  assert.equal(pkg.scripts["mr:ask"], undefined);
  assert.equal(pkg.dependencies?.["@openai/agents"], undefined);
  assert.doesNotMatch(envExample, /OPENAI_API_KEY|OPENAI_QA_MODEL|MR_KNOW_IT_ALL_ENABLED/);
});

test("release gate remains mandatory in repository policy documentation", () => {
  const workflow = read(".github/workflows/release-gate.yml");
  assert.match(workflow, /pull_request:[\s\S]*branches:\s*\[main\]/);
  assert.match(workflow, /npm run predeploy/);
  assert.match(workflow, /npm run audit:epn/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /npm audit --audit-level=high/);
});
