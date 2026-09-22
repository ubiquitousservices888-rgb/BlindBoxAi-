import { NextResponse } from "next/server";

// Persist first-party BlindBoxAI campaign attribution across page navigation.
// Fail-open: any error passes the request through unchanged.
const CAMPAIGN_RE = /^bb-[a-z0-9][a-z0-9_-]{0,76}$/i;
const SOURCE_RE = /^[a-z0-9_-]{1,40}$/i;
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function clean(value, pattern) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  return pattern.test(normalized) ? normalized : "";
}

function isOutbound(pathname) {
  return pathname.startsWith("/api/out/");
}

export function proxy(request) {
  try {
    const url = request.nextUrl;
    const queryCampaign = clean(url.searchParams.get("campaign"), CAMPAIGN_RE);
    const querySource = clean(url.searchParams.get("source"), SOURCE_RE) || "unknown";

    // Existing outbound handlers already understand campaign/source query params.
    // If the visitor navigated away from the landing URL, restore those params
    // from the HttpOnly cookie with an internal rewrite. This keeps handler and
    // EPN customid logic unchanged and also works on Vercel preview hosts.
    if (isOutbound(url.pathname)) {
      if (queryCampaign) return NextResponse.next();

      const cookieCampaign = clean(request.cookies.get("bb_cmp")?.value, CAMPAIGN_RE);
      if (!cookieCampaign) return NextResponse.next();

      const cookieSource = clean(request.cookies.get("bb_src")?.value, SOURCE_RE) || "unknown";
      const rewriteUrl = request.nextUrl.clone();
      rewriteUrl.searchParams.set("campaign", cookieCampaign);
      rewriteUrl.searchParams.set("source", cookieSource);
      return NextResponse.rewrite(rewriteUrl);
    }

    // Last-touch attribution: only public page requests with a valid bb-* campaign
    // can refresh the cookie. API/static requests never create attribution state.
    if (queryCampaign && !url.pathname.startsWith("/api/")) {
      const response = NextResponse.next();
      const options = {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: MAX_AGE_SECONDS,
      };
      response.cookies.set("bb_cmp", queryCampaign, options);
      response.cookies.set("bb_src", querySource, options);
      return response;
    }
  } catch {
    // Attribution must never break navigation or affiliate redirects.
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|mp4|css|map|txt|xml)$).*)",
  ],
};
