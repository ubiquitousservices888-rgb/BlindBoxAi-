#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.env.DOCS_STATE_ROOT || process.cwd());
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  try {
    return fs.readFileSync(absolutePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      failures.push(`${relativePath}: file missing`);
      return null;
    }
    failures.push(`${relativePath}: unable to read (${error?.code || "unknown error"})`);
    return null;
  }
}

function requireMatch(relativePath, regex, description) {
  const text = read(relativePath);
  if (text === null) return;
  if (!regex.test(text)) failures.push(`${relativePath}: ${description}`);
}

function topLevelMappingKeys(text, key) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `${key}:` && !/^\s/.test(line));
  if (start < 0) return [];
  const keys = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line && !/^\s/.test(line) && !/^#/.test(line)) break;
    const match = /^  ([A-Za-z0-9_-]+):(?:\s|$)/.exec(line);
    if (match) keys.push(match[1]);
  }
  return keys;
}

requireMatch(
  "AGENTS.md",
  /CODED\s*→\s*COMMITTED\s*→\s*PUSHED\s*→\s*PR OPEN\s*→\s*CI PASSED\s*→\s*MERGED\s*→\s*DEPLOYED\s*→\s*LIVE VERIFIED/,
  "must define the single canonical state vocabulary",
);
requireMatch("AGENTS.md", /docs\/CURRENT_STATE\.md/, "must point agents to the canonical current-state document");
requireMatch("AGENTS.md", /docs\/CONTEXT_TRANSFER\.md/, "must require the canonical handoff protocol");
requireMatch("docs/CURRENT_STATE.md", /publish-approved-reviews\.yml/, "must name the canonical review-queue publisher");
requireMatch("docs/CURRENT_STATE.md", /youtube,tiktok/, "must record the canonical reviewed-video channel set");

const publisher = read(".github/workflows/publish-approved-reviews.yml");
if (publisher !== null) {
  const triggers = topLevelMappingKeys(publisher, "on");
  if (triggers.length !== 1 || triggers[0] !== "workflow_dispatch") {
    failures.push(
      `.github/workflows/publish-approved-reviews.yml: triggers must equal {workflow_dispatch}; found {${triggers.join(",") || "none"}}`,
    );
  }
  if (!/^\s*VIDEO_CHANNELS:\s*youtube,tiktok\s*$/m.test(publisher)) {
    failures.push(
      ".github/workflows/publish-approved-reviews.yml: reviewed-video channels must equal youtube,tiktok exactly",
    );
  }
}

const manual = read(".github/workflows/manual-reviewed-video.yml");
if (manual !== null && !/^\s*VIDEO_CHANNELS:\s*\$\{\{\s*vars\.VIDEO_CHANNELS\s*\|\|\s*'youtube,tiktok'\s*\}\}\s*$/m.test(manual)) {
  failures.push(
    ".github/workflows/manual-reviewed-video.yml: VIDEO_CHANNELS fallback must equal youtube,tiktok exactly",
  );
}

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
