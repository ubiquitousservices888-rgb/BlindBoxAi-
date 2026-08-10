import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DISCLOSURE,
  STATE_TITLE,
  buildEligibleProduct,
  createCandidate,
  renderStateIssue,
  validateCandidateHash,
} from "../lib/daily-product-pipeline.mjs";
import {
  assertBufferOrganizationId,
  assertCandidateCtas,
  discoverScopedBufferChannels,
  findExistingBufferPostPaginated,
  hardenCandidateForPublishing,
  loadGithubStatePaginated,
  verifyExclusiveEnvironmentGate,
} from "../lib/daily-product-publish-safety.mjs";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Buffer organization scope", () => {
  it("requires an explicit organization id", () => {
    assert.throws(() => assertBufferOrganizationId(""), /BUFFER_ORGANIZATION_ID/);
    assert.throws(() => assertBufferOrganizationId("REPLACE_ORG"), /placeholder/i);
    assert.equal(assertBufferOrganizationId("org-b"), "org-b");
  });

  it("queries channels only for the configured organization and excludes Pinterest", async () => {
    const channelOrgIds = [];
    const fetchImpl = async (_url, options) => {
      const request = JSON.parse(options.body);
      if (request.query.includes("query Organizations")) {
        return jsonResponse({ data: { account: { organizations: [
          { id: "org-a", name: "A" },
          { id: "org-b", name: "B" },
        ] } } });
      }
      channelOrgIds.push(request.variables.organizationId);
      return jsonResponse({ data: { channels: [
        { id: "x", name: "X", displayName: "X", service: "twitter", isDisconnected: false, isLocked: false },
        { id: "p", name: "Pinterest", displayName: "Pinterest", service: "pinterest", isDisconnected: false, isLocked: false },
      ] } });
    };

    const channels = await discoverScopedBufferChannels({
      token: "test-token",
      organizationId: "org-b",
      fetchImpl,
    });

    assert.deepEqual(channelOrgIds, ["org-b"]);
    assert.deepEqual(channels.map((channel) => channel.id), ["x"]);
    assert.ok(channels.every((channel) => channel.organizationId === "org-b"));
  });

  it("fails if the configured organization is not available to the token", async () => {
    const fetchImpl = async () => jsonResponse({ data: { account: { organizations: [{ id: "org-a", name: "A" }] } } });
    await assert.rejects(
      () => discoverScopedBufferChannels({ token: "test-token", organizationId: "org-b", fetchImpl }),
      /not available/i,
    );
  });
});

describe("Buffer duplicate pagination", () => {
  it("continues through all pages until it finds the exact existing post", async () => {
    const afterValues = [];
    const fetchImpl = async (_url, options) => {
      const request = JSON.parse(options.body);
      afterValues.push(request.variables.after);
      if (!request.variables.after) {
        return jsonResponse({ data: { posts: {
          edges: [{ node: { id: "other", text: "different caption", status: "sent", channelId: "chan-1" } }],
          pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
        } } });
      }
      return jsonResponse({ data: { posts: {
        edges: [{ node: { id: "existing-123", text: "exact caption", status: "sent", channelId: "chan-1" } }],
        pageInfo: { hasNextPage: false, endCursor: "cursor-2" },
      } } });
    };

    const found = await findExistingBufferPostPaginated({
      token: "test-token",
      organizationId: "org-b",
      channelId: "chan-1",
      text: "exact caption",
      fetchImpl,
    });

    assert.equal(found.id, "existing-123");
    assert.deepEqual(afterValues, [null, "cursor-1"]);
  });

  it("fails closed on a repeated pagination cursor", async () => {
    const fetchImpl = async () => jsonResponse({ data: { posts: {
      edges: [],
      pageInfo: { hasNextPage: true, endCursor: "same-cursor" },
    } } });
    await assert.rejects(
      () => findExistingBufferPostPaginated({
        token: "test-token",
        organizationId: "org-b",
        channelId: "chan-1",
        text: "caption",
        fetchImpl,
      }),
      /repeated cursor/i,
    );
  });
});

describe("approval artifact CTA integrity", () => {
  it("repairs truncated captions, removes Pinterest, and re-hashes the exact approval artifact", () => {
    const product = buildEligibleProduct({
      slug: "long-name",
      name: "Collector Series ".repeat(40),
      brand: "POP MART",
    });
    const original = createCandidate(product, { runId: "cta-test", sourceCommit: "abc" });
    assert.ok(!original.captions.twitter.includes(product.ctaUrl));

    const hardened = hardenCandidateForPublishing(original);
    assert.equal(hardened.captions.pinterest, undefined);
    assert.ok(!hardened.targetServices.includes("pinterest"));
    assert.equal(assertCandidateCtas(hardened), true);
    assert.ok(Object.values(hardened.captions).every((text) => text.includes(product.ctaUrl)));
    assert.ok(Object.values(hardened.captions).every((text) => text.includes(DISCLOSURE)));
    assert.ok(hardened.captions.twitter.length <= 280);
    assert.equal(validateCandidateHash(hardened), true);
  });
});

describe("exclusive production approval gate", () => {
  function environmentPayload(reviewers) {
    return {
      protection_rules: [{
        type: "required_reviewers",
        prevent_self_review: false,
        reviewers,
      }],
      deployment_branch_policy: {
        protected_branches: false,
        custom_branch_policies: true,
      },
    };
  }

  it("requires the owner as the sole reviewer and main as the sole deployment branch", async () => {
    const fetchImpl = async (url) => {
      if (String(url).includes("deployment-branch-policies")) {
        return jsonResponse({ total_count: 1, branch_policies: [{ id: 1, name: "main" }] });
      }
      return jsonResponse(environmentPayload([
        { type: "User", reviewer: { login: "ubiquitousservices888-rgb" } },
      ]));
    };
    assert.equal(await verifyExclusiveEnvironmentGate({
      repo: "owner/repo",
      token: "github-token",
      expectedReviewer: "ubiquitousservices888-rgb",
      fetchImpl,
    }), true);
  });

  it("rejects an environment where any second reviewer could approve", async () => {
    const fetchImpl = async () => jsonResponse(environmentPayload([
      { type: "User", reviewer: { login: "ubiquitousservices888-rgb" } },
      { type: "User", reviewer: { login: "someone-else" } },
    ]));
    await assert.rejects(() => verifyExclusiveEnvironmentGate({
      repo: "owner/repo",
      token: "github-token",
      expectedReviewer: "ubiquitousservices888-rgb",
      fetchImpl,
    }), /exactly one required reviewer/i);
  });

  it("rejects an environment that can deploy from anything other than main", async () => {
    const fetchImpl = async (url) => {
      if (String(url).includes("deployment-branch-policies")) {
        return jsonResponse({ total_count: 2, branch_policies: [{ id: 1, name: "main" }, { id: 2, name: "release/*" }] });
      }
      return jsonResponse(environmentPayload([
        { type: "User", reviewer: { login: "ubiquitousservices888-rgb" } },
      ]));
    };
    await assert.rejects(() => verifyExclusiveEnvironmentGate({
      repo: "owner/repo",
      token: "github-token",
      expectedReviewer: "ubiquitousservices888-rgb",
      fetchImpl,
    }), /exactly one deployment branch: main/i);
  });
});

describe("persistent GitHub state pagination", () => {
  it("finds the machine state issue even when it is beyond the first 100 open issues", async () => {
    const stateBody = renderStateIssue({
      schema: "blindboxai.daily-product-state/v1",
      products: { already: { status: "PUBLISHED" } },
      updatedAt: null,
    });
    const fetchImpl = async (url) => {
      const parsed = new URL(url);
      const page = Number(parsed.searchParams.get("page"));
      if (page === 1) {
        return jsonResponse(Array.from({ length: 100 }, (_, i) => ({
          id: i + 1,
          number: i + 1,
          title: `Other issue ${i + 1}`,
          body: "",
        })));
      }
      return jsonResponse([{
        id: 1001,
        number: 101,
        title: STATE_TITLE,
        body: stateBody,
      }]);
    };

    const loaded = await loadGithubStatePaginated({
      repo: "owner/repo",
      token: "github-token",
      fetchImpl,
    });
    assert.equal(loaded.issue.number, 101);
    assert.equal(loaded.state.products.already.status, "PUBLISHED");
  });
});
