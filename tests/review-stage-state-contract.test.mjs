import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Source contracts complement disposable behavioral and PostgREST-level tests.
const source = readFileSync(new URL("../supabase/functions/review-video-queue/index.ts", import.meta.url), "utf8");
const start = source.indexOf("async function stage(");
const end = source.indexOf("async function listReady(", start);
assert.ok(start >= 0 && end > start, "stage() must exist");
const stage = source.slice(start, end);

test("stage performs the atomic conflict-ignore call, not an overwriting upsert", () => {
  assert.match(stage, /\.upsert\([\s\S]*?\{ onConflict: "research_run_id", ignoreDuplicates: true \}\s*,?\s*\)/);
  assert.match(stage, /\.select\(["']research_run_id["']\)/);
  assert.doesNotMatch(stage, /\{ onConflict: "research_run_id" \}\)/);
});

test("stage responds with the canonical duplicate metadata, never retry data", () => {
  assert.match(stage, /inserted\.length > 0/);
  assert.match(stage, /duplicate: false/);
  assert.match(stage, /duplicate: true/);
  assert.match(stage, /title: canonical\.title/);
  assert.match(stage, /videoUrl: canonical\.video_url/);
});

test("existing advanced states are immutable and return 409", () => {
  assert.match(stage, /canonical\.status !== "ready_for_review"/);
  assert.match(stage, /"Review row has already advanced beyond staging" \}, 409/);
  assert.doesNotMatch(stage, /\.from\(["']review_video_queue["']\)[\s\S]*?\.update\(/);
});

test("authentication guard executes before first staging write", () => {
  const gate = stage.indexOf("stagingAuthorized(req)");
  const write = stage.indexOf(".upsert(");
  assert.ok(gate >= 0 && write >= 0 && gate < write, "auth must precede database write");
  assert.match(stage, /if\s*\(!await stagingAuthorized\(req\)\)\s*return json\(\{ error: ["']Unauthorized["'] \}, 401\)/);
});
