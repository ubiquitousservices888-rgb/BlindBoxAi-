import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { auditBoundaries } from "./qa-boundaries.mjs";

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blindbox-qa-boundaries-"));
  for (const [name, source] of Object.entries(files)) {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, source);
  }
  return root;
}

test("separate apps cannot be linked from BlindBoxAI runtime code", (t) => {
  const root = fixture({ "app/page.jsx": 'export const destination = "https://agentaiio.com/hub";' });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.match(auditBoundaries(root).join("\n"), /references another app/);
});

test("transitive client imports cannot reach server credentials", (t) => {
  const root = fixture({
    "app/widget.jsx": '"use client";\nimport { value } from "../lib/bridge.mjs";',
    "lib/bridge.mjs": 'export { value } from "./server.mjs";',
    "lib/server.mjs": 'export const value = process.env.SUPABASE_SERVICE_ROLE_KEY;',
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.match(auditBoundaries(root).join("\n"), /client import graph reaches a server credential/);
});

test("isolated client modules pass", (t) => {
  const root = fixture({
    "app/widget.jsx": '"use client";\nimport { value } from "../lib/safe.mjs";',
    "lib/safe.mjs": 'export const value = "blindboxai";',
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(auditBoundaries(root), []);
});
