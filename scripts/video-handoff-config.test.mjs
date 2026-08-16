import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(new URL("../.github/workflows/autonomous-video.yml", import.meta.url), "utf8");

test("video workflow targets the three intended Buffer services", () => {
  assert.match(workflow, /VIDEO_CHANNELS:\s*twitter,pinterest,facebook/);
});

test("video workflow fails closed when Zapier webhook is missing", () => {
  assert.match(workflow, /Require Zapier publishing handoff/);
  assert.match(workflow, /ZAPIER_VIDEO_WEBHOOK_URL is not configured/);
  assert.match(workflow, /exit 1/);
});
