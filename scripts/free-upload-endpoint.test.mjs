import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const form = fs.readFileSync(new URL("../app/media-upload/MediaUploadForm.jsx", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../app/api/media/free-upload-ticket/route.js", import.meta.url), "utf8");

test("phone uploader uses same-origin free upload ticket endpoint", () => {
  assert.match(form, /const STORAGE_BROKER = "\/api\/media\/free-upload-ticket"/);
  assert.doesNotMatch(form, /functions\/v1\/blindbox-video-upload/);
});

test("free upload ticket endpoint requires owner auth and validates bounded MP4 input", () => {
  assert.match(route, /assertUploadCode/);
  assert.match(route, /media\\\/review/);
  assert.match(route, /100 \* 1024 \* 1024/);
  assert.match(route, /blindbox-video-upload/);
});
