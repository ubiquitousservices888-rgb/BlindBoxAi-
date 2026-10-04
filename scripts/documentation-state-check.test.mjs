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

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blindbox-doc-state-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, "AGENTS.md", [
    "# AGENTS",
    "Read docs/CURRENT_STATE.md and docs/CONTEXT_TRANSFER.md.",
    "CODED → COMMITTED → PUSHED → PR OPEN → CI PASSED → MERGED → DEPLOYED → LIVE VERIFIED",
    "",
  ].join("\n"));
  write(root, "README.md", "Governance: see AGENTS.md.\n");
  write(root, "docs/CONTEXT_TRANSFER.md", "Use the state vocabulary defined in AGENTS.md.\n");
  write(root, "docs/CURRENT_STATE.md", "Canonical publisher: publish-approved-reviews.yml\nSpecialist path: hair-salon-owner-approval.yml\nChannels: youtube,tiktok\nmerged PR #227; X/Twitter is parked; LinkedIn is not an active production target.\nPhone: /media-upload; legacy: /api/media/review-upload.\nOwner eBay OAuth: merged PR #168; lib/owner-ebay-oauth.mjs.\nState vocabulary: see AGENTS.md.\n");
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

test("baseline documentation state passes", (t) => {
  const root = fixture(t);
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /DOCUMENTATION_STATE_CHECK: PASS/);
});

test("secondary docs cannot redefine the canonical state vocabulary", (t) => {
  const root = fixture(t);
  fs.appendFileSync(
    path.join(root, "README.md"),
    "CODED → COMMITTED → PUSHED → PR OPEN → CI PASSED → MERGED → DEPLOYED → LIVE VERIFIED\n",
  );
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must link to AGENTS\.md instead of redefining/);
});

test("extended canonical channel list fails", (t) => {
  const root = fixture(t);
  const file = path.join(root, ".github/workflows/publish-approved-reviews.yml");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("youtube,tiktok", "youtube,tiktok,facebook"));
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /channels must equal youtube,tiktok exactly/);
});

test("extended manual fallback channel list fails", (t) => {
  const root = fixture(t);
  const file = path.join(root, ".github/workflows/manual-reviewed-video.yml");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("youtube,tiktok", "youtube,tiktok,facebook"));
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /fallback must equal youtube,tiktok exactly/);
});

test("adding push beside workflow_dispatch fails", (t) => {
  const root = fixture(t);
  const file = path.join(root, ".github/workflows/publish-approved-reviews.yml");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("  workflow_dispatch:\n", "  workflow_dispatch:\n  push:\n    branches: [main]\n"));
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /triggers must equal \{workflow_dispatch\}/);
});

test("adding schedule beside workflow_dispatch fails", (t) => {
  const root = fixture(t);
  const file = path.join(root, ".github/workflows/publish-approved-reviews.yml");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("  workflow_dispatch:\n", "  workflow_dispatch:\n  schedule:\n    - cron: '0 0 * * *'\n"));
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /triggers must equal \{workflow_dispatch\}/);
});

test("missing files are collected into one consolidated failure report", (t) => {
  const root = fixture(t);
  fs.rmSync(path.join(root, "docs/autonomous-video-pipeline.md"));
  fs.rmSync(path.join(root, "docs/labubu-buffer-automation.md"));
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DOCUMENTATION_STATE_CHECK: FAIL/);
  assert.match(result.stderr, /docs\/autonomous-video-pipeline\.md: file missing/);
  assert.match(result.stderr, /docs\/labubu-buffer-automation\.md: file missing/);
});


test("missing owner eBay OAuth state fails", (t) => {
  const root = fixture(t);
  const file = path.join(root, "docs/CURRENT_STATE.md");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("merged PR #168", "owner OAuth pending"));
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must record the owner eBay OAuth merge/);
});
