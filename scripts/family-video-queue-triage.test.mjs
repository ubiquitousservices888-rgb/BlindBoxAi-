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

test("repeated video identity parameters cannot count as a candidate", () => {
  const [result] = triageVideoQueue([{ research_run_id: run, status: "publishing", public_urls: { youtube: "https://www.youtube.com/watch?v=AZOsnqn48rI&v=grY2Zsp05FU" } }]);
  assert.equal(result.hasCandidateYoutubeUrl, false);
  assert.equal(result.mustNotRepublish, true);
});

test("fresh receipt identities remain protected even when queue status disagrees", () => {
  // Reproduce the November 26 sent-but-public-proof-pending receipt, not a live fetch.
  const row = { research_run_id: "rv-04690175ee0d9a6c",
    buffer_post_ids: { youtube: "6ab1dbcbffe5c8afb1274015" },
    public_urls: { youtube: "https://www.youtube.com/watch?v=EJILIzobl84" } };
  for (const status of ["failed", "approved", "ready_for_review", "rejected", "publishing", "published"]) {
    const [result] = triageVideoQueue([{ ...row, status }]);
    assert.equal(result.mustNotRepublish, true, status);
    assert.equal(result.publicProofVerified, false, status);
    assert.equal(result.nextAction, status === "published" ? "AUDIT_PUBLIC_PROOF" : "RECONCILE_EXACT_PROVIDER_RECEIPT", status);
  }
});

test("candidate-only and historically published rows never authorize replacement", () => {
  for (const status of ["failed", "approved", "ready_for_review", "rejected", "published"]) {
    const [result] = triageVideoQueue([{ research_run_id: run, status,
      public_urls: { youtube: "https://www.youtube.com/watch?v=EJILIzobl84" } }]);
    assert.equal(result.mustNotRepublish, true, status);
    assert.equal(result.nextAction, status === "published" ? "AUDIT_PUBLIC_PROOF" : "HOLD_MISSING_PROVIDER_ID");
  }
  const [published] = triageVideoQueue([{ research_run_id: run, status: "published" }]);
  assert.equal(published.mustNotRepublish, true);
  const [unsubmitted] = triageVideoQueue([{ research_run_id: run, status: "approved" }]);
  assert.equal(unsubmitted.nextAction, "RESPECT_EXISTING_REVIEW_GATE");
  assert.equal(unsubmitted.mustNotRepublish, false);
});

test("malformed stored receipt evidence cannot authorize replacement", () => {
  for (const status of ["failed", "approved", "ready_for_review", "rejected"]) {
    for (const fields of [
      { buffer_post_ids: { youtube: " " } },
      { buffer_post_ids: { youtube: " padded-id " } },
      { buffer_post_ids: { youtube: 42 } },
      { public_urls: { youtube: "https://youtube.example/watch?v=EJILIzobl84" } },
      { public_urls: { youtube: "" } },
    ]) {
      const [result] = triageVideoQueue([{ research_run_id: run, status, ...fields }]);
      assert.equal(result.mustNotRepublish, true, JSON.stringify({ status, fields }));
      assert.equal(result.hasExactYoutubePostId, false);
      assert.equal(result.publicProofVerified, false);
      assert.equal(result.nextAction, "HOLD_MISSING_PROVIDER_ID");
    }
  }
});

test("malformed receipt containers cannot authorize replacement", () => {
  for (const status of ["failed", "approved", "ready_for_review", "rejected"]) {
    for (const key of ["buffer_post_ids", "public_urls"]) {
      for (const value of [null, "bad", 42, false, []]) {
        const [result] = triageVideoQueue([{ research_run_id: "rv-4815685fb0b10117", status, [key]: value }]);
        assert.equal(result.mustNotRepublish, true, JSON.stringify({ status, key, value }));
        assert.equal(result.nextAction, "HOLD_MISSING_PROVIDER_ID");
        assert.equal(result.publicProofVerified, false);
      }
    }
  }
});
test("absent and empty receipt maps retain existing review gate", () => {
  for (const fields of [{}, { buffer_post_ids: {}, public_urls: {} }]) {
    const [result] = triageVideoQueue([{ research_run_id: "rv-4815685fb0b10117", status: "approved", ...fields }]);
    assert.equal(result.mustNotRepublish, false);
    assert.equal(result.nextAction, "RESPECT_EXISTING_REVIEW_GATE");
  }
});
