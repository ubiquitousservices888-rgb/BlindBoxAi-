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
