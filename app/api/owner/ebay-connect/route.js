import crypto from "crypto";
import { NextResponse } from "next/server";

import { assertUploadCode } from "../../../../lib/evidence";
import {
  createEbayAuthorizeUrl,
  disconnectEbayOwner,
  ebayOwnerConnectionStatus,
  ownerEbayConfigured,
} from "../../../../lib/owner-ebay-oauth.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ownerToken(request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  assertUploadCode(token);
}

export async function GET(request) {
  try { ownerToken(request); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  if (!ownerEbayConfigured()) return NextResponse.json({ configured: false, connected: false });
  try {
    const status = await ebayOwnerConnectionStatus();
    return NextResponse.json({ configured: true, ...status }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ configured: true, connected: false, error: "Status unavailable" }, { status: 503 });
  }
}

export async function POST(request) {
  try { ownerToken(request); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  if (!ownerEbayConfigured()) return NextResponse.json({ error: "eBay owner OAuth is not configured" }, { status: 503 });

  const state = crypto.randomBytes(32).toString("base64url");
  const response = NextResponse.json({ authorizeUrl: createEbayAuthorizeUrl(state) });
  response.cookies.set("bb_ebay_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}

export async function DELETE(request) {
  try { ownerToken(request); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  try {
    await disconnectEbayOwner();
    return NextResponse.json({ connected: false });
  } catch {
    return NextResponse.json({ error: "Unable to disconnect eBay" }, { status: 503 });
  }
}
