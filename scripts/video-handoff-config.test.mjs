import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(new URL("../.github/workflows/autonomous-video.yml", import.meta.url), "utf8");

test("video workflow is manual validation only", () => {
  assert.match(workflow, /workflow_dispatch/);
  assert.doesNotMatch(workflow, /\bschedule\s*:/);
  assert.match(workflow, /Validate deterministic video assets only/);
});

test("video workflow contains no Zapier or publishing credentials", () => {
  assert.doesNotMatch(workflow, /ZAPIER_VIDEO_WEBHOOK_URL|BUFFER_API_TOKEN|CREATOMATE_API_KEY/);
  assert.doesNotMatch(workflow, /npm run video:zapier|npm run video:publish/);
});

test("video workflow explicitly records the compliance hold", () => {
  assert.match(workflow, /publishing is intentionally disabled/i);
  assert.match(workflow, /validates only/i);
  assert.match(workflow, /No Zapier webhook, renderer, Buffer publisher, TikTok API, YouTube API, or generative AI is invoked/);
});
