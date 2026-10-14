import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import { createReviewBufferPublisher } from "../lib/buffer-review-publisher.mjs";
import { DISCLOSURE } from "../lib/daily-product-pipeline.mjs";
import { requirePublicVideoTitle, resolvePublicVideoTitle } from "../lib/public-video-title.mjs";
import { dispatchApprovedReviewPublication } from "../lib/owner-review-launch.mjs";

const dashboard = fs.readFileSync(new URL("../app/owner-dashboard/DashboardClient.jsx", import.meta.url), "utf8");
const dashboardRoute = fs.readFileSync(new URL("../app/api/owner/dashboard/route.js", import.meta.url), "utf8");
const uploadPage = fs.readFileSync(new URL("../app/media-upload/MediaUploadForm.jsx", import.meta.url), "utf8");
const uploadRoute = fs.readFileSync(new URL("../app/api/media/review-upload/route.js", import.meta.url), "utf8");
const freeUploadRoute = fs.readFileSync(new URL("../app/api/media/free-upload-ticket/route.js", import.meta.url), "utf8");
const storageAuthRoute = fs.readFileSync(new URL("../app/api/owner/storage-auth/route.js", import.meta.url), "utf8");
const legacyWorkflow = fs.readFileSync(new URL("../.github/workflows/manual-reviewed-video.yml", import.meta.url), "utf8");
const queuedWorkflow = fs.readFileSync(new URL("../.github/workflows/publish-approved-reviews.yml", import.meta.url), "utf8");
const queuedPublisher = fs.readFileSync(new URL("../scripts/publish-approved-review-queue.mjs", import.meta.url), "utf8");
const reviewedUploadPublisher = fs.readFileSync(new URL("../scripts/publish-reviewed-upload.mjs", import.meta.url), "utf8");
const homepage = fs.readFileSync(new URL("../app/page.jsx", import.meta.url), "utf8");
const stageRoute = fs.readFileSync(new URL("../app/api/owner/stage-review/route.js", import.meta.url), "utf8");
const approvalRoute = fs.readFileSync(new URL("../app/api/owner/approve-review/route.js", import.meta.url), "utf8");

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

test("staged videos have watch and per-video approval controls", () => {
  assert.match(uploadPage, /BLUE APPROVE \+ LAUNCH/);
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
  assert.match(dashboard, /OPEN SAFE VIDEO UPLOADER/);
  assert.match(dashboard, /href="\/media-upload"/);
  assert.doesNotMatch(dashboard, /@vercel\/blob|\/api\/media\/review-upload/);
  assert.match(uploadRoute, /media\\\/review/);
  assert.match(uploadRoute, /review_media_upload_completed/);
  assert.match(uploadRoute, /approved:\s*false/);
  assert.doesNotMatch(uploadRoute, /approved_media_upload_completed/);
});

test("legacy protected manual workflow remains available", () => {
  assert.match(legacyWorkflow, /validate-review-upload/);
  assert.match(legacyWorkflow, /READY_FOR_REVIEW/);
  assert.match(legacyWorkflow, /environment:\s*\n\s*name:\s*social-production/);
  assert.match(reviewedUploadPublisher, /createReviewBufferPublisher/);
  assert.match(reviewedUploadPublisher, /youtubeCategoryId:\s*"17"/);
  assert.match(legacyWorkflow, /youtube_audience:/);
  assert.match(reviewedUploadPublisher, /Owner must select the YouTube Made-for-Kids audience decision/);
  assert.match(reviewedUploadPublisher, /youtubeMadeForKids: channel === "youtube"/);
});

test("manual upload script parses and rejects an unreviewed YouTube audience before network access", () => {
  const script = new URL("./publish-reviewed-upload.mjs", import.meta.url).pathname;
  const result = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: {
      DRY_RUN: "false",
      VIDEO_CHANNELS: "youtube",
      REVIEWED_VIDEO_URL: "https://example.public.blob.vercel-storage.com/media/review/sample.mp4",
      REVIEWED_VIDEO_TITLE: "Sample collector review",
      RESEARCH_RUN_ID: "rv-0123456789abcdef",
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Owner must select the YouTube Made-for-Kids audience decision/);
  assert.doesNotMatch(result.stderr, /SyntaxError|fetch failed/);
});

test("public video titles auto-repair launch-blocking names without inventing product facts", () => {
  assert.equal(
    resolvePublicVideoTitle("3061", { researchRunId: "rv-0123456789abcdef" }),
    "BlindBoxAI Collectible Review — Item 3061",
  );
  for (const cameraName of ["VID_20260919", "DSC_0001", "IMG_20260919_123456.MOV"]) {
    assert.equal(
      resolvePublicVideoTitle(cameraName, { vertical: "pokemon_tcg", researchRunId: "rv-0123456789abcdef" }),
      "BlindBoxAI Pokémon Collectible Review — Ref abcdef",
    );
  }
  assert.equal(
    resolvePublicVideoTitle("", { researchRunId: "rv-0123456789abcdef" }),
    "BlindBoxAI Collectible Review — Ref abcdef",
  );
  assert.equal(
    resolvePublicVideoTitle("Pokémon 30th: Asking Price vs Sold Price"),
    "Pokémon 30th: Asking Price vs Sold Price",
  );
  assert.throws(() => requirePublicVideoTitle("3061"), /must describe the video/);
  assert.throws(() => requirePublicVideoTitle("DSC_0001"), /must describe the video/);
  assert.throws(() => requirePublicVideoTitle("IMG_20260919_123456.MOV"), /must describe the video/);
});

test("Blue approval binds launch to the exact queue row and permits blank title repair", () => {
  assert.match(dashboard, /researchRunId/);
  assert.match(dashboard, /JSON\.stringify\(\{ videoUrl, researchRunId, youtubeAudience:/);
  assert.match(uploadPage, /researchRunId: stageResult\?\.researchRunId/);
  assert.doesNotMatch(uploadPage, /maxLength=\{100\} required/);
  assert.match(approvalRoute, /\^rv-\[a-f0-9\]\{16\}\$/);
  assert.match(approvalRoute, /Choose the YouTube audience before approval/);
  assert.match(approvalRoute, /result\?\.research_run_id.*researchRunId/);
  assert.match(queuedWorkflow, /environment:\s*\n\s*name:\s*social-production/);
  assert.match(queuedWorkflow, /group:\s*publish-approved-review-videos-\$\{\{ inputs\.research_run_id \}\}/);
});

test("new queue publishing requires explicit approval before Buffer publishing", () => {
  assert.match(stageRoute, /review-video-queue/);
  assert.match(stageRoute, /action:\s*"stage"/);
  assert.match(approvalRoute, /review-video-queue/);
  assert.match(approvalRoute, /action:\s*"approve"/);
  assert.match(approvalRoute, /dispatchApprovedReviewPublication/);
  assert.match(queuedWorkflow, /id-token:\s*write/);
  assert.match(queuedWorkflow, /publish-approved-review-queue\.mjs/);
  assert.match(queuedPublisher, /action:\s*dryRun\s*\?\s*"peek"\s*:\s*"claim"/);
  assert.match(queuedPublisher, /createReviewBufferPublisher/);
  assert.match(queuedPublisher, /DISCLOSURE/);
  assert.match(queuedPublisher, /blindboxai-review-publisher/);
});

test("review publisher sends required YouTube metadata while omitting metadata for non-YouTube channels", async () => {
  const createRequests = [];
  const createdPostsByChannel = new Map();
  let mediaChecks = 0;
  const videoUrl = "https://cdn.example/video.mp4";
  const fetchImpl = async (url, options = {}) => {
    if (String(url) === videoUrl) {
      mediaChecks += 1;
      return {
        status: 206,
        redirected: false,
        url: videoUrl,
        headers: { get: (name) => name.toLowerCase() === "content-type" ? "video/mp4" : null },
        body: { cancel: async () => {} },
      };
    }

    const body = JSON.parse(options.body);
    const query = body.query;
    if (query.includes("query Organizations")) {
      return jsonResponse({ data: { account: { organizations: [{ id: "org-1", name: "Public" }] } } });
    }
    if (query.includes("query Channels")) {
      return jsonResponse({ data: { channels: [
        { id: "channel-youtube", name: "YouTube", displayName: "YouTube", service: "youtube", serviceId: "UCwaUc4e4iv2Q4P1nxlVrTvw", isQueuePaused: false, isDisconnected: false, isLocked: false },
        { id: "channel-tiktok", name: "TikTok", displayName: "TikTok", service: "tiktok", serviceId: "tiktok-test", isQueuePaused: false, isDisconnected: false, isLocked: false },
      ] } });
    }
    if (query.includes("query Existing")) {
      return jsonResponse({ data: { posts: { edges: [], pageInfo: { hasNextPage: false, endCursor: null } } } });
    }
    if (query.includes("mutation CreateReviewVideo")) {
      createRequests.push(body);
      const channelId = body.variables.input.channelId;
      const post = {
        id: `post-${channelId}`,
        text: body.variables.input.text,
        status: "sending",
        channelId,
      };
      createdPostsByChannel.set(channelId, post);
      return jsonResponse({ data: { createPost: { post } } });
    }
    if (query.includes("query VerifySentPost")) {
      const channelId = body.variables.channelIds[0];
      const created = createdPostsByChannel.get(channelId);
      if (!created) throw new Error(`no created post for ${channelId}`);
      const isYoutube = channelId === "channel-youtube";
      return jsonResponse({ data: { posts: {
        edges: [{ node: {
          ...created,
          status: "sent",
          externalLink: isYoutube
            ? "https://www.youtube.com/watch?v=verified123"
            : "https://www.tiktok.com/@blindboxai/video/1234567890",
          sentAt: "2026-09-22T13:00:00Z",
        } }],
        pageInfo: { hasNextPage: false, endCursor: null },
      } } });
    }
    throw new Error("unexpected Buffer query");
  };

  const publisher = createReviewBufferPublisher({
    token: "test-token", organizationId: "org-1", fetchImpl,
    mediaProbe: async () => ({ durationSeconds: 67, width: 720, height: 1280 }),
  });
  const caption = `Collector research\nhttps://blindboxai.com/series/test\n${DISCLOSURE}`;
  await assert.rejects(() => publisher({ channel: "youtube", videoUrl, caption, title: "Missing decision" }), /explicit Made-for-Kids decision/);
  const youtubeResult = await publisher({ channel: "youtube", videoUrl, caption, title: "YouTube <Title>", youtubeMadeForKids: true });
  const tiktokResult = await publisher({ channel: "tiktok", videoUrl, caption, title: "ignored" });
  await publisher({ channel: "youtube", videoUrl, caption, title: "Another Title", youtubeMadeForKids: false });

  assert.equal(mediaChecks, 3);
  assert.deepEqual(youtubeResult, {
    id: "post-channel-youtube",
    publicUrl: "https://www.youtube.com/watch?v=verified123",
    status: "sent",
    sentAt: "2026-09-22T13:00:00Z",
    duplicate: false,
  });
  assert.deepEqual(tiktokResult, {
    id: "post-channel-tiktok",
    publicUrl: "https://www.tiktok.com/@blindboxai/video/1234567890",
    status: "sent",
    sentAt: "2026-09-22T13:00:00Z",
    duplicate: false,
  });
  assert.deepEqual(createRequests[0].variables.input, {
    text: caption,
    channelId: "channel-youtube",
    schedulingType: "automatic",
    mode: "shareNow",
    assets: [{ video: { url: videoUrl } }],
    metadata: { youtube: { title: "YouTube Title", categoryId: "17", madeForKids: true } },
  });
  assert.deepEqual(createRequests[1].variables.input, {
    text: caption,
    channelId: "channel-tiktok",
    schedulingType: "automatic",
    mode: "shareNow",
    assets: [{ video: { url: videoUrl } }],
  });
  assert.deepEqual(createRequests[2].variables.input.metadata.youtube, {
    title: "Another Title", categoryId: "17", madeForKids: false,
  });
  assert.match(createRequests[0].query, /CreateReviewVideo\(\$input: CreatePostInput!\)/);
  assert.match(createRequests[0].query, /createPost\(input: \$input\)/);
  assert.doesNotMatch(createRequests[0].query, /PostInputMetaData/);
});


test("Blue approval dispatches one serialized YouTube + TikTok production run", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    const request = { url: String(url), options };
    requests.push(request);
    const method = options.method || "GET";
    if (method === "POST" && request.url.endsWith("/actions/workflows/publish-approved-reviews.yml/dispatches")) {
      return jsonResponse({
        workflow_run_id: 101,
        html_url: "https://github.com/example/actions/runs/101",
      });
    }
    if (method === "GET" && request.url.endsWith("/actions/runs/101/pending_deployments")) {
      return jsonResponse([{ environment: { id: 1101, name: "social-production" }, current_user_can_approve: true }]);
    }
    if (method === "POST" && request.url.endsWith("/actions/runs/101/pending_deployments")) {
      return { ok: true, status: 204, json: async () => ({}) };
    }
    throw new Error(`unexpected GitHub request: ${method} ${request.url}`);
  };

  const result = await dispatchApprovedReviewPublication({
    token: "masked-test-token",
    researchRunId: "rv-0123456789abcdef",
    youtubeAudience: "not_made_for_kids",
    fetchImpl,
    delayImpl: async () => {},
  });

  assert.deepEqual(result.channels, ["youtube", "tiktok"]);
  assert.equal(result.status, "dispatched_and_environment_approved");
  assert.equal(result.run.environmentApproved, true);
  const dispatchRequests = requests.filter((request) => request.url.endsWith("/actions/workflows/publish-approved-reviews.yml/dispatches"));
  assert.equal(dispatchRequests.length, 1);
  const dispatchBody = JSON.parse(dispatchRequests[0].options.body);
  assert.equal(dispatchBody.return_run_details, true);
  assert.equal(dispatchBody.inputs.publish_channel, "all");
  assert.equal(dispatchBody.ref, "main");
  assert.equal(dispatchBody.inputs.dry_run, false);
  assert.equal(dispatchBody.inputs.research_run_id, "rv-0123456789abcdef");
  assert.equal(dispatchBody.inputs.youtube_audience, "not_made_for_kids");
  const approvalRequests = requests.filter((request) => request.options.method === "POST" && request.url.endsWith("/pending_deployments"));
  assert.equal(approvalRequests.length, 1);
  assert.equal(JSON.parse(approvalRequests[0].options.body).state, "approved");
  assert.deepEqual(JSON.parse(approvalRequests[0].options.body).environment_ids, [1101]);
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
  assert.match(stageRoute, /publicTitle = resolvePublicVideoTitle\(body\?\.title/);
  assert.match(stageRoute, /title: publicTitle/);
  assert.match(stageRoute, /assertYoutubeShortsMetadata\(body\)/);
  assert.match(stageRoute, /typeof value === "number" && Number\.isFinite\(value\)/);
  for (const field of ["videoUrl", "sizeBytes", "durationSeconds", "width", "height"]) {
    assert.match(stageRoute, new RegExp(`${field}: body\\?\\.${field}`));
  }
});
