import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createReviewBufferPublisher } from "../lib/buffer-review-publisher.mjs";
import { DISCLOSURE } from "../lib/daily-product-pipeline.mjs";
import { requirePublicVideoTitle } from "../lib/public-video-title.mjs";

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
});

test("public video titles reject numeric internal IDs", () => {
  assert.throws(() => requirePublicVideoTitle("3061"), /must describe the video/);
  assert.throws(() => requirePublicVideoTitle("VID_20260919"), /must describe the video/);
  assert.equal(
    requirePublicVideoTitle("Pokémon 30th: Asking Price vs Sold Price"),
    "Pokémon 30th: Asking Price vs Sold Price",
  );
});

test("new queue publishing requires explicit approval before Buffer publishing", () => {
  assert.match(stageRoute, /review-video-queue/);
  assert.match(stageRoute, /action:\s*"stage"/);
  assert.match(approvalRoute, /review-video-queue/);
  assert.match(approvalRoute, /action:\s*"approve"/);
  assert.match(queuedWorkflow, /id-token:\s*write/);
  assert.match(queuedWorkflow, /publish-approved-review-queue\.mjs/);
  assert.match(queuedPublisher, /action:\s*dryRun\s*\?\s*"peek"\s*:\s*"claim"/);
  assert.match(queuedPublisher, /createReviewBufferPublisher/);
  assert.match(queuedPublisher, /DISCLOSURE/);
  assert.match(queuedPublisher, /blindboxai-review-publisher/);
});

test("review publisher sends required YouTube metadata while keeping TikTok metadata null", async () => {
  const createRequests = [];
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
        { id: "channel-youtube", name: "YouTube", displayName: "YouTube", service: "youtube", isQueuePaused: false, isDisconnected: false, isLocked: false },
        { id: "channel-tiktok", name: "TikTok", displayName: "TikTok", service: "tiktok", isQueuePaused: false, isDisconnected: false, isLocked: false },
      ] } });
    }
    if (query.includes("query Existing")) {
      return jsonResponse({ data: { posts: { edges: [], pageInfo: { hasNextPage: false, endCursor: null } } } });
    }
    if (query.includes("mutation CreateReviewVideo")) {
      createRequests.push(body);
      return jsonResponse({ data: { createPost: { post: { id: `post-${createRequests.length}`, text: body.variables.text, status: "scheduled", channelId: body.variables.channelId } } } });
    }
    throw new Error("unexpected Buffer query");
  };

  const publisher = createReviewBufferPublisher({ token: "test-token", organizationId: "org-1", fetchImpl });
  const caption = `Collector research\nhttps://blindboxai.com/series/test\n${DISCLOSURE}`;
  await publisher({ channel: "youtube", videoUrl, caption, title: "YouTube <Title>" });
  await publisher({ channel: "tiktok", videoUrl, caption, title: "ignored" });

  assert.equal(mediaChecks, 2);
  assert.deepEqual(createRequests[0].variables.metadata, {
    youtube: { title: "YouTube Title", categoryId: "17" },
  });
  assert.equal(createRequests[1].variables.metadata, null);
  assert.match(createRequests[0].query, /mode:\s*shareNow/);
  assert.doesNotMatch(createRequests[0].query, /mode:\s*addToQueue/);
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
