import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/media/upload/route.js", import.meta.url), "utf8");
const form = readFileSync(new URL("../app/media-upload/MediaUploadForm.jsx", import.meta.url), "utf8");

test("mobile upload authorization lasts well beyond the former 10-minute window", () => {
  assert.match(route, /CLIENT_TOKEN_TTL_MS\s*=\s*2\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  assert.doesNotMatch(route, /Date\.now\(\)\s*\+\s*10\s*\*\s*60\s*\*\s*1000/);
});

test("mobile uploader uses multipart for ordinary approved video sizes", () => {
  assert.match(form, /MULTIPART_THRESHOLD_BYTES\s*=\s*5\s*\*\s*1024\s*\*\s*1024/);
  assert.match(form, /multipart:\s*file\.size\s*>=\s*MULTIPART_THRESHOLD_BYTES/);
});

test("mobile uploader has timeout and explicit completion state", () => {
  assert.match(form, /MOBILE_UPLOAD_TIMEOUT_MS\s*=\s*30\s*\*\s*60\s*\*\s*1000/);
  assert.match(form, /abortSignal:\s*controller\.signal/);
  assert.match(form, /Finalizing public Blob URL/);
  assert.match(form, /Public MP4 ready/);
});
