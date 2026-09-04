import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const dashboard = fs.readFileSync(new URL("../app/owner-dashboard/DashboardClient.jsx", import.meta.url), "utf8");
const uploadRoute = fs.readFileSync(new URL("../app/api/media/review-upload/route.js", import.meta.url), "utf8");
const workflow = fs.readFileSync(new URL("../.github/workflows/manual-reviewed-video.yml", import.meta.url), "utf8");
const publisher = fs.readFileSync(new URL("../scripts/publish-reviewed-upload.mjs", import.meta.url), "utf8");

test("yellow control is visually distinct, review-only, and adjacent to blue approval", () => {
  assert.match(dashboard, /UPLOAD & REVIEW VIDEO/);
  assert.match(dashboard, /#facc15/);
  assert.match(dashboard, /APPROVE & LAUNCH ALL READY VIDEOS/);
  assert.match(dashboard, /READY_FOR_REVIEW — NOT APPROVED/);
  assert.match(dashboard, /\/api\/media\/review-upload/);
  assert.match(dashboard, /\/api\/owner\/stage-review/);
});

test("review uploads never enter the legacy approved namespace", () => {
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
  assert.match(publisher, /https:\/\/www\.blindboxai\.com/);
  assert.match(publisher, /DISCLOSURE/);
});
