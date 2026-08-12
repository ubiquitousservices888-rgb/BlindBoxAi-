import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const source = fs.readFileSync(path.join(root, "scripts/notebooklm-video-ingest.mjs"), "utf8");

test("NotebookLM ingest preserves manual review gate", () => {
  assert.match(source, /state:\s*STATES\.READY/);
  assert.doesNotMatch(source, /STATES\.APPROVED/);
});

test("NotebookLM ingest requires public hosted MP4", () => {
  assert.match(source, /access:\s*"public"/);
  assert.match(source, /contentType:\s*"video\/mp4"/);
  assert.match(source, /startsWith\("https:\/\/"\)/);
});

test("NotebookLM ingest uses verified-product pipeline", () => {
  assert.match(source, /selectDailyProduct/);
  assert.match(source, /validateVerifiedProduct/);
  assert.match(source, /generateVideoScript/);
});
