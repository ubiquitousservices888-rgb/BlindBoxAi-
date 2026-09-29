import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(new URL("../.github/workflows/autonomous-video.yml", import.meta.url), "utf8");

test("video workflow stages verified renders only by explicit non-scheduled triggers", () => {
  assert.match(workflow, /workflow_dispatch/);
  assert.doesNotMatch(workflow, /\bschedule\s*:/);
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

const reviewOnlyWorkflow = fs.readFileSync(new URL("../.github/workflows/gemini-video-stage.yml", import.meta.url), "utf8");

test("review-only video workflow validates attribution, uses configured renderers, and cannot publish", () => {
  assert.match(reviewOnlyWorkflow, /workflow_dispatch/);
  assert.doesNotMatch(reviewOnlyWorkflow, /\bschedule\s*:/);
  assert.match(reviewOnlyWorkflow, /NEXT_PUBLIC_EPN_CAMPID:/);
  assert.match(reviewOnlyWorkflow, /CREATOMATE_API_KEY/);
  assert.match(reviewOnlyWorkflow, /GEMINI_API_KEY/);
  assert.match(reviewOnlyWorkflow, /BLOB_READ_WRITE_TOKEN/);
  assert.match(reviewOnlyWorkflow, /npm run video:daily/);
  assert.match(reviewOnlyWorkflow, /npm run video:gemini-stage/);
  assert.ok(
    reviewOnlyWorkflow.indexOf("npm run video:daily") < reviewOnlyWorkflow.indexOf("npm run video:gemini-stage"),
    "Creatomate must run before the guarded Gemini fallback",
  );
  assert.match(reviewOnlyWorkflow, /missing a renderer provider/);
  assert.match(reviewOnlyWorkflow, /VIDEO_CHANNELS:.*youtube,tiktok/);
  assert.match(reviewOnlyWorkflow, /ALLOW_MANUAL_VIDEO_PUBLISH:\s*"false"/);
  assert.match(reviewOnlyWorkflow, /READY_FOR_REVIEW/);
  assert.doesNotMatch(reviewOnlyWorkflow, /npm run video:publish|BUFFER_API_TOKEN|social-production/);
});

const stageRenderRoute = fs.readFileSync(new URL("../app/api/owner/stage-render/route.js", import.meta.url), "utf8");

test("autonomous render handoff stages canonical review media without bypassing owner approval", () => {
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /ffprobe/);
  assert.match(workflow, /blindboxai-autonomous-render-stage/);
  assert.match(workflow, /\/api\/owner\/stage-render/);
  assert.match(workflow, /CANONICAL_REVIEW_RESEARCH_RUN/);
  assert.match(workflow, /CANONICAL_REVIEW_CAMPAIGN/);
  assert.match(workflow, /blindboxai-review-videos\\\/media\\\/review/);
  assert.ok(
    workflow.indexOf("Stage verified render in canonical review storage") < workflow.indexOf("Prepare exact review state"),
    "Canonical staging must complete before the owner review artifact is prepared",
  );
  assert.match(workflow, /environment:\s*\n\s*name:\s*social-production/);
  assert.match(workflow, /npm run video:approve/);
  assert.match(workflow, /npm run video:publish/);

  assert.match(stageRenderRoute, /VERCEL_ENV !== "production"/);
  assert.match(stageRenderRoute, /VERCEL_GIT_COMMIT_REF !== "main"/);
  assert.match(stageRenderRoute, /blindboxai-autonomous-render-stage/);
  assert.match(stageRenderRoute, /workflow_ref !== WORKFLOW_REF/);
  assert.match(stageRenderRoute, /production_revision_not_ready/);
  assert.ok(stageRenderRoute.includes("backblazeb2.com"));
  assert.ok(stageRenderRoute.includes(".public.blob.vercel-storage.com"));
  assert.match(stageRenderRoute, /assertYoutubeShortsMetadata/);
  assert.match(stageRenderRoute, /\/api\/media\/free-upload-ticket/);
  assert.match(stageRenderRoute, /\/api\/owner\/stage-review/);
  assert.match(stageRenderRoute, /READY_FOR_REVIEW/);
  assert.match(stageRenderRoute, /approved:\s*false/);
  assert.match(stageRenderRoute, /published:\s*false/);
  assert.doesNotMatch(stageRenderRoute, /BUFFER_API_TOKEN|video:publish|social-production/);
});
