import { NextResponse } from "next/server";

import { assertOwnerCode, assertUploadCode } from "../../../../lib/evidence";
import { resolvePublicVideoTitle } from "../../../../lib/public-video-title.mjs";
import { assertYoutubeShortsMetadata } from "../../../../lib/review-shorts-eligibility.mjs";
import { isCanonicalReviewUploadPath, canonicalReviewUploadUrl } from "../../../../lib/review-upload-identity.mjs";
import { reviewUploadVerificationResponse } from "../../../../lib/review-upload-verification.mjs";
import { BLINDBOXAI_SUPABASE_ORIGIN } from "../../../../lib/blindbox-supabase-boundary.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization",
};

const REVIEW_QUEUE_URL = `${BLINDBOXAI_SUPABASE_ORIGIN}/functions/v1/review-video-queue`;
const REVIEW_MEDIA_BASE = `${BLINDBOXAI_SUPABASE_ORIGIN}/storage/v1/object/public/blindboxai-review-videos/`;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE_HEADERS });
}

function assertStagingCode(value) {
  try {
    assertOwnerCode(value);
  } catch {
    assertUploadCode(value);
  }
}

export async function POST(request) {
  const auth = request.headers.get("authorization") || "";
  const ownerCode = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  try {
    assertStagingCode(ownerCode);
  } catch {
    return unauthorized();
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400, headers: PRIVATE_HEADERS });
  }

  let publicTitle;
  try {
    publicTitle = resolvePublicVideoTitle(body?.title, { maxLength: 100 });
    if (![body?.durationSeconds, body?.width, body?.height].every((value) => typeof value === "number" && Number.isFinite(value))) {
      throw new Error("YouTube Short needs numeric measured duration and video dimensions");
    }
    assertYoutubeShortsMetadata(body);
  } catch (cause) {
    return NextResponse.json({ error: cause.message }, { status: 400, headers: PRIVATE_HEADERS });
  }

  // Independently prove stored bytes before staging fingerprinted mobile uploads.
  // Legacy non-mobile render and verification callers keep their existing path.
  const videoUrl = typeof body?.videoUrl === "string" ? body.videoUrl : "";
  const path = videoUrl.startsWith(REVIEW_MEDIA_BASE) ? videoUrl.slice(REVIEW_MEDIA_BASE.length) : "";
  const fingerprinted = body?.uploadKind === "fingerprinted_mobile" || path.startsWith("media/review/sha256-");
  if (body?.uploadKind !== undefined && body.uploadKind !== "fingerprinted_mobile") {
    return NextResponse.json({ error: "Invalid review upload kind." }, { status: 400, headers: PRIVATE_HEADERS });
  }
  if (fingerprinted) {
    if (!isCanonicalReviewUploadPath(path) || videoUrl !== canonicalReviewUploadUrl(path)) {
      return NextResponse.json({ error: "Invalid fingerprinted video URL." }, { status: 400, headers: PRIVATE_HEADERS });
    }
    const proof = await reviewUploadVerificationResponse({ path, sizeBytes: body.sizeBytes });
    if (proof.status !== 200) return NextResponse.json(proof.body, { status: proof.status, headers: PRIVATE_HEADERS });
    if (proof.body?.verified !== true || proof.body.path !== path || proof.body.publicUrl !== videoUrl) {
      return NextResponse.json({ error: "Uploaded video is not verified. Retry staging after storage is available." }, { status: 409, headers: PRIVATE_HEADERS });
    }
  }

  try {
    const response = await fetch(REVIEW_QUEUE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ownerCode}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "stage",
        videoUrl: body?.videoUrl,
        title: publicTitle,
        sizeBytes: body?.sizeBytes,
        durationSeconds: body?.durationSeconds,
        width: body?.width,
        height: body?.height,
      }),
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json({ error: result?.error || "Unable to stage video for review." }, { status: response.status, headers: PRIVATE_HEADERS });
    }
    return NextResponse.json(result, { headers: PRIVATE_HEADERS });
  } catch (error) {
    console.error("owner_review_staging_failed", { message: error instanceof Error ? error.message : "Unknown review staging error" });
    return NextResponse.json({ error: "Unable to stage video for review." }, { status: 502, headers: PRIVATE_HEADERS });
  }
}
