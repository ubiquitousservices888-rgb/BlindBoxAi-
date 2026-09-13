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
    assert.ok(raw.verticalThemes.some((theme) => theme.vertical === "pop_mart" && theme.count === 3));
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

  it("classifies major collectible card verticals independently", () => {
    const result = classifyPrivateDemand([
      "What is the most valuable Pokemon card in the 30th Celebration set?",
      "What is this Magic the Gathering card worth?",
      "Show me recent sold prices for this Topps baseball card",
      "What is the value of this Yu-Gi-Oh card?",
    ]);
    for (const vertical of ["pokemon_tcg", "magic_the_gathering", "sports_cards", "yugioh"]) {
      assert.ok(result.verticalThemes.some((theme) => theme.vertical === vertical && theme.count === 1));
    }
  });

  it("uses generic fallbacks for unmapped cards and toys", () => {
    const result = classifyPrivateDemand([
      "What is this collectible card worth?",
      "How rare is this designer toy?",
    ]);
    assert.ok(result.verticalThemes.some((theme) => theme.vertical === "other_collectible_card"));
    assert.ok(result.verticalThemes.some((theme) => theme.vertical === "other_collectible_toy"));
  });

  it("research workflow stays manual and model-free", () => {
    const workflow = fs.readFileSync(path.join(process.cwd(), ".github", "workflows", "mr-know-it-all-research.yml"), "utf8");
    assert.doesNotMatch(workflow, /OPENAI_API_KEY|OPENAI_RESEARCH_MODEL|gpt-[0-9]/i);
    assert.doesNotMatch(workflow, /npm run mr:research/);
    assert.doesNotMatch(workflow, /MR_RESEARCH_ENCRYPTION_KEY|MR_PRIVATE_BLOB_READ_WRITE_TOKEN/);
    assert.doesNotMatch(workflow, /\bschedule\s*:/);
    assert.match(workflow, /workflow_dispatch/);
    assert.match(workflow, /deterministic-comp-lookup\.test\.mjs/);
  });
});
