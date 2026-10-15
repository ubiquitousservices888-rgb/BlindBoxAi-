import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Source-contract regression test. Read-only: no Supabase credentials, network, or live queue rows.
// RED on the known 2026-10-15 main implementation. This is a prerequisite,
// NOT a substitute for a disposable end-to-end test before protected code changes.
const source = readFileSync(new URL("../supabase/functions/review-video-queue/index.ts", import.meta.url), "utf8");
const start = source.indexOf("async function stage(");
const end = source.indexOf("async function listReady(", start);
assert.ok(start >= 0 && end > start, "stage() must be located");
const stage = source.slice(start, end);

test("stage() never overwrites an existing owner-approved or publishing row", () => {
  assert.match(stage, /ignoreDuplicates\s*:\s*true/, "stage insert must be conflict-ignore / insert-only");
  assert.doesNotMatch(stage, /\.upsert\([\s\S]*?\{\s*onConflict\s*:\s*["']research_run_id["']\s*\}\s*\)/,
    "unconditional upsert resets approved or published rows");
});

test("stage() re-reads canonical row after insert attempt before reporting ready", () => {
  const afterInsert = stage.slice(Math.max(stage.indexOf("ignoreDuplicates"), 0));
  assert.match(afterInsert, /\.from\(["']review_video_queue["']\)/,
    "re-read the stored canonical row after the insert attempt");
  assert.match(afterInsert, /\.maybeSingle\(\)/,
    "check actual stored row state rather than assuming staged");
});

test("stage() retains its authentication gate", () => {
  assert.match(stage, /if\s*\(!await stagingAuthorized\(req\)\)\s*return json\(\{ error: ["']Unauthorized["'] \}, 401\)/);
});
