import { askMrKnowItAll } from "../lib/mr-know-it-all-agent.mjs";

const question = process.argv.slice(2).join(" ").trim();
if (!question) throw new Error('Usage: npm run mr:ask -- "your blind-box question"');

const result = await askMrKnowItAll(question);
console.log(result.answer);
if (result.citations.length) {
  console.log("\nSources:");
  for (const citation of result.citations) console.log(`- ${citation.title}: ${citation.url}`);
}
if (result.safetyNotes.length) {
  console.log("\nNotes:");
  for (const note of result.safetyNotes) console.log(`- ${note}`);
}
