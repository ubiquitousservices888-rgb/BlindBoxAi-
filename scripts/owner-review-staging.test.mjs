import assert from "node:assert/strict";
import test from "node:test";
import { researchRunIdForVideo, stageOwnerReviewedVideo } from "../lib/owner-review-staging.mjs";

function response(status = 204) {
  return { ok: status >= 200 && status < 300, status, async json() { return {}; } };
}

test("yellow review staging dispatches exact MP4 to main without approving it", async () => {
  let request;
  const videoUrl = "https://blob.example/media/review/test.mp4";
  const result = await stageOwnerReviewedVideo({
    token: "masked-test-token",
    videoUrl,
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
  assert.match(result.researchRunId, /^rv-[a-f0-9]{16}$/);
  assert.equal(result.researchRunId, researchRunIdForVideo(videoUrl));
  assert.equal(result.campaignId, `bb-${result.researchRunId}`);
  assert.match(request.url, /manual-reviewed-video\.yml\/dispatches$/);
  const body = JSON.parse(request.options.body);
  assert.equal(body.ref, "main");
  assert.equal(body.inputs.video_url, videoUrl);
  assert.equal(body.inputs.title, "Collector review");
  assert.equal(body.inputs.research_run_id, result.researchRunId);
});

test("research run id is stable for the exact uploaded video and changes for a different video", () => {
  const first = researchRunIdForVideo("https://blob.example/media/review/a.mp4");
  assert.equal(first, researchRunIdForVideo("https://blob.example/media/review/a.mp4"));
  assert.notEqual(first, researchRunIdForVideo("https://blob.example/media/review/b.mp4"));
});

test("yellow staging rejects non-MP4 and invalid media metadata", async () => {
  await assert.rejects(
    () => stageOwnerReviewedVideo({
      token: "masked-test-token",
      videoUrl: "https://blob.example/media/review/test.mov",
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
      videoUrl: "https://blob.example/media/review/test.mp4",
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


test("yellow staging rejects MP4 URLs outside the review namespace", async () => {
  await assert.rejects(
    () => stageOwnerReviewedVideo({
      token: "masked-test-token",
      videoUrl: "https://blob.example/media/approved/test.mp4",
      title: "Wrong namespace",
      sizeBytes: 100,
      durationSeconds: 10,
      width: 1080,
      height: 1920,
      fetchImpl: async () => response(204),
    }),
    /\/media\/review\/ namespace/,
  );
});
