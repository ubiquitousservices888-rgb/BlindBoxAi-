import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  buildDeterministicDemandInput,
  classifyPrivateDemand,
} from "../lib/deterministic-demand-research.mjs";

describe("free deterministic private research", () => {
  it("classifies repeated collector demand without generating unverified opportunities", () => {
    const raw = buildDeterministicDemandInput([
      "How much is HIRONO worth from sold prices?",
      "What are recent sold prices for HIRONO?",
      "How can I verify a fake Labubu?",
    ]);
    assert.ok(raw.questionThemes.some((theme) => theme.topic === "Price and resale evidence" && theme.count === 2));
    assert.ok(raw.questionThemes.some((theme) => theme.topic === "Authenticity and counterfeit checks" && theme.count === 1));
    assert.deepEqual(raw.opportunities, []);
    assert.match(raw.summary, /without a hosted AI agent or paid model call/i);
  });

  it("deduplicates identical demand before counting", () => {
    const result = classifyPrivateDemand([
      "What is this series worth?",
      "What is this series worth?",
      "What is this series worth?",
    ]);
    const price = result.themes.find((theme) => theme.topic === "Price and resale evidence");
    assert.equal(price?.count, 1);
  });

  it("scheduled workflow cannot require an OpenAI key or research model", () => {
    const workflow = fs.readFileSync(path.join(process.cwd(), ".github", "workflows", "mr-know-it-all-research.yml"), "utf8");
    assert.doesNotMatch(workflow, /OPENAI_API_KEY/);
    assert.doesNotMatch(workflow, /OPENAI_RESEARCH_MODEL/);
    assert.doesNotMatch(workflow, /gpt-[0-9]/i);
    assert.match(workflow, /npm run mr:research/);
    assert.match(workflow, /MR_RESEARCH_ENCRYPTION_KEY/);
    assert.match(workflow, /MR_PRIVATE_BLOB_READ_WRITE_TOKEN/);
  });
});
