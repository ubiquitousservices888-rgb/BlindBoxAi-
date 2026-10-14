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

test("verified publication remains behind the owner production gate", () => {
  assert.match(workflow, /BUFFER_API_TOKEN/);
  assert.match(workflow, /BUFFER_ORGANIZATION_ID/);
  assert.match(workflow, /environment:\s*\n\s*name:\s*social-production/);
  assert.match(workflow, /inputs\.publish_after_approval == true/);
  assert.match(workflow, /action: "approve"/);
  assert.match(workflow, /Publish and verify YouTube/);
  assert.match(workflow, /Publish and verify TikTok/);
  assert.match(workflow, /node scripts\/publish-approved-review-queue\.mjs/);
  assert.match(workflow, /youtube_audience:/);
  assert.match(workflow, /default: unreviewed/);
  assert.match(workflow, /YOUTUBE_AUDIENCE: \$\{\{ inputs\.youtube_audience \}\}/);
  assert.doesNotMatch(workflow, /YOUTUBE_AUDIENCE:\s*not_made_for_kids/);
  assert.doesNotMatch(workflow, /npm run video:publish/);
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

const hairSalonWorkflow = fs.readFileSync(new URL("../.github/workflows/hair-salon-owner-approval.yml", import.meta.url), "utf8");
const stageRenderRoute = fs.readFileSync(new URL("../app/api/owner/stage-render/route.js", import.meta.url), "utf8");
const hairSalonAsset = fs.readFileSync(new URL("../lib/hair-salon-asset.mjs", import.meta.url), "utf8");
const storageAuthRoute = fs.readFileSync(new URL("../app/api/owner/storage-auth/route.js", import.meta.url), "utf8");
const uploadBroker = fs.readFileSync(new URL("../supabase/functions/blindbox-video-upload/index.ts", import.meta.url), "utf8");
const reviewQueueFunction = fs.readFileSync(new URL("../supabase/functions/review-video-queue/index.ts", import.meta.url), "utf8");
const publishedFeedFunction = fs.readFileSync(new URL("../supabase/functions/published-video-feed/index.ts", import.meta.url), "utf8");
const publishingGateDeployWorkflow = fs.readFileSync(new URL("../.github/workflows/deploy-publishing-gate-functions.yml", import.meta.url), "utf8");

test("autonomous render handoff ffprobes canonical bytes before READY_FOR_REVIEW and cannot bypass owner approval", () => {
  const renderJob = workflow.match(/\n  render:[\s\S]*?\n  publish-after-approval:/)?.[0] ?? "";
  assert.match(renderJob, /permissions:\s*\n\s*contents:\s*read\s*\n\s*actions:\s*read\s*\n\s*id-token:\s*write/);
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
  assert.match(workflow, /const upload = await stageRequest\(\{[\s\S]*?\},\s*\{ maxWaitMs: 240000, retryRevision: true \}\);/);
  assert.match(workflow, /new AbortController\(\)/);
  assert.match(workflow, /signal: controller\.signal/);
  assert.match(workflow, /const sleepMs = Math\.min\(5000, deadline - Date\.now\(\)\)/);
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
  assert.match(publishJob, /action: "approve"/);
  assert.match(publishJob, /PUBLISH_CHANNEL: youtube/);
  assert.match(publishJob, /PUBLISH_CHANNEL: tiktok/);
  assert.match(publishJob, /node scripts\/publish-approved-review-queue\.mjs/);
  assert.doesNotMatch(publishJob, /npm run video:publish/);

  assert.match(stageRenderRoute, /VERCEL_ENV !== "production"/);
  assert.match(stageRenderRoute, /production_revision_not_ready/);
  assert.match(stageRenderRoute, /canonicalReviewVideoUrl/);
  assert.match(stageRenderRoute, /readBoundedResponseBytes/);
  assert.match(stageRenderRoute, /createHash\("sha256"\)/);
  assert.match(stageRenderRoute, /canonical_video_hash_mismatch/);
  assert.match(stageRenderRoute, /deterministicResearchRunId/);
  assert.match(stageRenderRoute, /createHash\("sha256"\)\.update\(canonicalVideoUrl\)/);
  assert.match(stageRenderRoute, /stagedResearchRunId = deterministicResearchRunId/);
  const hashCheckIndex = stageRenderRoute.indexOf("canonical_video_hash_mismatch");
  const stageReviewCallIndex = stageRenderRoute.indexOf('"/api/owner/stage-review"');
  assert.notEqual(hashCheckIndex, -1, "Canonical byte hash verification must exist");
  assert.notEqual(stageReviewCallIndex, -1, "Review staging call must exist");
  assert.ok(hashCheckIndex < stageReviewCallIndex, "Exact canonical bytes must be verified before READY_FOR_REVIEW");
  assert.match(stageRenderRoute, /action === "cleanup"/);
  assert.match(stageRenderRoute, /approved:\s*false/);
  assert.match(stageRenderRoute, /published:\s*false/);
  assert.doesNotMatch(stageRenderRoute, /BUFFER_API_TOKEN|video:publish/);
  assert.match(stageRenderRoute, /OWNER_GATED_SUBJECT/);
  assert.match(stageRenderRoute, /ownerGatePresent/);
});

test("Hair Salon one-approval path uses canonical Supabase storage and publisher without Vercel Blob", () => {
  assert.match(hairSalonWorkflow, /Upload exact asset to Supabase and stage READY_FOR_REVIEW/);
  assert.match(hairSalonWorkflow, /EXPECTED_SHA256:\s*7097fc885956f8b28cd38d942099ba8cb153f8b8adb68ce134cf311e14f996d0/);
  assert.match(hairSalonWorkflow, /EXPECTED_SIZE:\s*"121797"/);
  assert.match(hairSalonWorkflow, /stat -c %s hair-salon\.mp4/);
  assert.match(hairSalonWorkflow, /sha256sum --check -/);
  assert.match(hairSalonWorkflow, /width !== 720 \|\| height !== 1280/);
  assert.match(hairSalonWorkflow, /lazzdoadoqzrzlarerfx\.supabase\.co\/storage\/v1\/object\/public\/blindboxai-review-videos/);
  assert.match(hairSalonWorkflow, /STAGE_RENDER_URL:\s*https:\/\/www\.blindboxai\.com\/api\/owner\/stage-render/);
  assert.match(hairSalonWorkflow, /CANONICAL_UPLOADED/);
  assert.match(hairSalonWorkflow, /READY_FOR_REVIEW/);
  const publisherJob = hairSalonWorkflow.match(/\n  publish-after-owner-approval:[\s\S]*$/)?.[0] ?? "";
  assert.match(publisherJob, /environment:\s*\n\s*name:\s*social-production/);
  assert.match(publisherJob, /PUBLISH_RESEARCH_RUN_ID:/);
  assert.match(publisherJob, /YOUTUBE_AUDIENCE:\s*not_made_for_kids/);
  assert.match(publisherJob, /action: "approve"/);
  assert.match(publisherJob, /body\?\.state !== "APPROVED"|body\?\.state !== \"APPROVED\"/);
  assert.match(publisherJob, /PUBLISH_CHANNEL: youtube/);
  assert.match(publisherJob, /PUBLISH_CHANNEL: tiktok/);
  assert.match(publisherJob, /node scripts\/publish-approved-review-queue\.mjs/);
  assert.doesNotMatch(hairSalonWorkflow, /BLOB_READ_WRITE_TOKEN|@vercel\/blob|publish-reviewed-upload\.mjs|public\.blob\.vercel-storage\.com/);
});

test("stage-render explicitly trusts the immutable Hair Salon workflow and exact release source", () => {
  assert.match(stageRenderRoute, /hair-salon-owner-approval\.yml@refs\/heads\/main/);
  assert.match(stageRenderRoute, /HAIR_SALON_RELEASE_SOURCE/);
  assert.match(stageRenderRoute, /2026-08-30-labubu-hair-salon-vinyl-plush-pendant-verified\.mp4/);
  assert.match(stageRenderRoute, /HAIR_SALON_WORKFLOW_REF && oidc\.event_name === "push"/);
  assert.match(stageRenderRoute, /owner_gate_required/);
  assert.match(stageRenderRoute, /source_video_redirect_untrusted/);
});


test("review storage broker keeps deletion owner-only and malformed requests fail closed", () => {
  assert.match(storageAuthRoute, /X-Storage-Action/);
  assert.match(
    storageAuthRoute,
    /if \(action === "delete"\)\s*\{\s*assertOwnerCode\(ownerCode\);\s*\} else \{\s*assertStagingCode\(ownerCode\);/s,
  );
  assert.match(uploadBroker, /safePath\(body\?\.path\)/);
  assert.match(uploadBroker, /throw new Error\("invalid_path"\)/);
  assert.match(uploadBroker, /if \(!\["ticket", "delete"\]\.includes\(action\)\)/);
  assert.match(uploadBroker, /error: "invalid_action"/);
  assert.match(uploadBroker, /https:\/\/www\.blindboxai\.com\/api\/owner\/storage-auth/);
  assert.match(uploadBroker, /"X-Storage-Action": action/);
  assert.match(
    uploadBroker,
    /if \(!authCheck\.ok\) return json\(\{ error: "unauthorized" \}, 401, origin\);[\s\S]*?if \(action === "delete"\) \{\s*const removed = await supabase\.storage\.from\(BUCKET\)\.remove\(\[path\]\);/s,
  );
  assert.match(uploadBroker, /bucket_policy_mismatch/);
  assert.match(uploadBroker, /bucket\.public !== true/);
  assert.match(uploadBroker, /fileSizeLimit !== MAX_BYTES/);
  assert.match(uploadBroker, /allowedMimeTypes\.length !== 1/);
  assert.match(uploadBroker, /allowedMimeTypes\[0\] !== "video\/mp4"/);
  assert.match(uploadBroker, /"https:\/\/www\.blindboxai\.com"/);
  assert.doesNotMatch(uploadBroker, /fetch\("https:\/\/blindboxai\.com\/api\/owner\/storage-auth"/);
});

test("protected autonomous publisher is explicitly trusted and Edge Functions deploy from reviewed main", () => {
  for (const source of [reviewQueueFunction, publishedFeedFunction]) {
    assert.match(source, /autonomous-video\.yml@refs\/heads\/main/);
    assert.match(source, /hair-salon-owner-approval\.yml@refs\/heads\/main/);
    assert.match(source, /payload\.event_name !== "workflow_dispatch"/);
    assert.match(source, /hair-salon-owner-approval\.yml@refs\/heads\/main"\) && payload\.event_name !== "push"/);
    assert.match(source, /refs\/heads\/main/);
  }
  assert.match(publishingGateDeployWorkflow, /push:\s*\n\s*branches: \[main\]/);
  assert.match(publishingGateDeployWorkflow, /SUPABASE_ACCESS_TOKEN/);
  assert.match(publishingGateDeployWorkflow, /supabase@2\.117\.0 functions deploy blindbox-video-upload/);
  assert.match(publishingGateDeployWorkflow, /supabase@2\.117\.0 functions deploy review-video-queue/);
  assert.match(publishingGateDeployWorkflow, /supabase@2\.117\.0 functions deploy published-video-feed/);
  assert.match(publishingGateDeployWorkflow, /--no-verify-jwt/);
});
