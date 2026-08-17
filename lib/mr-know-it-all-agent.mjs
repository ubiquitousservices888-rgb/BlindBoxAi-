export { buildCatalogSnapshot } from "./reviewed-catalog.mjs";

function disabled() {
  throw new Error(
    "Hosted generative-AI execution is disabled for BlindBoxAI. Use the deterministic comp lookup and deterministic demand-research paths.",
  );
}

// Compatibility exports intentionally fail closed. They contain no model SDK,
// model credential lookup, web-search tool, or external generative-AI call.
export async function askMrKnowItAll() {
  return disabled();
}

export async function runResearchCycle() {
  return disabled();
}
