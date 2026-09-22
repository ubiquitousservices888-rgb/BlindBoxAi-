import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const workflowsDir = path.resolve(".github/workflows");
const workflowFiles = fs.readdirSync(workflowsDir)
  .filter((name) => /\.ya?ml$/i.test(name))
  .sort();

const scheduledAllowlist = new Set([
  "bounded-operations.yml",
  "evergreen-shopping-stage.yml",
  "know-it-all-public-research.yml",
  "know-it-all-transaction-verification.yml",
  "mr-know-it-all-tool-bot.yml",
  "narrative-flywheel-stage.yml",
  "partnership-flywheel-stage.yml",
]);

const publishingMarkers = [
  /npm run daily:publish/,
  /npm run video:publish/,
  /node scripts\/publish-approved-review-queue\.mjs/,
  /node scripts\/publish-reviewed-upload\.mjs/,
];

function source(name) {
  return fs.readFileSync(path.join(workflowsDir, name), "utf8");
}

function hasSchedule(text) {
  return /^  schedule:\s*$/m.test(text);
}

test("scheduled workflows are an explicit allowlist", () => {
  const scheduled = workflowFiles.filter((name) => hasSchedule(source(name)));
  assert.deepEqual(scheduled, [...scheduledAllowlist].sort());
});

test("workflows with publishing commands cannot have schedules", () => {
  const offenders = [];
  for (const name of workflowFiles) {
    const text = source(name);
    if (publishingMarkers.some((pattern) => pattern.test(text)) && hasSchedule(text)) {
      offenders.push(name);
    }
  }
  assert.deepEqual(offenders, []);
});

test("no workflow may orchestrate or loop the approved-review publisher", () => {
  const target = "publish-approved-reviews.yml";
  const offenders = [];

  for (const name of workflowFiles) {
    if (name === target) continue;
    const text = source(name);
    const dispatchesPublisher =
      /actions\/workflows\/publish-approved-reviews\.yml\/dispatches/.test(text) ||
      /gh\s+workflow\s+run\s+publish-approved-reviews\.yml/.test(text) ||
      /uses:\s*[^\n]*publish-approved-reviews\.yml/.test(text);

    if (dispatchesPublisher) offenders.push(name);
  }

  assert.deepEqual(offenders, []);
});
