import { NextResponse } from "next/server";
import { buildPublicAiFamilyFeed } from "../../../lib/ai-family-public.mjs";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(buildPublicAiFamilyFeed(), {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
