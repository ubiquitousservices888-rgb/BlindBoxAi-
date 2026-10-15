import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Read-only source contracts; behavioral database tests still required before merge.
const source = readFileSync(new URL("../supabase/functions/review-video-queue/index.ts", import.meta.url), "utf8");
const start = source.indexOf("async function stage(");
const end = source.indexOf("async function listReady(", start);
assert.ok(start >= 0 && end > start, "stage() must be located");
const stage = source.slice(start, end);

test("stage() uses atomic conflict-ignore rather than an overwriting upsert", () => {
  assert.match(stage, /ignoreDuplicates\s*:\s*true/);
  assert.match(stage, /\.select\(["']research_run_id["']\)/);
  assert.doesNotMatch(stage, /\{ onConflict: "research_run_id" \}\)/);
});

test("new rows report duplicate:false and existing ready rows duplicate:true", () => {
  assert.match(stage, /inserted\.length > 0/);
  assert.match(stage, /duplicate: false/);
  assert.match(stage, /duplicate: true/);
});

test("existing advanced states return 409 and are never rewritten", () => {
  assert.match(stage, /canonical\.status !== "ready_for_review"/);
  assert.match(stage, /"Review row has already advanced beyond staging" \}, 409/);
  assert.doesNotMatch(stage, /\.update\(/);
});

test("stage() retains its authentication gate", () => {
  assert.match(stage, /if\s*\(!await stagingAuthorized\(req\)\)\s*return json\(\{ error: ["']Unauthorized["'] \}, 401\)/);
});
