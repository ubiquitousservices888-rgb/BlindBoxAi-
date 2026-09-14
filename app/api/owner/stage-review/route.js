import { NextResponse } from "next/server";

import { assertUploadCode } from "../../../../lib/evidence";

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
    assertUploadCode(ownerCode);
  } catch {
    return unauthorized();
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400, headers: PRIVATE_HEADERS });
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
        title: body?.title,
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
