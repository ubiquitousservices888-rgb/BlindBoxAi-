import { NextResponse } from "next/server";

import { assertOwnerCode } from "../../../../lib/evidence";
import {
  githubOwnerHeaders,
  OWNER_PRIVATE_HEADERS,
  OWNER_REPOSITORY,
  ownerUnauthorized,
} from "../../../../lib/github-owner.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTROL_WORKFLOWS = Object.freeze([
  { name: "BlindBoxAI release gate", file: "release-gate.yml" },
  { name: "Build BlindBoxAI Live Wallpaper", file: "build-live-wallpaper.yml" },
  { name: "Owner Blue live verify once", file: "owner-blue-live-verify-once.yml", event: "workflow_dispatch" },
  { name: "Bounded unattended operations", file: "bounded-operations.yml" },
  { name: "Autonomous affiliate loop", file: "autonomous-affiliate-loop.yml" },
  { name: "Daily BlindBox pipeline validation (publishing paused)", file: "daily-blindbox-product.yml" },
  { name: "Labubu content validation (automation paused)", file: "labubu-buffer.yml" },
  { name: "Narrative flywheel candidate (review only)", file: "narrative-flywheel-stage.yml" },
]);
const ACTIVE_STATUSES = new Set(["queued", "pending", "in_progress", "waiting", "requested"]);
const CACHE_TTL_MS = 60_000;

let controlRunsCache = null;
let controlRunsCacheUntil = 0;
let controlRunsInFlight = null;

async function latestWorkflowRun(token, workflow) {
  const file = encodeURIComponent(workflow.file);
  const url = new URL(`https://api.github.com/repos/${OWNER_REPOSITORY}/actions/workflows/${file}/runs`);
  url.searchParams.set("branch", "main");
  url.searchParams.set("per_page", "10");

  const response = await fetch(url, { headers: githubOwnerHeaders(token), cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`actions_runs_${workflow.file}_${response.status}`);

  const runs = Array.isArray(data.workflow_runs) ? data.workflow_runs : [];
  return runs.find((run) => !workflow.event || run?.event === workflow.event) || null;
}

async function loadControlRuns(token) {
  const now = Date.now();
  if (controlRunsCache && now < controlRunsCacheUntil) return controlRunsCache;
  if (controlRunsInFlight) return controlRunsInFlight;

  controlRunsInFlight = (async () => {
    const entries = await Promise.all(
      CONTROL_WORKFLOWS.map(async (workflow) => [workflow.name, await latestWorkflowRun(token, workflow)]),
    );
    const latest = new Map(entries);
    controlRunsCache = latest;
    controlRunsCacheUntil = Date.now() + CACHE_TTL_MS;
    return latest;
  })();

  try {
    return await controlRunsInFlight;
  } finally {
    controlRunsInFlight = null;
  }
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
    const latest = await loadControlRuns(token);
    const items = CONTROL_WORKFLOWS.map(({ name }) => {
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
        cacheSeconds: CACHE_TTL_MS / 1000,
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
