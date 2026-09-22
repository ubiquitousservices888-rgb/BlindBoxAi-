import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { assertOwnerCode, assertUploadCode } from "../lib/evidence.js";

const freeUploadRoute = fs.readFileSync(new URL("../app/api/media/free-upload-ticket/route.js", import.meta.url), "utf8");
const storageAuthRoute = fs.readFileSync(new URL("../app/api/owner/storage-auth/route.js", import.meta.url), "utf8");
const stageReviewRoute = fs.readFileSync(new URL("../app/api/owner/stage-review/route.js", import.meta.url), "utf8");
const approveReviewRoute = fs.readFileSync(new URL("../app/api/owner/approve-review/route.js", import.meta.url), "utf8");
const approveLaunchRoute = fs.readFileSync(new URL("../app/api/owner/approve-launch/route.js", import.meta.url), "utf8");
const ebayConnectRoute = fs.readFileSync(new URL("../app/api/owner/ebay-connect/route.js", import.meta.url), "utf8");
const controlAuthRoute = fs.readFileSync(new URL("../app/api/owner/control-auth/route.js", import.meta.url), "utf8");
const reviewQueueEdge = fs.readFileSync(new URL("../supabase/functions/review-video-queue/index.ts", import.meta.url), "utf8");

const OWNER = "owner-code-test-only";
const UPLOAD = "upload-code-test-only";

function acceptsStagingCode(value) {
  try {
    assertOwnerCode(value);
    return true;
  } catch {
    try {
      assertUploadCode(value);
      return true;
    } catch {
      return false;
    }
  }
}

test("staging contract accepts owner or upload code and rejects anything else", () => {
  const previousOwner = process.env.OWNER_CONTROL_CODE;
  const previousUpload = process.env.EVIDENCE_UPLOAD_CODE;
  process.env.OWNER_CONTROL_CODE = OWNER;
  process.env.EVIDENCE_UPLOAD_CODE = UPLOAD;
  try {
    assert.equal(acceptsStagingCode(OWNER), true);
    assert.equal(acceptsStagingCode(UPLOAD), true);
    assert.equal(acceptsStagingCode("wrong-code"), false);
  } finally {
    if (previousOwner === undefined) delete process.env.OWNER_CONTROL_CODE;
    else process.env.OWNER_CONTROL_CODE = previousOwner;
    if (previousUpload === undefined) delete process.env.EVIDENCE_UPLOAD_CODE;
    else process.env.EVIDENCE_UPLOAD_CODE = previousUpload;
  }
});

test("only staging/upload routes contain the dual-code fallback", () => {
  for (const source of [freeUploadRoute, storageAuthRoute, stageReviewRoute]) {
    assert.match(source, /assertOwnerCode/);
    assert.match(source, /assertUploadCode/);
    assert.match(source, /function assertStagingCode/);
    assert.match(source, /status:\s*401/);
  }
});

test("approval, launch, connect and revoke surfaces are owner-only and map failure to 401", () => {
  for (const source of [approveReviewRoute, approveLaunchRoute, ebayConnectRoute, controlAuthRoute]) {
    assert.match(source, /assertOwnerCode/);
    assert.doesNotMatch(source, /assertUploadCode/);
    assert.match(source, /status:\s*401/);
  }
});

test("upload credential is rejected by the checker used on privileged routes", () => {
  const previousOwner = process.env.OWNER_CONTROL_CODE;
  const previousUpload = process.env.EVIDENCE_UPLOAD_CODE;
  process.env.OWNER_CONTROL_CODE = OWNER;
  process.env.EVIDENCE_UPLOAD_CODE = UPLOAD;
  try {
    assert.doesNotThrow(() => assertOwnerCode(OWNER));
    assert.throws(() => assertOwnerCode(UPLOAD), /Invalid owner access code/);
  } finally {
    if (previousOwner === undefined) delete process.env.OWNER_CONTROL_CODE;
    else process.env.OWNER_CONTROL_CODE = previousOwner;
    if (previousUpload === undefined) delete process.env.EVIDENCE_UPLOAD_CODE;
    else process.env.EVIDENCE_UPLOAD_CODE = previousUpload;
  }
});



test("review reject transition is owner-control only and audit preserving", () => {
  assert.match(controlAuthRoute, /assertOwnerCode/);
  assert.doesNotMatch(controlAuthRoute, /assertUploadCode/);
  const rejectStart = reviewQueueEdge.indexOf("async function reject(req");
  const rejectEnd = reviewQueueEdge.indexOf("function requestedPublishChannel", rejectStart);
  const rejectHandler = reviewQueueEdge.slice(rejectStart, rejectEnd);
  assert.ok(rejectStart >= 0 && rejectEnd > rejectStart);
  assert.match(rejectHandler, /ownerControlAuthorized/);
  assert.doesNotMatch(rejectHandler, /stagingAuthorized/);
  assert.match(rejectHandler, /status: "rejected"/);
  assert.match(rejectHandler, /rejection_reason/);
  assert.match(rejectHandler, /rejected_at/);
  assert.match(rejectHandler, /"duplicate"/);
  assert.match(rejectHandler, /"owner_rejected"/);
  assert.match(rejectHandler, /"test"/);
  assert.doesNotMatch(rejectHandler, /\.delete\(/);
});

test("rejected review rows cannot be reopened by staging the same URL", () => {
  const stageStart = reviewQueueEdge.indexOf("async function stage(req");
  const stageEnd = reviewQueueEdge.indexOf("async function listReady", stageStart);
  const stageHandler = reviewQueueEdge.slice(stageStart, stageEnd);
  assert.match(stageHandler, /existing\?\.status === "rejected"/);
  assert.match(stageHandler, /Rejected review rows are immutable/);
  assert.ok(stageHandler.includes('return json({ error: "Rejected review rows are immutable" }, 409);'));
});


test("rejected migration extends the queue status constraint before migrating rows", () => {
  const migration = fs.readFileSync(
    new URL("../supabase/migrations/20260922022000_review_video_rejected_status.sql", import.meta.url),
    "utf8",
  );
  const statusConstraint = migration.indexOf("review_video_queue_status_check");
  const rejectedStatus = migration.indexOf("'rejected'");
  const duplicateMigration = migration.indexOf("rv-dc3fe87a26bf3dd7");
  assert.ok(statusConstraint >= 0);
  assert.ok(rejectedStatus > statusConstraint);
  assert.ok(duplicateMigration > rejectedStatus);
});
