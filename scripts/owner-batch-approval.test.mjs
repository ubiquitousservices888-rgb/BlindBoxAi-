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

    if (parsed.pathname.endsWith("/actions/workflows/autonomous-video.yml/runs")) {
      const status = parsed.searchParams.get("status");
      if (status === "waiting") {
        return jsonResponse({
          workflow_runs: [
            { id: 101, head_branch: "main", html_url: "https://github.test/run/101", created_at: "2026-09-04T12:00:00Z" },
            { id: 102, head_branch: "main", html_url: "https://github.test/run/102", created_at: "2026-09-04T12:01:00Z" },
          ],
        });
      }
      if (status === "in_progress") {
        return jsonResponse({ workflow_runs: [{ id: 101, head_branch: "main" }] });
      }
    }

    if (method === "GET" && parsed.pathname.endsWith("/actions/runs/101/pending_deployments")) {
      return jsonResponse([
        { environment: { id: 7, name: "social-production" }, current_user_can_approve: true },
        { environment: { id: 8, name: "unrelated-production" }, current_user_can_approve: true },
      ]);
    }

    if (method === "GET" && parsed.pathname.endsWith("/actions/runs/102/pending_deployments")) {
      return jsonResponse([
        { environment: { id: 9, name: "social-production" }, current_user_can_approve: false },
      ]);
    }

    if (method === "POST" && parsed.pathname.endsWith("/actions/runs/101/pending_deployments")) {
      posts.push(JSON.parse(options.body));
      return jsonResponse([{ approved: true }]);
    }

    throw new Error(`Unexpected mock GitHub request: ${method} ${parsed.pathname}${parsed.search}`);
  };

  return { fetchImpl, posts };
}

test("finds only main-branch social-production gates the owner token can approve", async () => {
  const { fetchImpl } = mockGithub();
  const result = await findLaunchReadyVideoRuns({ token: "masked-test-token", fetchImpl });

  assert.equal(result.ready.length, 1);
  assert.equal(result.ready[0].runId, 101);
  assert.deepEqual(result.ready[0].environmentIds, [7]);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].runId, 102);
});

test("one-click launch approves every eligible video run but no unrelated environment", async () => {
  const { fetchImpl, posts } = mockGithub();
  const result = await approveAllLaunchReadyVideos({ token: "masked-test-token", fetchImpl });

  assert.equal(result.status, "approved");
  assert.equal(result.approvedRuns, 1);
  assert.equal(result.approvedEnvironments, 1);
  assert.deepEqual(posts, [{
    environment_ids: [7],
    state: "approved",
    comment: "Approved from BlindBoxAI Owner Dashboard — launch all already-validated video jobs.",
  }]);
});

test("missing approval token fails closed", async () => {
  await assert.rejects(
    () => findLaunchReadyVideoRuns({ token: "", fetchImpl: async () => jsonResponse({}) }),
    /GITHUB_OWNER_APPROVAL_TOKEN is required/,
  );
});
