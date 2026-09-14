import { NextResponse } from "next/server";

import { assertUploadCode } from "../../../../lib/evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BROKER_URL = "https://lazzdoadoqzrzlarerfx.supabase.co/functions/v1/blindbox-video-upload";
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

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400, headers: PRIVATE_HEADERS });
  }

  const path = typeof body?.path === "string" ? body.path : "";
  const sizeBytes = Number(body?.sizeBytes || 0);
  if (!/^media\/review\/[a-zA-Z0-9._-]+\.mp4$/i.test(path)) {
    return NextResponse.json({ error: "Invalid video path." }, { status: 400, headers: PRIVATE_HEADERS });
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > 100 * 1024 * 1024) {
    return NextResponse.json({ error: "Invalid video size." }, { status: 400, headers: PRIVATE_HEADERS });
  }

  try {
    const response = await fetch(BROKER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ownerCode}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path, sizeBytes }),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.signedUrl || !data?.publicUrl) {
      return NextResponse.json(
        { error: data?.error || "Unable to authorize video storage." },
        { status: response.status || 502, headers: PRIVATE_HEADERS },
      );
    }

    return NextResponse.json(
      { signedUrl: data.signedUrl, publicUrl: data.publicUrl, path: data.path },
      { status: 200, headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    console.error("free_upload_ticket_failed", {
      message: error instanceof Error ? error.message : "Unknown storage broker error",
    });
    return NextResponse.json(
      { error: "Video storage broker unavailable." },
      { status: 502, headers: PRIVATE_HEADERS },
    );
  }
}
