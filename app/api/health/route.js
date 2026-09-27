import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const value = process.env.VERCEL_GIT_COMMIT_SHA || "";
  return NextResponse.json(
    { status: "ok", app: "blindboxai", revision: /^[0-9a-f]{40}$/.test(value) ? value : null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
