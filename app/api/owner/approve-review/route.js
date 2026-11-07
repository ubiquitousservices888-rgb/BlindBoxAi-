import { NextResponse } from "next/server";

import { assertOwnerCode } from "../../../../lib/evidence";
import { dispatchApprovedReviewPublication } from "../../../../lib/owner-review-launch.mjs";
import { reviewCaptionPreview } from "../../../../lib/review-caption.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization",
};

const REVIEW_QUEUE_URL = "https://lazzdoadoqzrzlarerfx.supabase.co/functions/v1/review-video-queue";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE_HEADERS });
}

export async function POST(request) {
  const auth = request.headers.get("authorization") || "";
  const ownerCode = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  try {
    assertOwnerCode(ownerCode);
  } catch {
    return unauthorized();
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400, headers: PRIVATE_HEADERS });
  }

  const youtubeAudience = String(body?.youtubeAudience ?? "").trim();
  const researchRunId = String(body?.researchRunId ?? "").trim();
  if (!["made_for_kids", "not_made_for_kids"].includes(youtubeAudience)) {
    return NextResponse.json({ error: "Choose the YouTube audience before approval." }, { status: 400, headers: PRIVATE_HEADERS });
  }
  if (!/^rv-[a-f0-9]{16}$/.test(researchRunId)) {
    return NextResponse.json({ error: "This review item is missing its exact research run ID." }, { status: 400, headers: PRIVATE_HEADERS });
  }

  const videoUrl = String(body?.videoUrl ?? "").trim();
  const reviewedTitle = typeof body?.reviewedTitle === "string" ? body.reviewedTitle : "";
  if (!reviewedTitle) {
    return NextResponse.json({ error: "This approval is missing the title you reviewed. Refresh and review it again." }, { status: 400, headers: PRIVATE_HEADERS });
  }

  // Server-side gate: re-read the exact row and rebuild its caption here, so
  // approval cannot rely on the browser's copy of the preview.
  let row;
  try {
    const listResponse = await fetch(REVIEW_QUEUE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${ownerCode}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list", includeApproved: true }),
      cache: "no-store",
    });
    const listed = await listResponse.json().catch(() => ({}));
    if (!listResponse.ok) {
      return NextResponse.json({ error: listed?.error || "Unable to check this review video." }, { status: listResponse.status, headers: PRIVATE_HEADERS });
    }
    row = (Array.isArray(listed?.items) ? listed.items : [])
      .find((item) => item?.research_run_id === researchRunId && item?.video_url === videoUrl);
  } catch (lookupError) {
    console.error("owner_review_gate_lookup_failed", { message: lookupError instanceof Error ? lookupError.message : "Unknown lookup error" });
    return NextResponse.json({ error: "Unable to check this review video." }, { status: 502, headers: PRIVATE_HEADERS });
  }
  if (!row) {
    return NextResponse.json({ error: "This video is no longer waiting for approval or publishing. Refresh the dashboard." }, { status: 409, headers: PRIVATE_HEADERS });
  }
  if (reviewedTitle !== String(row.title ?? "")) {
    return NextResponse.json({ error: "This video changed after you reviewed it. Refresh and review it again." }, { status: 409, headers: PRIVATE_HEADERS });
  }
  const preview = reviewCaptionPreview(row);
  const blocked = preview.find((entry) => entry?.ok !== true);
  if (!preview.length || blocked) {
    return NextResponse.json(
      { error: blocked?.error || "This caption could not be built safely, so this video cannot publish until it is fixed.", launch: { status: "blocked_caption" } },
      { status: 422, headers: PRIVATE_HEADERS },
    );
  }

  try {
    const response = await fetch(REVIEW_QUEUE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ownerCode}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "approve", videoUrl }),
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json({ error: result?.error || "Unable to approve this review video." }, { status: response.status, headers: PRIVATE_HEADERS });
    }
    if (String(result?.research_run_id ?? "") !== researchRunId) {
      return NextResponse.json(
        { error: "Approval response did not match the exact reviewed video.", launch: { status: "blocked_identity_mismatch" } },
        { status: 409, headers: PRIVATE_HEADERS },
      );
    }

    const githubToken = String(process.env.GITHUB_OWNER_APPROVAL_TOKEN ?? "").trim();
    if (!githubToken) {
      return NextResponse.json(
        {
          ...result,
          error: "Video approved, but automatic publishing is not configured.",
          launch: { status: "blocked_configuration", required: "GITHUB_OWNER_APPROVAL_TOKEN" },
        },
        { status: 503, headers: PRIVATE_HEADERS },
      );
    }

    try {
      const launch = await dispatchApprovedReviewPublication({
        token: githubToken,
        researchRunId,
        youtubeAudience,
      });
      return NextResponse.json({ ...result, launch }, { headers: PRIVATE_HEADERS });
    } catch (launchError) {
      console.error("owner_review_launch_dispatch_failed", {
        message: launchError instanceof Error ? launchError.message : "Unknown launch dispatch error",
        status: Number.isInteger(launchError?.status) ? launchError.status : undefined,
      });
      return NextResponse.json(
        {
          ...result,
          error: "Video approved, but automatic publishing dispatch failed. Press Blue again to retry safely.",
          launch: { status: "dispatch_failed" },
        },
        { status: 502, headers: PRIVATE_HEADERS },
      );
    }
  } catch (error) {
    console.error("owner_video_approval_failed", { message: error instanceof Error ? error.message : "Unknown approval error" });
    return NextResponse.json({ error: "Unable to approve this review video." }, { status: 502, headers: PRIVATE_HEADERS });
  }
}
