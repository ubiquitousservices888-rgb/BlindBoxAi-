import {
  HAIR_SALON_REVIEW_FILENAME,
  loadVerifiedReviewMedia,
  verifiedReviewMediaHeaders,
} from "../../../../../lib/verified-review-media.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function serveVerifiedMedia(context, headOnly) {
  const { filename } = await context.params;
  if (filename !== HAIR_SALON_REVIEW_FILENAME) {
    return new Response("Not found.", {
      status: 404,
      headers: { "cache-control": "no-store" },
    });
  }

  try {
    const bytes = await loadVerifiedReviewMedia();
    return new Response(headOnly ? null : bytes, {
      status: 200,
      headers: verifiedReviewMediaHeaders(bytes.byteLength),
    });
  } catch {
    return new Response("Verified media unavailable.", {
      status: 502,
      headers: { "cache-control": "no-store" },
    });
  }
}

export async function GET(_request, context) {
  return serveVerifiedMedia(context, false);
}

export async function HEAD(_request, context) {
  return serveVerifiedMedia(context, true);
}
