import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(new URL("../.github/workflows/autonomous-video.yml", import.meta.url), "utf8");

test("video workflow stages verified renders on schedule and manual dispatch", () => {
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /\bschedule\s*:/);
  assert.match(workflow, /Render one verified video for review/);
  assert.match(workflow, /npm run video:daily/);
  assert.match(workflow, /READY_FOR_REVIEW/);
  assert.match(workflow, /ALLOW_MANUAL_VIDEO_RENDER:\s*"true"/);
});

test("Buffer publishing remains behind the owner production gate", () => {
  assert.match(workflow, /BUFFER_API_TOKEN/);
  assert.match(workflow, /BUFFER_ORGANIZATION_ID/);
  assert.match(workflow, /npm run video:approve/);
  assert.match(workflow, /npm run video:publish/);
  assert.match(workflow, /environment:\s*\n\s*name:\s*social-production/);
  assert.match(workflow, /ALLOW_MANUAL_VIDEO_PUBLISH:\s*"true"/);
  assert.match(workflow, /Reviewed video URL changed before publication/);
});

test("production video path avoids the former Zapier handoff and preserves exact-state review", () => {
  assert.doesNotMatch(workflow, /ZAPIER_VIDEO_WEBHOOK_URL|npm run video:zapier/);
  assert.match(workflow, /state_b64/);
  assert.match(workflow, /ready-for-review-/);
  assert.match(workflow, /social-production approval gate/i);
});
