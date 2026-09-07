import { NextResponse } from "next/server";

import { assertUploadCode } from "../../../../lib/evidence";
import { approveLaunchReadyVideo } from "../../../../lib/owner-batch-approval.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization",
};

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

  const githubToken = String(process.env.GITHUB_OWNER_APPROVAL_TOKEN ?? "").trim();
  if (!githubToken) {
    return NextResponse.json({ error: "Video approval is not configured yet." }, { status: 503, headers: PRIVATE_HEADERS });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400, headers: PRIVATE_HEADERS });
  }

  try {
    const result = await approveLaunchReadyVideo({ token: githubToken, videoUrl: body?.videoUrl });
    return NextResponse.json(result, { headers: PRIVATE_HEADERS });
  } catch (error) {
    console.error("owner_video_approval_failed", {
      message: error instanceof Error ? error.message : "Unknown approval error",
      status: Number.isInteger(error?.status) ? error.status : undefined,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to approve this review video." },
      { status: Number.isInteger(error?.status) ? error.status : 502, headers: PRIVATE_HEADERS },
    );
  }
}
