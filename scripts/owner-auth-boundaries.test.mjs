import assert from "node:assert/strict";
import test from "node:test";

import { POST as freeUploadTicket } from "../app/api/media/free-upload-ticket/route.js";
import { POST as storageAuth } from "../app/api/owner/storage-auth/route.js";
import { POST as stageReview } from "../app/api/owner/stage-review/route.js";
import { POST as approveReview } from "../app/api/owner/approve-review/route.js";
import { POST as approveLaunch } from "../app/api/owner/approve-launch/route.js";
import { POST as ebayConnect, DELETE as ebayRevoke } from "../app/api/owner/ebay-connect/route.js";

const OWNER = "owner-code-test-only";
const UPLOAD = "upload-code-test-only";

function request(url, method, token, body) {
  return new Request(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test("owner/upload credential boundaries are enforced at runtime", async () => {
  const previousOwner = process.env.OWNER_CONTROL_CODE;
  const previousUpload = process.env.EVIDENCE_UPLOAD_CODE;
  const previousFetch = globalThis.fetch;

  process.env.OWNER_CONTROL_CODE = OWNER;
  process.env.EVIDENCE_UPLOAD_CODE = UPLOAD;

  try {
    for (const token of [OWNER, UPLOAD]) {
      const storageResponse = await storageAuth(
        request("https://blindboxai.com/api/owner/storage-auth", "POST", token),
      );
      assert.equal(storageResponse.status, 200, "storage-auth must accept owner or upload code");
    }

    globalThis.fetch = async (_url, options = {}) => {
      const forwarded = String(options?.headers?.Authorization || "");
      assert.ok(
        forwarded === `Bearer ${OWNER}` || forwarded === `Bearer ${UPLOAD}`,
        "staging credential must be forwarded without substitution",
      );
      return Response.json({
        signedUrl: "https://example.invalid/signed-upload",
        publicUrl: "https://lazzdoadoqzrzlarerfx.supabase.co/storage/v1/object/public/blindboxai-review-videos/media/review/test.mp4",
        path: "media/review/test.mp4",
      });
    };

    for (const token of [OWNER, UPLOAD]) {
      const response = await freeUploadTicket(
        request("https://blindboxai.com/api/media/free-upload-ticket", "POST", token, {
          path: "media/review/test.mp4",
          sizeBytes: 1024,
        }),
      );
      assert.equal(response.status, 200, "free upload ticket must accept owner or upload code");
    }

    globalThis.fetch = async (_url, options = {}) => {
      const forwarded = String(options?.headers?.Authorization || "");
      assert.ok(
        forwarded === `Bearer ${OWNER}` || forwarded === `Bearer ${UPLOAD}`,
        "stage-review credential must be forwarded without substitution",
      );
      return Response.json({
        status: "staged_for_owner_review",
        state: "READY_FOR_REVIEW",
        approved: false,
        researchRunId: "rv-0123456789abcdef",
      });
    };

    const stageBody = {
      videoUrl: "https://lazzdoadoqzrzlarerfx.supabase.co/storage/v1/object/public/blindboxai-review-videos/media/review/test.mp4",
      title: "Throwaway staging test",
      sizeBytes: 1024,
      durationSeconds: 1,
      width: 1080,
      height: 1920,
    };
    for (const token of [OWNER, UPLOAD]) {
      const response = await stageReview(
        request("https://blindboxai.com/api/owner/stage-review", "POST", token, stageBody),
      );
      assert.equal(response.status, 200, "stage-review must accept owner or upload code");
    }

    let privilegedFetches = 0;
    globalThis.fetch = async () => {
      privilegedFetches += 1;
      return Response.json({ ok: true, state: "APPROVED" });
    };

    const approvalDenied = await approveReview(
      request("https://blindboxai.com/api/owner/approve-review", "POST", UPLOAD, {
        videoUrl: stageBody.videoUrl,
      }),
    );
    assert.equal(approvalDenied.status, 401, "upload code must not approve review videos");
    assert.equal(privilegedFetches, 0, "rejected upload code must not reach approval backend");

    const launchDenied = await approveLaunch(
      request("https://blindboxai.com/api/owner/approve-launch", "POST", UPLOAD),
    );
    assert.equal(launchDenied.status, 401, "upload code must not approve launch");

    const connectDenied = await ebayConnect(
      request("https://blindboxai.com/api/owner/ebay-connect", "POST", UPLOAD),
    );
    assert.equal(connectDenied.status, 401, "upload code must not connect eBay");

    const revokeDenied = await ebayRevoke(
      request("https://blindboxai.com/api/owner/ebay-connect", "DELETE", UPLOAD),
    );
    assert.equal(revokeDenied.status, 401, "upload code must not revoke eBay");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousOwner === undefined) delete process.env.OWNER_CONTROL_CODE;
    else process.env.OWNER_CONTROL_CODE = previousOwner;
    if (previousUpload === undefined) delete process.env.EVIDENCE_UPLOAD_CODE;
    else process.env.EVIDENCE_UPLOAD_CODE = previousUpload;
  }
});
