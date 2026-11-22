import test from "node:test";
import assert from "node:assert/strict";
import { triageVideoQueue } from "../lib/family-video-queue-triage.mjs";
const run = "rv-4815685fb0b10117";
test("stuck video with Buffer ID and stored URL is held for exact receipt verification", () => {
  const [result] = triageVideoQueue([{ research_run_id: run, status: "publishing",
    buffer_post_ids: { youtube: "6af206094af3cc032bb492db" },
    public_urls: { youtube: "https://www.youtube.com/watch?v=AZOsnqn48rI" } }]);
  assert.equal(result.nextAction, "RECONCILE_EXACT_PROVIDER_RECEIPT");
  assert.equal(result.mustNotRepublish, true);
  assert.equal(result.hasCandidateYoutubeUrl, true);
  assert.equal(result.publicProofVerified, false);
});
test("failed media requires preflight, never silent retry", () => {
  const [result] = triageVideoQueue([{ research_run_id: "rv-fdfc43f74104082a", status: "failed" }]);
  assert.equal(result.nextAction, "REVIEW_FAILURE_AND_MEDIA_PREFLIGHT");
  assert.equal(result.publicProofVerified, false);
});
test("missing provider ID blocks redispatch until reviewed", () => {
  const [result] = triageVideoQueue([{ research_run_id: run, status: "publishing", public_urls: { youtube: "https://www.youtube.com/watch?v=AZOsnqn48rI" } }]);
  assert.equal(result.nextAction, "HOLD_MISSING_PROVIDER_ID");
});
test("malformed URLs cannot be treated as candidate proof", () => {
  const [result] = triageVideoQueue([{ research_run_id: run, status: "publishing", buffer_post_ids: { youtube: "6af206094af3cc032bb492db" }, public_urls: { youtube: "https://www.youtube.com.attacker.example/watch?v=AZOsnqn48rI" } }]);
  assert.equal(result.hasCandidateYoutubeUrl, false);
  assert.equal(result.publicProofVerified, false);
});
test("duplicate or unrecognized records fail closed", () => {
  const row = { research_run_id: run, status: "publishing" };
  assert.throws(() => triageVideoQueue([row, row]), /duplicate/);
  assert.throws(() => triageVideoQueue([{ ...row, status: "unknown" }]), /Invalid/);
});
