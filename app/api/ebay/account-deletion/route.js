import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_ENDPOINT = "https://blindboxai.com/api/ebay/account-deletion";

function endpointUrl() {
  return process.env.EBAY_ACCOUNT_DELETION_ENDPOINT || DEFAULT_ENDPOINT;
}

function verificationToken() {
  return process.env.EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN || "";
}

export async function GET(request) {
  const url = new URL(request.url);
  const challengeCode = url.searchParams.get("challenge_code") || "";
  const token = verificationToken();

  if (!challengeCode) {
    return NextResponse.json({ error: "Missing challenge_code" }, { status: 400 });
  }

  if (!token) {
    return NextResponse.json(
      { error: "eBay verification token is not configured" },
      { status: 500 },
    );
  }

  const challengeResponse = createHash("sha256")
    .update(challengeCode)
    .update(token)
    .update(endpointUrl())
    .digest("hex");

  return NextResponse.json(
    { challengeResponse },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function POST() {
  // BlindBoxAI does not persist eBay marketplace-user personal data in this
  // webhook. Acknowledge deletion notifications without storing the payload.
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
