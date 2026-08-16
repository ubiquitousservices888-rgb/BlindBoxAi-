import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(new URL("../.github/workflows/autonomous-video.yml", import.meta.url), "utf8");

test("video workflow targets YouTube and TikTok", () => {
  assert.match(workflow, /VIDEO_CHANNELS:\s*youtube,tiktok/);
});

test("video workflow fails closed when Zapier webhook is missing", () => {
  assert.match(workflow, /Require Zapier publishing handoff/);
  assert.match(workflow, /ZAPIER_VIDEO_WEBHOOK_URL is not configured/);
  assert.match(workflow, /exit 1/);
});

test("video workflow distinguishes a visual hold from a successful handoff", () => {
  assert.match(workflow, /HOLD_FOR_VISUAL/);
  assert.match(workflow, /Video held for approved visuals/);
  assert.match(workflow, /No webhook was sent/);
  assert.match(workflow, /Verified video request sent to Zapier/);
});
