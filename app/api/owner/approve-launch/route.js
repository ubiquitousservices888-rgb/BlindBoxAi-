import { NextResponse } from "next/server";

import { assertUploadCode } from "../../../../lib/evidence";
import { approveAllLaunchReadyVideos } from "../../../../lib/owner-batch-approval.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization",
};

function unauthorized() {
  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401, headers: PRIVATE_HEADERS },
  );
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
    return NextResponse.json(
      {
        error: "One-click launch is not configured yet.",
        required: "GITHUB_OWNER_APPROVAL_TOKEN",
      },
      { status: 503, headers: PRIVATE_HEADERS },
    );
  }

  try {
    const result = await approveAllLaunchReadyVideos({ token: githubToken });
    return NextResponse.json(result, { headers: PRIVATE_HEADERS });
  } catch (error) {
    console.error("owner_batch_approval_failed", {
      message: error instanceof Error ? error.message : "Unknown approval error",
      status: Number.isInteger(error?.status) ? error.status : undefined,
    });
    return NextResponse.json(
      { error: "Unable to approve launch-ready jobs." },
      { status: 502, headers: PRIVATE_HEADERS },
    );
  }
}
