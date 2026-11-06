import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

// Every *.test.mjs file under scripts/ must be reachable from the npm scripts that the
// release gate "Test" job runs. A test file that nothing runs protects nothing.
const ROOTS = ["qa:boundaries", "qa:unit", "qa:integration", "validate"];

function reachableScriptText(scripts) {
  const seen = new Set();
  const stack = [...ROOTS];
  while (stack.length) {
    const name = stack.pop();
    if (seen.has(name) || !(name in scripts)) continue;
    seen.add(name);
    for (const match of scripts[name].matchAll(/\bnpm (?:run )?(?:-s )?([\w:.-]+)/g)) stack.push(match[1]);
  }
  return [...seen].map((name) => scripts[name]).join("\n");
}

function testFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : testFiles(path);
    return /\.test\.m?js$/.test(entry.name) ? [path] : [];
  });
}

test("release gate Test job runs every test file under scripts/", () => {
  const { scripts } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const workflow = readFileSync(new URL("../.github/workflows/release-gate.yml", import.meta.url), "utf8");
  const testJob = workflow.match(/\njobs:\n[\s\S]*?\n {2}test:\n([\s\S]*?)(?=\n {2}[A-Za-z0-9_-]+:\n|$)/)?.[1];
  assert.ok(testJob, "release gate must define a jobs.test job");
  const runLines = testJob.split("\n").filter((line) => /^\s+(?:- )?run:/.test(line)).join("\n");
  for (const root of ROOTS) {
    assert.match(runLines, new RegExp(`npm run ${root.replace(/[.:]/g, "\\  for (const root of ROOTS) assert.match(workflow, new RegExp(`npm run ${root.replace(/[.:]/g, "\\$&")}\\b`), `release gate must run npm run ${root}`);")}\\b`), `release gate Test job must run npm run ${root}`);
  }
  const reachable = reachableScriptText(scripts);
  const orphans = testFiles("scripts").filter((file) => !reachable.includes(file));
  assert.deepEqual(orphans, [], `test files never run by the release gate: ${orphans.join(", ")}`);
});
