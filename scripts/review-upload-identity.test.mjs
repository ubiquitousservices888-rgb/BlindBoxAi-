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

test("invalid length, unavailable crypto or inconsistent bytes fail before ticket creation", async () => {
  for (const file of [new Blob([]), { size: 100 * 1024 * 1024 + 1, arrayBuffer() { throw Error("must not read"); } }, { size: 2, arrayBuffer: async () => new ArrayBuffer(1) }]) {
    await assert.rejects(() => reviewUploadPath(file));
  }
  await assert.rejects(() => reviewUploadPath(new Blob(["test"]), {}), /fingerprinting is unavailable/);
});
