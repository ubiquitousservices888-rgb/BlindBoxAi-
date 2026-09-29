import { NextResponse } from "next/server";

import { assertOwnerCode, assertUploadCode } from "../../../../lib/evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization, X-Storage-Action",
};

function assertStagingCode(value) {
  try {
    assertOwnerCode(value);
  } catch {
    assertUploadCode(value);
  }
}

export async function POST(request) {
  const auth = request.headers.get("authorization") || "";
  const ownerCode = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const action = (request.headers.get("x-storage-action") || "ticket").trim().toLowerCase();

  if (!["ticket", "delete"].includes(action)) {
    return NextResponse.json({ ok: false }, { status: 400, headers: PRIVATE_HEADERS });
  }

  try {
    if (action === "delete") {
      assertOwnerCode(ownerCode);
    } else {
      assertStagingCode(ownerCode);
    }
  } catch {
    return NextResponse.json({ ok: false }, { status: 401, headers: PRIVATE_HEADERS });
  }

  return NextResponse.json({ ok: true }, { status: 200, headers: PRIVATE_HEADERS });
}
