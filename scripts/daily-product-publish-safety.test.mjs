import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DISCLOSURE,
  buildEligibleProduct,
  createCandidate,
  validateCandidateHash,
} from "../lib/daily-product-pipeline.mjs";
import {
  assertBufferOrganizationId,
  assertCandidateCtas,
  discoverScopedBufferChannels,
  findExistingBufferPostPaginated,
  hardenCandidateForPublishing,
} from "../lib/daily-product-publish-safety.mjs";

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
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
