import { NextResponse } from "next/server";

import { assertOwnerCode } from "../../../../lib/evidence";

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

export async function GET(request) {
  const auth = request.headers.get("authorization") || "";
  const ownerCode = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  try {
    assertOwnerCode(ownerCode);
  } catch {
    return unauthorized();
  }

  try {
    const response = await fetch(REVIEW_QUEUE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ownerCode}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "list" }),
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: result?.error || "Unable to load review queue." },
        { status: response.status, headers: PRIVATE_HEADERS },
      );
    }
    return NextResponse.json(
      { items: Array.isArray(result?.items) ? result.items : [] },
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    console.error("owner_review_queue_failed", {
      message: error instanceof Error ? error.message : "Unknown review queue error",
    });
    return NextResponse.json(
      { error: "Unable to load review queue." },
      { status: 502, headers: PRIVATE_HEADERS },
    );
  }
}
