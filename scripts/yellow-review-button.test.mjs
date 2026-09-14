import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const dashboard = fs.readFileSync(new URL("../app/owner-dashboard/DashboardClient.jsx", import.meta.url), "utf8");
const dashboardRoute = fs.readFileSync(new URL("../app/api/owner/dashboard/route.js", import.meta.url), "utf8");
const uploadPage = fs.readFileSync(new URL("../app/media-upload/MediaUploadForm.jsx", import.meta.url), "utf8");
const uploadRoute = fs.readFileSync(new URL("../app/api/media/review-upload/route.js", import.meta.url), "utf8");
const freeUploadRoute = fs.readFileSync(new URL("../app/api/media/free-upload-ticket/route.js", import.meta.url), "utf8");
const storageAuthRoute = fs.readFileSync(new URL("../app/api/owner/storage-auth/route.js", import.meta.url), "utf8");
const legacyWorkflow = fs.readFileSync(new URL("../.github/workflows/manual-reviewed-video.yml", import.meta.url), "utf8");
const queuedWorkflow = fs.readFileSync(new URL("../.github/workflows/publish-approved-reviews.yml", import.meta.url), "utf8");
const queuedPublisher = fs.readFileSync(new URL("../scripts/publish-approved-review-queue.mjs", import.meta.url), "utf8");
const homepage = fs.readFileSync(new URL("../app/page.jsx", import.meta.url), "utf8");
const stageRoute = fs.readFileSync(new URL("../app/api/owner/stage-review/route.js", import.meta.url), "utf8");
const approvalRoute = fs.readFileSync(new URL("../app/api/owner/approve-review/route.js", import.meta.url), "utf8");

test("staged videos have watch and per-video approval controls", () => {
  assert.match(uploadPage, /APPROVE & LAUNCH THIS VIDEO/);
  assert.match(uploadPage, /<video src=\{result\.url\}/);
  assert.match(uploadPage, /\/api\/owner\/approve-review/);
  assert.doesNotMatch(uploadPage, /APPROVE & LAUNCH ALL READY VIDEOS/);
  assert.match(dashboard, /WATCH VIDEO/);
  assert.match(dashboard, /#facc15/);
});

test("owner dashboard includes the Supabase review queue", () => {
  assert.match(dashboardRoute, /review-video-queue/);
  assert.match(dashboardRoute, /action:\s*"list"/);
  assert.match(dashboardRoute, /READY_FOR_REVIEW/);
  assert.match(dashboardRoute, /mediaUrl:\s*item\.video_url/);
  assert.match(dashboardRoute, /notifications:/);
});

test("phone upload uses owner-authenticated signed storage then enters research staging", () => {
  assert.match(uploadPage, /media\/review/);
  assert.match(uploadPage, /free-upload-ticket/);
  assert.match(uploadPage, /signedUrl/);
  assert.match(uploadPage, /publicUrl/);
  assert.match(uploadPage, /\/api\/owner\/stage-review/);
  assert.match(uploadPage, /Upload & stage for research/);
  assert.match(uploadPage, /Research campaign/);
  assert.match(freeUploadRoute, /blindbox-video-upload/);
  assert.match(freeUploadRoute, /100 \* 1024 \* 1024/);
  assert.match(storageAuthRoute, /assertUploadCode/);
  assert.match(storageAuthRoute, /Authorization/);
});

test("yellow upload remains review-only", () => {
  assert.match(dashboard, /UPLOAD NEW REVIEW VIDEO/);
  assert.match(uploadRoute, /media\\\/review/);
  assert.match(uploadRoute, /review_media_upload_completed/);
  assert.match(uploadRoute, /approved:\s*false/);
  assert.doesNotMatch(uploadRoute, /approved_media_upload_completed/);
});

test("legacy protected manual workflow remains available", () => {
  assert.match(legacyWorkflow, /validate-review-upload/);
  assert.match(legacyWorkflow, /READY_FOR_REVIEW/);
  assert.match(legacyWorkflow, /environment:\s*\n\s*name:\s*social-production/);
});

test("new queue publishing requires explicit approval before Buffer publishing", () => {
  assert.match(stageRoute, /review-video-queue/);
  assert.match(stageRoute, /action:\s*"stage"/);
  assert.match(approvalRoute, /review-video-queue/);
  assert.match(approvalRoute, /action:\s*"approve"/);
  assert.match(queuedWorkflow, /id-token:\s*write/);
  assert.match(queuedWorkflow, /publish-approved-review-queue\.mjs/);
  assert.match(queuedPublisher, /action:\s*"claim"/);
  assert.match(queuedPublisher, /createBufferPublisher/);
  assert.match(queuedPublisher, /DISCLOSURE/);
  assert.match(queuedPublisher, /blindboxai-review-publisher/);
});

test("successful queued publishing is linked into the public homepage feed", () => {
  assert.match(queuedPublisher, /published-video-feed/);
  assert.match(queuedPublisher, /blindboxai-video-publisher/);
  assert.match(queuedPublisher, /REVIEW_QUEUE_HOMEPAGE_LINKED/);
  assert.match(homepage, /published-video-feed/);
  assert.match(homepage, /sports_cards/);
  assert.match(homepage, /pokemon_tcg/);
  assert.match(homepage, /<video controls playsInline/);
});

test("review staging route forwards only approved client fields", () => {
  assert.doesNotMatch(stageRoute, /\.\.\.body/);
  for (const field of ["videoUrl", "title", "sizeBytes", "durationSeconds", "width", "height"]) {
    assert.match(stageRoute, new RegExp(`${field}: body\\?\\.${field}`));
  }
});
