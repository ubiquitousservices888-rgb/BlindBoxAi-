import { NextResponse } from "next/server";

import { exchangeEbayCode, saveEbayRefreshToken } from "../../../../lib/owner-ebay-oauth.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const url = new URL(request.url);
  const code = String(url.searchParams.get("code") || "");
  const state = String(url.searchParams.get("state") || "");
  const expected = request.cookies.get("bb_ebay_oauth_state")?.value || "";
  const target = new URL("/owner-dashboard/ebay", request.url);

  if (!code || !state || !expected || state !== expected) {
    target.searchParams.set("ebay", "error");
    target.searchParams.set("reason", "state");
    return NextResponse.redirect(target);
  }

  try {
    const token = await exchangeEbayCode(code);
    await saveEbayRefreshToken(token.refreshToken, token.scopes);
    target.searchParams.set("ebay", "connected");
    const response = NextResponse.redirect(target);
    response.cookies.set("bb_ebay_oauth_state", "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    console.error("owner_ebay_oauth_callback_failed", { message: error instanceof Error ? error.message : "Unknown error" });
    target.searchParams.set("ebay", "error");
    target.searchParams.set("reason", "exchange");
    return NextResponse.redirect(target);
  }
}
