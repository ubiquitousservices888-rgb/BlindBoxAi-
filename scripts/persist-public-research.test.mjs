import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  persistPublicResearch,
  validatePublicResearchArtifact,
} from "./persist-public-research.mjs";

function artifact() {
  return {
    schema: "blindboxai/know-it-all/public-research/v2",
    mode: "credentialless-autonomous-public-research",
    researchedAt: "2026-09-21T16:48:50.500Z",
    security: {
      credentialsProvided: false,
      secretsRead: false,
      environmentRead: false,
      privateRepositoriesAccessed: false,
      sideEffectsPerformed: [],
      ownerApprovalRequiredForActions: true,
    },
    sources: [{ name: "baseball-cards", status: "ok" }],
    findings: [{ title: "Example public finding" }],
  };
}

test("validates credentialless public research contract", () => {
  const checked = validatePublicResearchArtifact(artifact());
  assert.equal(checked.findingCount, 1);
  assert.equal(checked.sourceCount, 1);

  const unsafe = artifact();
  unsafe.security.secretsRead = true;
  assert.throws(() => validatePublicResearchArtifact(unsafe), /security contract failed/);
});

test("persists through OIDC edge call without a service-role credential", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      async json() {
        return { ok: true, duplicate: false };
      },
    };
  };

  const result = await persistPublicResearch({
    artifact: artifact(),
    oidcToken: "test-oidc-token",
    supabaseUrl: "https://example-project.supabase.co",
    fetchImpl,
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/functions\/v1\/mr-know-it-all-ingest$/);
  assert.equal(calls[0].init.headers.authorization, "Bearer test-oidc-token");
  assert.equal(JSON.parse(calls[0].init.body).type, "bot_public_research");
});

test("persistence client never references Supabase service-role credentials", () => {
  const source = fs.readFileSync(new URL("./persist-public-research.mjs", import.meta.url), "utf8");
  assert.equal(source.includes("SUPABASE_SERVICE_ROLE_KEY"), false);
});
