import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { reviewUploadPath } from "../lib/review-upload-identity.mjs";

test("identical bytes with different filenames use one canonical upload path", async () => {
  const bytes = Buffer.from("disposable video fixture");
  const first = new File([bytes], "first.mp4");
  const second = new File([bytes], "renamed.mp4");
  const expected = `media/review/sha256-${createHash("sha256").update(bytes).digest("hex")}.mp4`;
  assert.equal(await reviewUploadPath(first), expected);
  assert.equal(await reviewUploadPath(second), expected);
  assert.notEqual(await reviewUploadPath(new File(["different"], "first.mp4")), expected);
});

test("disposable no-overwrite storage and URL-based queue accept identical bytes once", async () => {
  const storage = new Set(), queue = new Set();
  const upload = async (file) => {
    const path = await reviewUploadPath(file);
    if (storage.has(path)) return "already_exists";
    storage.add(path);
    queue.add(path);
    return "staged";
  };
  const outcomes = await Promise.all([upload(new File(["same"], "one.mp4")), upload(new File(["same"], "two.mp4"))]);
  assert.deepEqual(outcomes.sort(), ["already_exists", "staged"]);
  assert.equal(storage.size, 1);
  assert.equal(queue.size, 1);
  assert.equal(await upload(new File(["other"], "one.mp4")), "staged");
  assert.equal(queue.size, 2);
});

test("invalid length, unavailable crypto or inconsistent bytes fail helper validation", async () => {
  for (const file of [new Blob([]), { size: 100 * 1024 * 1024 + 1, arrayBuffer() { throw Error("must not read"); } }, { size: 2, arrayBuffer: async () => new ArrayBuffer(1) }]) {
    await assert.rejects(() => reviewUploadPath(file));
  }
  await assert.rejects(() => reviewUploadPath(new Blob(["test"]), {}), /fingerprinting is unavailable/);
});

test("lost successful upload response is recovered without a second PUT or ticket", async () => {
  const file = new File(["same"], "one.mp4");
  const path = await reviewUploadPath(file);
  const publicUrl = `https://lazzdoadoqzrzlarerfx.supabase.co/storage/v1/object/public/blindboxai-review-videos/${path}`;
  let stored = false, tickets = 0, puts = 0;
  const options = { file, verifyExisting: async () => stored ? { path, publicUrl, verified: true } : { verified: false },
    requestTicket: async () => { tickets++; return { path, publicUrl, signedUrl: "fixture" }; },
    upload: async () => { puts++; stored = true; throw new Error("response lost"); } };
  const { uploadOrRecoverReviewMedia } = await import("../lib/review-upload-identity.mjs");
  assert.deepEqual(await uploadOrRecoverReviewMedia(options), { url: publicUrl, pathname: path });
  assert.deepEqual(await uploadOrRecoverReviewMedia(options), { url: publicUrl, pathname: path });
  assert.equal(tickets, 1);
  assert.equal(puts, 1);
});

test("invalid file and unverified recovery never issue an extra ticket or PUT", async () => {
  const { uploadOrRecoverReviewMedia, canonicalReviewUploadUrl } = await import("../lib/review-upload-identity.mjs");
  let tickets = 0, puts = 0, verifies = 0;
  const options = { file: new File(["same"], "one.mp4"),
    verifyExisting: async () => { verifies++; return { verified: false }; },
    requestTicket: async ({ path }) => { tickets++; return { path, publicUrl: canonicalReviewUploadUrl(path), signedUrl: "fixture" }; },
    upload: async () => { puts++; throw new Error("write uncertain"); } };
  await assert.rejects(() => uploadOrRecoverReviewMedia({ ...options, file: new Blob([]) }), /Invalid review video size/);
  assert.deepEqual([tickets, puts, verifies], [0, 0, 0]);
  await assert.rejects(() => uploadOrRecoverReviewMedia(options), /write uncertain/);
  assert.deepEqual([tickets, puts, verifies], [1, 1, 2]);
  await assert.rejects(() => uploadOrRecoverReviewMedia({ ...options, verifyExisting: async () => ({ verified: true, path: "wrong", publicUrl: "https://wrong.example" }) }), /Invalid stored video verification/);
  assert.deepEqual([tickets, puts], [1, 1]);
});

test("server verifies actual stored bytes, length and fixed media URL", async () => {
  const { canonicalReviewUploadUrl } = await import("../lib/review-upload-identity.mjs");
  const { verifyReviewUpload } = await import("../lib/review-upload-verification.mjs");
  const path = await reviewUploadPath(new Blob(["same"]));
  const publicUrl = canonicalReviewUploadUrl(path);
  const response = (data, status = 200, type = "video/mp4", url = publicUrl) => {
    const result = new Response(data, { status, headers: { "content-type": type } });
    Object.defineProperty(result, "url", { value: url });
    return result;
  };
  const verify = (data, status, type, url) => verifyReviewUpload({ path, sizeBytes: 4, fetchImpl: async (requested, init) => {
    assert.equal(requested, publicUrl);
    assert.equal(init.redirect, "error");
    assert.equal(init.cache, "no-store");
    assert.equal(init.headers, undefined);
    return response(data, status, type, url);
  } });
  assert.deepEqual(await verify("same"), { verified: true, path, publicUrl });
  for (const missing of [400, 404]) assert.deepEqual(await verify("missing", missing), { verified: false });
  for (const args of [["else"], ["sam"], ["same!"], ["same", 206], ["same", 200, "text/html"], ["same", 200, "video/mp4", "https://wrong.example"]]) await assert.rejects(() => verify(...args));
  await assert.rejects(() => verifyReviewUpload({ path: "media/review/legacy.mp4", sizeBytes: 4, fetchImpl: () => assert.fail("unexpected fetch") }));
});

test("100 MiB fingerprints use bounded slices, not a whole-file allocation", async () => {
  const size = 100 * 1024 * 1024;
  const cap = 256 * 1024;
  const expected = createHash("sha256");
  let offset = 0, largest = 0, reads = 0;
  const file = {
    size,
    arrayBuffer() { assert.fail("whole-file allocation"); },
    slice(start, end) {
      assert.equal(start, offset);
      assert.ok(end > start && end <= size && end - start <= cap);
      const bytes = new Uint8Array(end - start).fill(reads % 251);
      largest = Math.max(largest, bytes.byteLength);
      reads++;
      offset = end;
      expected.update(bytes);
      return { arrayBuffer: async () => bytes.buffer };
    },
  };
  const path = await reviewUploadPath(file);
  assert.equal(path, `media/review/sha256-${expected.digest("hex")}.mp4`);
  assert.equal(offset, size);
  assert.equal(largest, cap);
  assert.equal(reads, 400);
});

test("incremental SHA-256 preserves historical paths at padding and slice boundaries", async () => {
  for (const length of [1, 55, 56, 63, 64, 65, 255, 256 * 1024 - 1, 256 * 1024, 256 * 1024 + 1]) {
    const bytes = Buffer.alloc(length);
    for (let i = 0; i < length; i++) bytes[i] = i % 251;
    const expected = createHash("sha256").update(bytes).digest("hex");
    assert.equal(await reviewUploadPath(new Blob([bytes])), `media/review/sha256-${expected}.mp4`);
  }
});

test("short or oversized chunks fail before requesting a ticket", async () => {
  const { uploadOrRecoverReviewMedia } = await import("../lib/review-upload-identity.mjs");
  for (const length of [1, 3]) {
    let operations = 0;
    const blocked = async () => { operations++; assert.fail("unexpected storage operation"); };
    const file = { size: 2, slice: () => ({ arrayBuffer: async () => new ArrayBuffer(length) }) };
    await assert.rejects(() => uploadOrRecoverReviewMedia({ file, verifyExisting: blocked, requestTicket: blocked, upload: blocked }), /Video bytes changed while reading the file/);
    assert.equal(operations, 0);
  }
});

test("invalid verification inputs fail as client errors, not storage failures", async () => {
  const { reviewUploadVerificationResponse } = await import("../lib/review-upload-verification.mjs");
  const path = await reviewUploadPath(new Blob(["same"]));
  for (const args of [{ path: "media/review/legacy.mp4", sizeBytes: 4 }, { path, sizeBytes: 1.5 }, { path, sizeBytes: "4" }]) {
    const result = await reviewUploadVerificationResponse({ ...args, verifyImpl: () => assert.fail("unexpected storage read"), log: () => assert.fail("unexpected storage error") });
    assert.equal(result.status, 400);
  }
});

test("verification diagnostics distinguish integrity failures without exposing upstream details", async () => {
  const { reviewUploadVerificationResponse, verifyReviewUpload } = await import("../lib/review-upload-verification.mjs");
  const { canonicalReviewUploadUrl } = await import("../lib/review-upload-identity.mjs");
  const path = await reviewUploadPath(new Blob(["same"]));
  const events = [];
  const log = (event, details) => events.push({ event, details });
  const verifyImpl = (args) => verifyReviewUpload({ ...args, fetchImpl: async () => {
    const result = new Response("else", { headers: { "content-type": "video/mp4" } });
    Object.defineProperty(result, "url", { value: canonicalReviewUploadUrl(path) });
    return result;
  } });
  const invalid = await reviewUploadVerificationResponse({ path, sizeBytes: 4, verifyImpl, log });
  assert.equal(invalid.status, 502);
  assert.deepEqual(events.pop(), { event: "free_upload_verification_failed", details: { message: "Stored video fingerprint mismatch" } });
  const unavailable = await reviewUploadVerificationResponse({ path, sizeBytes: 4, verifyImpl: async () => { throw new Error("sensitive upstream details"); }, log });
  assert.deepEqual(unavailable, { status: 502, body: { error: "Stored video could not be verified safely." } });
  assert.deepEqual(events.pop(), { event: "free_upload_verification_failed", details: { message: "Storage verification request failed" } });
  const absent = await reviewUploadVerificationResponse({ path, sizeBytes: 4, verifyImpl: async () => ({ verified: false }), log });
  assert.deepEqual(absent, { status: 200, body: { verified: false } });
  assert.equal(events.length, 0);
});

test("ticket mismatch is not mislabeled as an expired upload authorization", async () => {
  const { normalizeReviewUploadError, canonicalReviewUploadUrl } = await import("../lib/review-upload-identity.mjs");
  const { BLINDBOXAI_SUPABASE_ORIGIN } = await import("../lib/blindbox-supabase-boundary.mjs");
  assert.equal(normalizeReviewUploadError(new Error("Upload ticket does not match the video fingerprint")), "Upload ticket does not match the video fingerprint");
  assert.match(normalizeReviewUploadError(new Error("token has expired")), /authorization expired/);
  assert.match(normalizeReviewUploadError(new Error("Storage upload timed out.")), /timed out/);
  assert.match(normalizeReviewUploadError(new Error("Storage upload aborted.")), /interrupted/);
  assert.doesNotMatch(normalizeReviewUploadError(new Error("Storage upload aborted.")), /timed out/);
  assert.equal(new URL(canonicalReviewUploadUrl(await reviewUploadPath(new Blob(["same"])))).origin, BLINDBOXAI_SUPABASE_ORIGIN);
});

const mobileFixture = {
  accessCode: "owner-fixture",
  videoUrl: "https://fixture.invalid/media/review/video.mp4",
  researchRunId: "rv-0123456789abcdef",
  reviewedTitle: "Collector fixture",
};
function mobileRow(overrides = {}) {
  return {
    research_run_id: mobileFixture.researchRunId, video_url: mobileFixture.videoUrl,
    title: mobileFixture.reviewedTitle, status: "ready_for_review",
    caption_preview: ["youtube", "tiktok"].map(channel => {
      const link = `https://blindboxai.com/fixture?source=${channel}`;
      return { channel, ok: true, title: "Public fixture", link, caption: `Disclosure\n${link}`, landing: "Affiliate research" };
    }), ...overrides,
  };
}
function mobileFetch(items, status = 200) {
  return async (url, options) => {
    assert.equal(url, "/api/owner/review-queue?include=approved");
    assert.equal(options.headers.Authorization, "Bearer owner-fixture");
    assert.equal(options.cache, "no-store");
    return { ok: status === 200, status, json: async () => ({ items }) };
  };
}

test("mobile review uses exact authenticated queue identity, both captions, and explicit audience", async () => {
  const { loadMobileReviewPreview, launchMobileReview } = await import("../lib/mobile-review-approval.mjs");
  const row = mobileRow();
  const preview = await loadMobileReviewPreview({ ...mobileFixture, fetchImpl: mobileFetch([row]) });
  assert.deepEqual(preview.channels, row.caption_preview);
  for (const youtubeAudience of ["made_for_kids", "not_made_for_kids"]) {
    const posted = [];
    await launchMobileReview({ ...mobileFixture, youtubeAudience, preview, fetchImpl: mobileFetch([row]), postApproval: async body => posted.push(body) });
    assert.deepEqual(posted, [{ ...mobileFixture, youtubeAudience }]);
  }
});

test("mobile approval rejects missing audience, stale identity, or blocked caption without launching", async () => {
  const { loadMobileReviewPreview, launchMobileReview, mobileReviewReady } = await import("../lib/mobile-review-approval.mjs");
  const row = mobileRow();
  const preview = await loadMobileReviewPreview({ ...mobileFixture, fetchImpl: mobileFetch([row]) });
  const blockedRow = mobileRow({ caption_preview: [row.caption_preview[0], { channel: "tiktok", ok: false, error: "No destination" }] });
  const blocked = await loadMobileReviewPreview({ ...mobileFixture, fetchImpl: mobileFetch([blockedRow]) });
  assert.equal(mobileReviewReady(blocked), false);
  const postApproval = () => assert.fail("unexpected approval");
  for (const args of [{ youtubeAudience: "" }, { videoUrl: "https://fixture.invalid/other.mp4" }, { preview: blocked }]) {
    await assert.rejects(() => launchMobileReview({ ...mobileFixture, youtubeAudience: "not_made_for_kids", preview, postApproval, fetchImpl: () => assert.fail("unexpected fetch"), ...args }));
  }
});

test("mobile approval rechecks promotion drift before posting and fails closed", async () => {
  const { loadMobileReviewPreview, launchMobileReview } = await import("../lib/mobile-review-approval.mjs");
  const row = mobileRow();
  const preview = await loadMobileReviewPreview({ ...mobileFixture, fetchImpl: mobileFetch([row]) });
  const changed = mobileRow();
  changed.caption_preview[0].link = "https://ubiquity6.gumroad.com/l/fxloos";
  changed.caption_preview[0].caption = `Our digital product\n${changed.caption_preview[0].link}`;
  await assert.rejects(() => launchMobileReview({ ...mobileFixture, youtubeAudience: "made_for_kids", preview, fetchImpl: mobileFetch([changed]), postApproval: () => assert.fail("unexpected approval") }), /promotion preview changed/);
});

test("mobile preview rejects upload-only credentials, duplicate identities, missing channels and unsafe links", async () => {
  const { loadMobileReviewPreview } = await import("../lib/mobile-review-approval.mjs");
  const row = mobileRow();
  await assert.rejects(() => loadMobileReviewPreview({ ...mobileFixture, fetchImpl: mobileFetch([], 401) }), /owner control code/);
  for (const items of [[row, row], [mobileRow({ status: "published" })], [mobileRow({ caption_preview: [row.caption_preview[0]] })], [mobileRow({ title: "Different title" })]]) {
    await assert.rejects(() => loadMobileReviewPreview({ ...mobileFixture, fetchImpl: mobileFetch(items) }));
  }
  const unsafe = mobileRow();
  unsafe.caption_preview[0].link = "javascript:alert(1)";
  unsafe.caption_preview[0].caption = "javascript:alert(1)";
  await assert.rejects(() => loadMobileReviewPreview({ ...mobileFixture, fetchImpl: mobileFetch([unsafe]) }), /link is invalid/);
});
