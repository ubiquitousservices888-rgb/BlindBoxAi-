import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const dashboard = fs.readFileSync(new URL("../app/owner-dashboard/DashboardClient.jsx", import.meta.url), "utf8");
const uploadRoute = fs.readFileSync(new URL("../app/api/media/review-upload/route.js", import.meta.url), "utf8");
const workflow = fs.readFileSync(new URL("../.github/workflows/manual-reviewed-video.yml", import.meta.url), "utf8");
const publisher = fs.readFileSync(new URL("../scripts/publish-reviewed-upload.mjs", import.meta.url), "utf8");
const stageRoute = fs.readFileSync(new URL("../app/api/owner/stage-review/route.js", import.meta.url), "utf8");
const approvalRoute = fs.readFileSync(new URL("../app/api/owner/approve-review/route.js", import.meta.url), "utf8");
const approvalLibrary = fs.readFileSync(new URL("../lib/owner-batch-approval.mjs", import.meta.url), "utf8");

test("staged videos have per-video yellow watch and blue approval controls", () => {
  assert.match(dashboard, /WATCH VIDEO/);
  assert.match(dashboard, /#facc15/);
  assert.match(dashboard, /APPROVE & LAUNCH THIS VIDEO/);
  assert.match(dashboard, /\/api\/owner\/approve-review/);
  assert.match(dashboard, /reviewState === \"READY_FOR_REVIEW\"/);
  assert.match(dashboard, /approvedReviewUrls/);
  assert.doesNotMatch(dashboard, /APPROVE & LAUNCH ALL READY VIDEOS/);
});

test("yellow upload remains review-only", () => {
  assert.match(dashboard, /UPLOAD NEW REVIEW VIDEO/);
  assert.match(uploadRoute, /media\\\/review/);
  assert.match(uploadRoute, /review_media_upload_completed/);
  assert.match(uploadRoute, /approved:\s*false/);
  assert.doesNotMatch(uploadRoute, /approved_media_upload_completed/);
});

test("manual upload cannot publish until the protected owner environment is approved", () => {
  assert.match(workflow, /validate-review-upload/);
  assert.match(workflow, /READY_FOR_REVIEW/);
  assert.match(workflow, /environment:\s*\n\s*name:\s*social-production/);
  assert.match(workflow, /Publish exact owner-reviewed upload/);
  assert.match(workflow, /run-name: Review upload — \$\{\{ inputs\.video_url \}\}/);
  assert.match(publisher, /https:\/\/www\.blindboxai\.com/);
  assert.match(publisher, /DISCLOSURE/);
});

test("per-video approval is owner-authenticated and fails closed when the exact gate is absent", () => {
  assert.match(approvalRoute, /assertUploadCode/);
  assert.match(approvalRoute, /GITHUB_OWNER_APPROVAL_TOKEN/);
  assert.match(approvalRoute, /approveLaunchReadyVideo/);
  assert.match(approvalLibrary, /safeReviewVideoUrl/);
  assert.match(approvalLibrary, /not currently waiting at the owner approval gate/);
  assert.match(approvalLibrary, /Multiple approval gates matched/);
  assert.match(approvalLibrary, /current_user_can_approve === true/);
});

test("review staging route forwards only approved client fields", () => {
  assert.doesNotMatch(stageRoute, /\.\.\.body/);
  for (const field of ["videoUrl", "title", "sizeBytes", "durationSeconds", "width", "height"]) {
    assert.match(stageRoute, new RegExp(`${field}: body\\?\\.${field}`));
  }
});
