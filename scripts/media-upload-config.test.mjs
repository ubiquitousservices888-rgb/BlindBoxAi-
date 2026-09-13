import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/media/upload/route.js", import.meta.url), "utf8");
const form = readFileSync(new URL("../app/media-upload/MediaUploadForm.jsx", import.meta.url), "utf8");

test("mobile upload authorization lasts well beyond the former 10-minute window", () => {
  assert.match(route, /CLIENT_TOKEN_TTL_MS\s*=\s*2\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  assert.doesNotMatch(route, /Date\.now\(\)\s*\+\s*10\s*\*\s*60\s*\*\s*1000/);
});

test("mobile uploader uses owner-authenticated signed storage for approved video sizes", () => {
  assert.match(form, /blindbox-video-upload/);
  assert.match(form, /MAX_VIDEO_SIZE\s*=\s*100\s*\*\s*1024\s*\*\s*1024/);
  assert.match(form, /xhr\.open\("PUT",\s*signedUrl/);
  assert.match(form, /new FormData\(\)/);
  assert.match(form, /signedUrl/);
  assert.match(form, /publicUrl/);
});

test("mobile uploader has timeout, progress, and explicit completion state", () => {
  assert.match(form, /MOBILE_UPLOAD_TIMEOUT_MS\s*=\s*30\s*\*\s*60\s*\*\s*1000/);
  assert.match(form, /xhr\.timeout\s*=\s*MOBILE_UPLOAD_TIMEOUT_MS/);
  assert.match(form, /xhr\.ontimeout/);
  assert.match(form, /xhr\.upload\.onprogress/);
  assert.match(form, /setStatus\("complete"\)/);
  assert.match(form, /Finalizing public video URL/);
  assert.match(form, /Public MP4 ready/);
});
