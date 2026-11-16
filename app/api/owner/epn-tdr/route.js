import { NextResponse } from "next/server";
import { assertOwnerCode } from "../../../../lib/evidence";
import { inspectEpnTdr } from "../../../../lib/epn-tdr-api.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization",
};

function reply(body, status) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

// Owner-only live view: never writes reports, conversion evidence, EPN clicks
// or user data. Secrets remain entirely server-side.
export async function GET(request) {
  const authorization = request.headers.get("authorization") || "";
  const ownerCode = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  try { assertOwnerCode(ownerCode); }
  catch { return reply({ error: "Unauthorized" }, 401); }

  if (process.env.EPN_REPORTING_CURRENCY !== "USD" ||
      !process.env.EPN_ACCOUNT_SID || !process.env.EPN_REPORTING_ACCESS_TOKEN) {
    return reply({ error: "EPN reporting access or USD currency has not been verified" }, 503);
  }
  try {
    const report = await inspectEpnTdr({
      accountSid: process.env.EPN_ACCOUNT_SID,
      authToken: process.env.EPN_REPORTING_ACCESS_TOKEN,
    });
    return reply(report, 200);
  } catch {
    return reply({ error: "EPN transaction report could not be independently verified" }, 502);
  }
}
