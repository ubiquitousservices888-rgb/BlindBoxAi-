import { NextResponse } from "next/server";

import { assertOwnerCode } from "../../../../lib/evidence";
import {
  ownerEbayConfigured,
  verifyEbaySellerReads,
} from "../../../../lib/owner-ebay-oauth.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ownerToken(request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  assertOwnerCode(token);
}

export async function GET(request) {
  try {
    ownerToken(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!ownerEbayConfigured()) {
    return NextResponse.json(
      { error: "eBay owner OAuth is not configured" },
      { status: 503 },
    );
  }

  try {
    const result = await verifyEbaySellerReads();
    return NextResponse.json(result, {
      status: result.verified ? 200 : 502,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to verify read-only eBay seller data access" },
      { status: 502, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
