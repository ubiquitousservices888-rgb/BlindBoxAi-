import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const checkerPath = fileURLToPath(new URL("./documentation-state-check.mjs", import.meta.url));

function write(root, relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blindbox-doc-state-"));
  write(root, "AGENTS.md", [
    "# AGENTS",
    "Read docs/CURRENT_STATE.md and docs/CONTEXT_TRANSFER.md.",
    "CODED → COMMITTED → PUSHED → PR OPEN → CI PASSED → MERGED → DEPLOYED → LIVE VERIFIED",
    "",
  ].join("\n"));
  write(root, "README.md", "Governance: see AGENTS.md.\n");
  write(root, "docs/CONTEXT_TRANSFER.md", "Use the state vocabulary defined in AGENTS.md.\n");
  write(root, "docs/CURRENT_STATE.md", "Canonical publisher: publish-approved-reviews.yml\nChannels: youtube,tiktok\nState vocabulary: see AGENTS.md.\n");
  write(root, ".github/workflows/publish-approved-reviews.yml", [
    "name: Publish approved review videos",
    "on:",
    "  workflow_dispatch:",
    "    inputs:",
    "      dry_run:",
    "        type: boolean",
    "permissions:",
    "  contents: read",
    "jobs:",
    "  publish:",
    "    env:",
    "      VIDEO_CHANNELS: youtube,tiktok",
    "",
  ].join("\n"));
  write(root, ".github/workflows/manual-reviewed-video.yml", [
    "name: Manual reviewed video",
    "on:",
    "  workflow_dispatch:",
    "jobs:",
    "  publish:",
    "    env:",
    "      VIDEO_CHANNELS: ${{ vars.VIDEO_CHANNELS || 'youtube,tiktok' }}",
    "",
  ].join("\n"));
  write(root, "docs/autonomous-video-pipeline.md", "Documentation status: ACTIVE SPECIALIST\n");
  write(root, "docs/daily-product-pipeline.md", "Documentation status: ACTIVE SPECIALIST\n");
  write(root, "docs/labubu-buffer-automation.md", "Documentation status: ACTIVE SPECIALIST\n");
  return root;
}

function run(root) {
  return spawnSync(process.execPath, [checkerPath], {
    cwd: root,
    env: { ...process.env, DOCS_STATE_ROOT: root },
    encoding: "utf8",
  });
}

test("baseline documentation state passes", () => {
  const root = fixture();
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /DOCUMENTATION_STATE_CHECK: PASS/);
});

test("secondary docs cannot redefine the canonical state vocabulary", () => {
  const root = fixture();
  fs.appendFileSync(
    path.join(root, "README.md"),
    "CODED → COMMITTED → PUSHED → PR OPEN → CI PASSED → MERGED → DEPLOYED → LIVE VERIFIED\n",
  );
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must link to AGENTS\.md instead of redefining/);
});

test("extended canonical channel list fails", () => {
  const root = fixture();
  const file = path.join(root, ".github/workflows/publish-approved-reviews.yml");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("youtube,tiktok", "youtube,tiktok,facebook"));
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /channels must equal youtube,tiktok exactly/);
});

test("extended manual fallback channel list fails", () => {
  const root = fixture();
  const file = path.join(root, ".github/workflows/manual-reviewed-video.yml");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("youtube,tiktok", "youtube,tiktok,facebook"));
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /fallback must equal youtube,tiktok exactly/);
});

test("adding push beside workflow_dispatch fails", () => {
  const root = fixture();
  const file = path.join(root, ".github/workflows/publish-approved-reviews.yml");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("  workflow_dispatch:\n", "  workflow_dispatch:\n  push:\n    branches: [main]\n"));
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /triggers must equal \{workflow_dispatch\}/);
});

test("adding schedule beside workflow_dispatch fails", () => {
  const root = fixture();
  const file = path.join(root, ".github/workflows/publish-approved-reviews.yml");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("  workflow_dispatch:\n", "  workflow_dispatch:\n  schedule:\n    - cron: '0 0 * * *'\n"));
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /triggers must equal \{workflow_dispatch\}/);
});

test("missing files are collected into one consolidated failure report", () => {
  const root = fixture();
  fs.rmSync(path.join(root, "docs/autonomous-video-pipeline.md"));
  fs.rmSync(path.join(root, "docs/labubu-buffer-automation.md"));
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DOCUMENTATION_STATE_CHECK: FAIL/);
  assert.match(result.stderr, /docs\/autonomous-video-pipeline\.md: file missing/);
  assert.match(result.stderr, /docs\/labubu-buffer-automation\.md: file missing/);
});
