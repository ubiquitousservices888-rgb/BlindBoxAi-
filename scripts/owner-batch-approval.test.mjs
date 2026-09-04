import assert from "node:assert/strict";
import test from "node:test";
import {
  approveAllLaunchReadyVideos,
  findLaunchReadyVideoRuns,
} from "../lib/owner-batch-approval.mjs";

function jsonResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return value; },
  };
}

function mockGithub() {
  const posts = [];
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    const method = options.method ?? "GET";

    for (const [workflow, runId] of [["autonomous-video.yml", 101], ["manual-reviewed-video.yml", 201]]) {
      if (parsed.pathname.endsWith(`/actions/workflows/${workflow}/runs`)) {
        const status = parsed.searchParams.get("status");
        if (status === "waiting") {
          return jsonResponse({
            workflow_runs: [{ id: runId, head_branch: "main", html_url: `https://github.test/run/${runId}`, created_at: "2026-09-04T12:00:00Z" }],
          });
        }
        if (status === "in_progress") return jsonResponse({ workflow_runs: [] });
      }
    }

    if (method === "GET" && parsed.pathname.endsWith("/actions/runs/101/pending_deployments")) {
      return jsonResponse([
        { environment: { id: 7, name: "social-production" }, current_user_can_approve: true },
        { environment: { id: 8, name: "unrelated-production" }, current_user_can_approve: true },
      ]);
    }

    if (method === "GET" && parsed.pathname.endsWith("/actions/runs/201/pending_deployments")) {
      return jsonResponse([
        { environment: { id: 9, name: "social-production" }, current_user_can_approve: true },
      ]);
    }

    if (method === "POST" && /\/actions\/runs\/(101|201)\/pending_deployments$/.test(parsed.pathname)) {
      posts.push({ runId: Number(parsed.pathname.match(/runs\/(\d+)/)[1]), body: JSON.parse(options.body) });
      return jsonResponse([{ approved: true }]);
    }

    throw new Error(`Unexpected mock GitHub request: ${method} ${parsed.pathname}${parsed.search}`);
  };

  return { fetchImpl, posts };
}

test("finds social-production gates for both automated and yellow-button video workflows", async () => {
  const { fetchImpl } = mockGithub();
  const result = await findLaunchReadyVideoRuns({ token: "masked-test-token", fetchImpl });

  assert.equal(result.ready.length, 2);
  assert.deepEqual(result.ready.map((item) => item.workflowFile).sort(), ["autonomous-video.yml", "manual-reviewed-video.yml"]);
  assert.deepEqual(result.ready.map((item) => item.environmentIds[0]).sort(), [7, 9]);
});

test("blue approval clears every eligible video gate but no unrelated environment", async () => {
  const { fetchImpl, posts } = mockGithub();
  const result = await approveAllLaunchReadyVideos({ token: "masked-test-token", fetchImpl });

  assert.equal(result.status, "approved");
  assert.equal(result.approvedRuns, 2);
  assert.equal(result.approvedEnvironments, 2);
  assert.deepEqual(posts.map((item) => item.body.environment_ids).sort(), [[7], [9]]);
  assert.ok(posts.every((item) => item.body.state === "approved"));
  assert.ok(posts.every((item) => /after owner review/i.test(item.body.comment)));
});

test("missing approval token fails closed", async () => {
  await assert.rejects(
    () => findLaunchReadyVideoRuns({ token: "", fetchImpl: async () => jsonResponse({}) }),
    /GITHUB_OWNER_APPROVAL_TOKEN is required/,
  );
});
