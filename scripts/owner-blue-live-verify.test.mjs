import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const route = read("../app/api/owner/live-verify/route.js");
const workflow = read("../.github/workflows/owner-blue-live-verify-once.yml");
const oidcVerifier = read("../lib/github-oidc.mjs");

test("one-shot Owner Blue verifier is production/main OIDC gated", () => {
  assert.match(route, /process\.env\.VERCEL_ENV !== "production"/);
  assert.match(route, /process\.env\.VERCEL_GIT_COMMIT_REF !== "main"/);
  assert.match(route, /blindboxai-owner-live-verify/);
  assert.match(route, /owner-blue-live-verify-once\.yml@refs\/heads\/main/);
  assert.match(route, /verifyGitHubOidcRequest/);
  assert.match(route, /allowedEvents: \["push", "workflow_dispatch"\]/);
  assert.match(route, /repository: REPOSITORY/);
  assert.match(route, /workflowRef: WORKFLOW_REF/);
  assert.match(route, /deployedRevision !== oidc\.sha/);
  assert.match(oidcVerifier, /requiredRef = "refs\/heads\/main"/);
  assert.match(oidcVerifier, /JWKS_TIMEOUT_MS/);
  assert.match(oidcVerifier, /JWKS_TTL_MS/);
  assert.match(oidcVerifier, /Number\.isFinite\(notBefore\)/);
  assert.match(oidcVerifier, /payload\.repository !== repository/);
  assert.match(oidcVerifier, /payload\.ref !== requiredRef/);
  assert.match(oidcVerifier, /payload\.workflow_ref !== workflowRef/);
  assert.match(oidcVerifier, /events\.has\(String\(payload\.event_name/);
  assert.match(oidcVerifier, /payload\.iss !== OIDC_ISSUER/);
  assert.match(oidcVerifier, /audiences\.includes\(audience\)/);
});

test("one-shot Owner Blue verifier exercises canonical safe uploader and owner delete paths", () => {
  assert.match(route, /"\/api\/media\/free-upload-ticket"/);
  assert.match(route, /"\/api\/owner\/stage-review"/);
  assert.match(route, /"\/api\/owner\/review-queue"/);
  assert.match(route, /owner-blue-live-verify-invalid/);
  assert.match(route, /rejection_reason !== "owner_rejected"/);
  assert.match(route, /storageObjectIsGone\(stagedVideoUrl\)/);
  assert.match(route, /storageDeleted: true/);
  assert.match(route, /catch \{[\s\S]*setTimeout\(resolve, 500\)[\s\S]*continue;/);
  assert.ok(
    route.indexOf('"/api/owner/stage-review"') < route.indexOf("const form = new FormData()"),
    "stage must establish a deletable queue row before upload",
  );
  assert.match(route, /published: false/);
});

test("one-shot Owner Blue verifier cannot publish", () => {
  assert.doesNotMatch(route, /publish-approved-reviews|publish-approved-review-queue|BUFFER_API_TOKEN|record_channel|action:\s*"claim"/);
  assert.doesNotMatch(workflow, /publish-approved-reviews|publish-approved-review-queue|BUFFER_API_TOKEN/);
  assert.match(workflow, /OWNER_BLUE_PUBLISH: NOT_RUN/);
});

test("one-shot workflow is serialized only for marked pushes and retries transient identity failures", () => {
  assert.match(workflow, /push:\s*\n\s+branches: \[main\]/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /contains\(github\.event\.head_commit\.message, '\[owner-blue-live-verify\]'\) && 'owner-blue-live-verify'/);
  assert.match(workflow, /owner-blue-live-verify-unmarked-\{0\}/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /contains\(github\.event\.head_commit\.message, '\[owner-blue-live-verify\]'\)/);

  const loopStart = workflow.indexOf("for attempt in $(seq 1 24); do");
  const postStart = workflow.indexOf('http_code="000"', loopStart);
  assert.ok(loopStart >= 0 && postStart > loopStart, "identity retry block must be inside the attempt loop");
  const identityRetryBlock = workflow.slice(loopStart, postStart);

  assert.match(
    identityRetryBlock,
    /if ! oidc_json=[\s\S]*ACTIONS_ID_TOKEN_REQUEST_URL[\s\S]*then\s+sleep 10\s+continue\s+fi/,
  );
  assert.match(
    identityRetryBlock,
    /if ! oidc_token=[\s\S]*json\.load[\s\S]*then\s+sleep 10\s+continue\s+fi/,
  );

  assert.match(workflow, /000\|409\|500\|501\|502\|503\|504\|505\|506\|507\|508\|510\|511/);
  assert.match(workflow, /https:\/\/blindboxai\.com\/api\/owner\/live-verify/);
});
