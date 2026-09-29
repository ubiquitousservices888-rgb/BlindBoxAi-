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
const storageAuthRoute = fs.readFileSync(new URL("../app/api/owner/storage-auth/route.js", import.meta.url), "utf8");
const uploadBroker = fs.readFileSync(new URL("../supabase/functions/blindbox-video-upload/index.ts", import.meta.url), "utf8");

test("autonomous render handoff ffprobes canonical bytes before READY_FOR_REVIEW and cannot bypass owner approval", () => {
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /ffprobe/);
  assert.match(workflow, /allowedRendererUrl/);
  const allowlistGuardIndex = workflow.indexOf("if (!allowedRendererUrl(sourceVideoUrl))");
  const sourceDownloadIndex = workflow.indexOf("const sourceBytes = await readBounded(sourceVideoUrl)");
  assert.notEqual(allowlistGuardIndex, -1, "Renderer allowlist guard must exist");
  assert.notEqual(sourceDownloadIndex, -1, "Renderer download must exist");
  assert.ok(allowlistGuardIndex < sourceDownloadIndex, "Renderer allowlist must run before network download");

  assert.match(workflow, /CANONICAL_UPLOADED/);
  assert.match(workflow, /canonicalProbe = ffprobe/);
  assert.match(workflow, /createHash\("sha256"\)/);
  const canonicalProbeIndex = workflow.indexOf("const canonicalProbe = ffprobe");
  const stageActionIndex = workflow.indexOf('action: "stage"');
  assert.notEqual(canonicalProbeIndex, -1, "Canonical Supabase copy must be ffprobed");
  assert.notEqual(stageActionIndex, -1, "READY_FOR_REVIEW stage action must exist");
  assert.ok(canonicalProbeIndex < stageActionIndex, "Canonical copy must be ffprobed before queue staging");
  assert.match(workflow, /Math\.abs\(canonicalProbe\.durationSeconds - sourceProbe\.durationSeconds\) > 0\.05/);
  assert.match(workflow, /stageRequest\([\s\S]*48\)/);
  assert.match(workflow, /action: "cleanup"/);

  const canonicalStageIndex = workflow.indexOf("Stage verified render in canonical review storage");
  const prepareReviewIndex = workflow.indexOf("Prepare exact review state");
  assert.notEqual(canonicalStageIndex, -1, "Canonical staging step must exist");
  assert.notEqual(prepareReviewIndex, -1, "Prepare-review step must exist");
  assert.ok(canonicalStageIndex < prepareReviewIndex, "Canonical staging must complete before owner review");

  const publishInput = workflow.match(
    /publish_after_approval:\s*\n\s+description:[^\n]*\n\s+required:\s*true\s*\n\s+default:\s*false\s*\n\s+type:\s*boolean/,
  )?.[0];
  assert.ok(publishInput, "publish_after_approval must default to false");

  const publishJob = workflow.match(/\n  publish-after-approval:[\s\S]*$/)?.[0] ?? "";
  assert.match(
    publishJob,
    /if:\s*needs\.render\.result == 'success' && github\.ref == 'refs\/heads\/main' && github\.event_name == 'workflow_dispatch' && inputs\.publish_after_approval == true/,
  );
  assert.match(publishJob, /environment:\s*\n\s*name:\s*social-production/);
  assert.match(publishJob, /npm run video:approve/);
  assert.match(publishJob, /npm run video:publish/);

  assert.match(stageRenderRoute, /VERCEL_ENV !== "production"/);
  assert.match(stageRenderRoute, /production_revision_not_ready/);
  assert.match(stageRenderRoute, /canonicalReviewVideoUrl/);
  assert.match(stageRenderRoute, /readBoundedResponseBytes/);
  assert.match(stageRenderRoute, /createHash\("sha256"\)/);
  assert.match(stageRenderRoute, /canonical_video_hash_mismatch/);
  const hashCheckIndex = stageRenderRoute.indexOf("canonical_video_hash_mismatch");
  const stageReviewCallIndex = stageRenderRoute.indexOf('"/api/owner/stage-review"');
  assert.notEqual(hashCheckIndex, -1, "Canonical byte hash verification must exist");
  assert.notEqual(stageReviewCallIndex, -1, "Review staging call must exist");
  assert.ok(hashCheckIndex < stageReviewCallIndex, "Exact canonical bytes must be verified before READY_FOR_REVIEW");
  assert.match(stageRenderRoute, /action === "cleanup"/);
  assert.match(stageRenderRoute, /approved:\s*false/);
  assert.match(stageRenderRoute, /published:\s*false/);
  assert.doesNotMatch(stageRenderRoute, /BUFFER_API_TOKEN|video:publish|social-production/);
});


test("review storage broker keeps deletion owner-only and malformed requests fail closed", () => {
  assert.match(storageAuthRoute, /X-Storage-Action/);
  assert.match(
    storageAuthRoute,
    /if \(action === "delete"\)\s*\{\s*assertOwnerCode\(ownerCode\);\s*\} else \{\s*assertStagingCode\(ownerCode\);/s,
  );
  assert.match(uploadBroker, /safePath\(body\?\.path\)/);
  assert.match(uploadBroker, /https:\/\/www\.blindboxai\.com\/api\/owner\/storage-auth/);
  assert.match(uploadBroker, /"X-Storage-Action": action/);
  const authRejectIndex = uploadBroker.indexOf('if (!authCheck.ok) return json({ error: "unauthorized" }');
  const deleteBranchIndex = uploadBroker.indexOf('if (action === "delete")');
  const removeIndex = uploadBroker.indexOf(".remove([path])");
  assert.notEqual(authRejectIndex, -1, "Failed storage authorization must be handled");
  assert.notEqual(deleteBranchIndex, -1, "Delete branch must exist");
  assert.notEqual(removeIndex, -1, "Service-role storage delete must exist");
  assert.ok(authRejectIndex < deleteBranchIndex, "Authorization must succeed before delete branch");
  assert.ok(deleteBranchIndex < removeIndex, "Service-role removal must remain inside the delete branch");
  assert.match(uploadBroker, /"https:\/\/www\.blindboxai\.com"/);
  assert.doesNotMatch(uploadBroker, /fetch\("https:\/\/blindboxai\.com\/api\/owner\/storage-auth"/);
});

