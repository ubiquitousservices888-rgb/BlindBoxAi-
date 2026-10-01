import { NextResponse } from "next/server";

import { assertOwnerCode } from "../../../../lib/evidence";
import {
  githubOwnerHeaders,
  OWNER_OWNER_PRIVATE_HEADERS,
  OWNER_OWNER_REPOSITORY,
  ownerUnauthorized,
} from "../../../../lib/github-owner.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
const ACTIVE_STATUSES = new Set(["queued", "pending", "in_progress", "waiting", "requested"]);

async function latestControlRuns(token) {
  const wanted = new Set(CONTROL_WORKFLOWS);
  const latest = new Map();

  for (let page = 1; page <= 20 && wanted.size; page += 1) {
    const url = new URL(`https://api.github.com/repos/${OWNER_REPOSITORY}/actions/runs`);
    url.searchParams.set("branch", "main");
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));

    const response = await fetch(url, { headers: githubOwnerHeaders(token), cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`actions_runs_${response.status}`);

    const runs = Array.isArray(data.workflow_runs) ? data.workflow_runs : [];
    for (const run of runs) {
      if (!wanted.has(run?.name)) continue;
      if (run.name === "Owner Blue live verify once" && run.event !== "workflow_dispatch") continue;
      latest.set(run.name, run);
      wanted.delete(run.name);
    }
    if (runs.length < 100) break;
  }

  return latest;
}

export async function GET(request) {
  const auth = request.headers.get("authorization") || "";
  const ownerCode = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  try {
    assertOwnerCode(ownerCode);
  } catch {
    return ownerUnauthorized();
  }

  const token = String(process.env.GITHUB_OWNER_APPROVAL_TOKEN || "").trim();
  if (!token) {
    return NextResponse.json(
      { error: "GitHub owner-control token is not configured.", configured: false },
      { status: 503, headers: OWNER_PRIVATE_HEADERS },
    );
  }

  try {
    const latest = await latestControlRuns(token);
    const items = CONTROL_WORKFLOWS.map((name) => {
      const run = latest.get(name) || null;
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
      active: items.filter((item) => ACTIVE_STATUSES.has(item.status)).length,
      success: items.filter((item) => item.status === "completed" && item.conclusion === "success").length,
      failed: items.filter((item) => item.status === "completed" && item.conclusion && !["success", "skipped"].includes(item.conclusion)).length,
      skipped: items.filter((item) => item.status === "completed" && item.conclusion === "skipped").length,
      notRun: items.filter((item) => item.status === "not_run").length,
    };

    return NextResponse.json(
      {
        ok: true,
        configured: true,
        repository: OWNER_REPOSITORY,
        revision: process.env.VERCEL_GIT_COMMIT_SHA || null,
        items,
        summary,
      },
      { headers: OWNER_PRIVATE_HEADERS },
    );
  } catch (error) {
    console.error("owner_actions_status_failed", { message: error instanceof Error ? error.message : "Unknown GitHub status error" });
    return NextResponse.json({ error: "Unable to read GitHub Actions status." }, { status: 502, headers: OWNER_PRIVATE_HEADERS });
  }
}
