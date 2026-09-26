#!/usr/bin/env node

import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const failures = [];

function requireMatch(path, regex, description) {
  const text = read(path);
  if (!regex.test(text)) failures.push(`${path}: ${description}`);
}

requireMatch("AGENTS.md", /docs\/CURRENT_STATE\.md/, "must point agents to the canonical current-state document");
requireMatch("AGENTS.md", /docs\/CONTEXT_TRANSFER\.md/, "must require the canonical handoff protocol");
requireMatch("docs/CURRENT_STATE.md", /publish-approved-reviews\.yml/, "must name the canonical review-queue publisher");
requireMatch("docs/CURRENT_STATE.md", /youtube,tiktok/, "must record the canonical reviewed-video channel set");

const publisher = read(".github/workflows/publish-approved-reviews.yml");
const permissionsIndex = publisher.indexOf("\npermissions:");
const triggerBlock = permissionsIndex >= 0 ? publisher.slice(0, permissionsIndex) : publisher;
if (!/\n\s*workflow_dispatch:\s*\n/.test(triggerBlock)) {
  failures.push(".github/workflows/publish-approved-reviews.yml: workflow_dispatch trigger is required");
}
if (/\n\s*schedule:\s*\n/.test(triggerBlock)) {
  failures.push(".github/workflows/publish-approved-reviews.yml: scheduled publishing would contradict the canonical manual gate");
}
if (!/VIDEO_CHANNELS:\s*youtube,tiktok/.test(publisher)) {
  failures.push(".github/workflows/publish-approved-reviews.yml: reviewed-video channels must remain explicitly pinned to youtube,tiktok");
}

requireMatch(".github/workflows/manual-reviewed-video.yml", /VIDEO_CHANNELS:.*youtube,tiktok/, "manual reviewed uploads must default to youtube,tiktok");
requireMatch("docs/autonomous-video-pipeline.md", /Documentation status: ACTIVE SPECIALIST/, "must identify itself as a specialist path");
requireMatch("docs/daily-product-pipeline.md", /Documentation status: ACTIVE SPECIALIST/, "must identify itself as a specialist path");
requireMatch("docs/labubu-buffer-automation.md", /Documentation status: ACTIVE SPECIALIST/, "must identify itself as a specialist path");

if (failures.length) {
  console.error("DOCUMENTATION_STATE_CHECK: FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("DOCUMENTATION_STATE_CHECK: PASS");
console.log("Canonical review-video publisher: .github/workflows/publish-approved-reviews.yml");
console.log("Canonical reviewed-video channels: youtube,tiktok");
console.log("Context handoff protocol: docs/CONTEXT_TRANSFER.md");
