import { NextResponse } from "next/server";
import { approveStagedReview } from "../../../../lib/owner-review-staging.mjs";

export const runtime = "nodejs";

function authorized(request) {
  const expected = process.env.OWNER_DASHBOARD_CODE;
  const supplied = request.headers.get("authorization") || "";
  return Boolean(expected && supplied === `Bearer ${expected}`);
}

export async function POST(request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const body = await request.json();
    if (!body?.videoUrl) return NextResponse.json({ error: "videoUrl is required." }, { status: 400 });
    const result = await approveStagedReview({ videoUrl: body.videoUrl, title: body.title });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to approve review video." }, { status: 400 });
  }
}
