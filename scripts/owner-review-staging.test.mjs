import assert from "node:assert/strict";
import test from "node:test";
import { stageOwnerReviewedVideo } from "../lib/owner-review-staging.mjs";

function response(status = 204) {
  return { ok: status >= 200 && status < 300, status, async json() { return {}; } };
}

test("yellow review staging dispatches exact MP4 to main without approving it", async () => {
  let request;
  const result = await stageOwnerReviewedVideo({
    token: "masked-test-token",
    videoUrl: "https://blob.example/review/test.mp4",
    title: "Collector review",
    sizeBytes: 10_000_000,
    durationSeconds: 42.5,
    width: 1080,
    height: 1920,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return response(204);
    },
  });

  assert.equal(result.state, "READY_FOR_REVIEW");
  assert.equal(result.approved, false);
  assert.match(request.url, /manual-reviewed-video\.yml\/dispatches$/);
  const body = JSON.parse(request.options.body);
  assert.equal(body.ref, "main");
  assert.equal(body.inputs.video_url, "https://blob.example/review/test.mp4");
  assert.equal(body.inputs.title, "Collector review");
});

test("yellow staging rejects non-MP4 and invalid media metadata", async () => {
  await assert.rejects(
    () => stageOwnerReviewedVideo({
      token: "masked-test-token",
      videoUrl: "https://blob.example/review/test.mov",
      title: "Bad format",
      sizeBytes: 100,
      durationSeconds: 10,
      width: 1080,
      height: 1920,
      fetchImpl: async () => response(204),
    }),
    /MP4/,
  );

  await assert.rejects(
    () => stageOwnerReviewedVideo({
      token: "masked-test-token",
      videoUrl: "https://blob.example/review/test.mp4",
      title: "Bad metadata",
      sizeBytes: 100,
      durationSeconds: 0,
      width: 1080,
      height: 1920,
      fetchImpl: async () => response(204),
    }),
    /durationSeconds/,
  );
});
