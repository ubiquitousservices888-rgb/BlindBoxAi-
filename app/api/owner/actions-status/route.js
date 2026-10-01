import { NextResponse } from "next/server";

import { assertOwnerCode } from "../../../../lib/evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPOSITORY = "ubiquitousservices888-rgb/BlindBoxAi-";
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization",
};

const CONTROL_WORKFLOWS = Object.freeze([
  "BlindBoxAI release gate",
  "Build BlindBoxAI Live Wallpaper",
  "Owner Blue live verify once",
  "Bounded unattended operations",
  "Autonomous affiliate loop",
  "Daily BlindBox pipeline validation (publishing paused)",
  "Labubu content validation (automation paused)",
  "Narrative flywheel candidate (review only)",
  "Partnership flywheel candidate (review only)",
]);

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE_HEADERS });
}

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "BlindBoxAI-owner-control/1.0",
  };
}

export async function GET(request) {
  const auth = request.headers.get("authorization") || "";
  const ownerCode = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  try {
    assertOwnerCode(ownerCode);
  } catch {
    return unauthorized();
  }

  const token = String(process.env.GITHUB_OWNER_APPROVAL_TOKEN || "").trim();
  if (!token) {
    return NextResponse.json(
      { error: "GitHub owner-control token is not configured.", configured: false },
      { status: 503, headers: PRIVATE_HEADERS },
    );
  }

  try {
    const url = new URL(`https://api.github.com/repos/${REPOSITORY}/actions/runs`);
    url.searchParams.set("branch", "main");
    url.searchParams.set("per_page", "100");
    const response = await fetch(url, { headers: githubHeaders(token), cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: "Unable to read GitHub Actions status.", status: response.status },
        { status: 502, headers: PRIVATE_HEADERS },
      );
    }

    const runs = Array.isArray(data.workflow_runs) ? data.workflow_runs : [];
    const items = CONTROL_WORKFLOWS.map((name) => {
      const run = runs.find((item) => item?.name === name) || null;
      return {
        name,
        status: run?.status || "not_run",
        conclusion: run?.conclusion || null,
        runId: run?.id || null,
        url: run?.html_url || null,
        event: run?.event || null,
        headSha: run?.head_sha || null,
        createdAt: run?.created_at || null,
        updatedAt: run?.updated_at || null,
      };
    });

    const summary = {
      total: items.length,
      active: items.filter((item) => item.status === "queued" || item.status === "in_progress" || item.status === "pending").length,
      success: items.filter((item) => item.status === "completed" && item.conclusion === "success").length,
      failed: items.filter((item) => item.status === "completed" && item.conclusion && !["success", "skipped"].includes(item.conclusion)).length,
      skipped: items.filter((item) => item.status === "completed" && item.conclusion === "skipped").length,
      notRun: items.filter((item) => item.status === "not_run").length,
    };

    return NextResponse.json(
      {
        ok: true,
        configured: true,
        repository: REPOSITORY,
        revision: process.env.VERCEL_GIT_COMMIT_SHA || null,
        items,
        summary,
      },
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    console.error("owner_actions_status_failed", { message: error instanceof Error ? error.message : "Unknown GitHub status error" });
    return NextResponse.json({ error: "Unable to read GitHub Actions status." }, { status: 502, headers: PRIVATE_HEADERS });
  }
}
