import { NextResponse } from "next/server";

import { assertOwnerCode } from "../../../../lib/evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPOSITORY = "ubiquitousservices888-rgb/BlindBoxAi-";
const WORKFLOW = "owner-blue-live-verify-once.yml";
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization",
};

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE_HEADERS });
}

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
    "User-Agent": "BlindBoxAI-owner-control/1.0",
  };
}

export async function POST(request) {
  const auth = request.headers.get("authorization") || "";
  const ownerCode = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  try {
    assertOwnerCode(ownerCode);
  } catch {
    return unauthorized();
  }

  if (process.env.VERCEL_ENV !== "production" || process.env.VERCEL_GIT_COMMIT_REF !== "main") {
    return NextResponse.json(
      { error: "Blue Live Verify may only be dispatched from production main." },
      { status: 409, headers: PRIVATE_HEADERS },
    );
  }

  const token = String(process.env.GITHUB_OWNER_APPROVAL_TOKEN || "").trim();
  if (!token) {
    return NextResponse.json(
      { error: "GitHub owner-control token is not configured." },
      { status: 503, headers: PRIVATE_HEADERS },
    );
  }

  try {
    const runsUrl = `https://api.github.com/repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/runs?branch=main&per_page=5`;
    const runsResponse = await fetch(runsUrl, { headers: githubHeaders(token), cache: "no-store" });
    const runsData = await runsResponse.json().catch(() => ({}));
    if (!runsResponse.ok) throw new Error(`runs_lookup_${runsResponse.status}`);

    const active = (Array.isArray(runsData.workflow_runs) ? runsData.workflow_runs : [])
      .find((run) => run?.status === "queued" || run?.status === "in_progress" || run?.status === "pending");
    if (active) {
      return NextResponse.json(
        { error: "Blue Live Verify is already running.", runId: active.id, url: active.html_url || null },
        { status: 409, headers: PRIVATE_HEADERS },
      );
    }

    const dispatchUrl = `https://api.github.com/repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/dispatches`;
    const response = await fetch(dispatchUrl, {
      method: "POST",
      headers: githubHeaders(token),
      body: JSON.stringify({ ref: "main" }),
      cache: "no-store",
    });

    if (response.status !== 204) {
      const body = await response.text().catch(() => "");
      console.error("owner_blue_dispatch_failed", { status: response.status, bodyLength: body.length });
      return NextResponse.json(
        { error: "GitHub rejected the Blue Live Verify dispatch.", status: response.status },
        { status: 502, headers: PRIVATE_HEADERS },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        dispatched: true,
        workflow: WORKFLOW,
        repository: REPOSITORY,
        message: "BLUE LIVE VERIFY DISPATCHED",
        published: false,
      },
      { status: 202, headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    console.error("owner_blue_dispatch_failed", { message: error instanceof Error ? error.message : "Unknown dispatch error" });
    return NextResponse.json({ error: "Unable to dispatch Blue Live Verify." }, { status: 502, headers: PRIVATE_HEADERS });
  }
}
