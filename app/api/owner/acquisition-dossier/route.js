import { NextResponse } from "next/server";
import { assertOwnerCode } from "../../../../lib/evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const URL = "https://lazzdoadoqzrzlarerfx.supabase.co/functions/v1/acquisition-dossier";
const HEADERS = { "Cache-Control": "private, no-store, max-age=0", Vary: "Authorization" };

export async function GET(request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  try { assertOwnerCode(token); } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: HEADERS });
  }
  const response = await fetch(URL, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "latest" }),
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return NextResponse.json({ error: body?.error || "Dossier unavailable" }, { status: response.status, headers: HEADERS });
  const format = new URL(request.url).searchParams.get("format");
  if (format === "markdown") {
    return new Response(body.dossier.markdown, {
      status: 200,
      headers: { ...HEADERS, "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": 'attachment; filename="blindboxai-acquisition-dossier.md"' },
    });
  }
  return NextResponse.json(body.dossier, { headers: HEADERS });
}
