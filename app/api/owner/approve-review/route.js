import { NextResponse } from "next/server";

import { assertOwnerCode } from "../../../../lib/evidence";
import { dispatchApprovedReviewPublication } from "../../../../lib/owner-review-launch.mjs";

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

  try {
    const response = await fetch(REVIEW_QUEUE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ownerCode}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "approve", videoUrl: body?.videoUrl }),
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
