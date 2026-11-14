import { NextResponse } from "next/server";

import { assertOwnerCode } from "../../../../lib/evidence";
import { reviewCaptionPreview } from "../../../../lib/review-caption.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization",
};

const REVIEW_QUEUE_URL = "https://lazzdoadoqzrzlarerfx.supabase.co/functions/v1/review-video-queue";

// Owner preview of the exact per-channel caption (tracked BlindBoxAI link +
// affiliate disclosure) the publisher will post, built by the same function.
function withCaptionPreview(item) {
  if (!item || !["ready_for_review", "approved"].includes(item.status)) return item;
  return { ...item, caption_preview: reviewCaptionPreview(item) };
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE_HEADERS });
}

function ownerCodeFrom(request) {
  const auth = request.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

function authorizedOwnerCode(request) {
  const ownerCode = ownerCodeFrom(request);
  try {
    assertOwnerCode(ownerCode);
    return ownerCode;
  } catch {
    return "";
  }
}

async function callReviewQueue(ownerCode, payload) {
  const response = await fetch(REVIEW_QUEUE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ownerCode}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  return { response, result };
}

export async function GET(request) {
  const ownerCode = authorizedOwnerCode(request);
  if (!ownerCode) return unauthorized();

  try {
    // Ready rows only by default (owner live-verify needs an empty baseline);
    // the dashboard asks for approved-but-unpublished rows explicitly.
    const includeApproved = new URL(request.url).searchParams.get("include") === "approved";
    const { response, result } = await callReviewQueue(ownerCode, { action: "list", ...(includeApproved ? { includeApproved: true } : {}) });
    if (!response.ok) {
      return NextResponse.json(
        { error: result?.error || "Unable to load review queue." },
        { status: response.status, headers: PRIVATE_HEADERS },
      );
    }
    return NextResponse.json(
      { items: Array.isArray(result?.items) ? result.items.map(withCaptionPreview) : [] },
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

export async function DELETE(request) {
  const ownerCode = authorizedOwnerCode(request);
  if (!ownerCode) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: PRIVATE_HEADERS });
  }

  const researchRunId = String(body?.researchRunId || "");
  if (!/^rv-[a-f0-9]{16}$/.test(researchRunId)) {
    return NextResponse.json({ error: "Invalid review video." }, { status: 400, headers: PRIVATE_HEADERS });
  }

  try {
    const { response, result } = await callReviewQueue(ownerCode, { action: "delete", researchRunId });
    if (!response.ok) {
      return NextResponse.json(
        { error: result?.error || "Unable to delete review video." },
        { status: response.status, headers: PRIVATE_HEADERS },
      );
    }
    return NextResponse.json(
      { deleted: result?.deleted === true, item: result?.item || null },
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    console.error("owner_review_delete_failed", {
      message: error instanceof Error ? error.message : "Unknown review delete error",
    });
    return NextResponse.json(
      { error: "Unable to delete review video." },
      { status: 502, headers: PRIVATE_HEADERS },
    );
  }
}
