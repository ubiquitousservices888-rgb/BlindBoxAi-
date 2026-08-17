import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("public Mr Know It All route cannot invoke an LLM or require an OpenAI key", () => {
  const route = read("app/api/mr-know-it-all/route.js");
  assert.doesNotMatch(route, /askMrKnowItAll|OPENAI_API_KEY|@openai\/agents|webSearchTool|\brun\(/);
  assert.match(route, /buildDeterministicCompResponse/);
});

test("scheduled autonomous video publishing is paused", () => {
  const workflow = read(".github/workflows/autonomous-video.yml");
  assert.doesNotMatch(workflow, /\bschedule\s*:/);
  assert.doesNotMatch(workflow, /ZAPIER_VIDEO_WEBHOOK_URL|BUFFER_API_TOKEN|CREATOMATE_API_KEY/);
  assert.match(workflow, /workflow_dispatch/);
});

test("scheduled Mr Know It All AI research is paused", () => {
  const workflow = read(".github/workflows/mr-know-it-all-research.yml");
  assert.doesNotMatch(workflow, /\bschedule\s*:/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY|npm run mr:research/);
  assert.match(workflow, /deterministic-comp-lookup\.test\.mjs/);
});

test("required analytics events are explicitly instrumented", () => {
  const sources = [
    read("app/_components/CoreAnalytics.jsx"),
    read("app/ask/page.jsx"),
    read("app/pro/waitlist.jsx"),
    read("app/api/out/ebay/route.js"),
  ].join("\n");
  for (const event of [
    "outbound_affiliate_click",
    "page_view",
    "waitlist_signup",
    "landing_session_source",
    "agent_question",
  ]) {
    assert.match(sources, new RegExp(event));
  }
});

test("public lookup keeps historical-data and no-hallucination language", () => {
  const lookup = read("lib/deterministic-comp-lookup.mjs");
  assert.match(lookup, /No verified sale found/);
  assert.match(lookup, /Not financial or investment advice/);
  assert.match(lookup, /No generative AI or external model is called/);
});
