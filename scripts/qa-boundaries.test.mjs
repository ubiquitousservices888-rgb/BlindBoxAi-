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

test("CommonJS client imports cannot reach server credentials", (t) => {
  const root = fixture({
    "app/widget.jsx": '"use client";\nconst server = require("../lib/server.mjs");',
    "lib/server.mjs": 'export const value = process.env.SUPABASE_SERVICE_ROLE_KEY;',
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.match(auditBoundaries(root).join("\n"), /client import graph reaches a server credential/);
});

test("public API keys are rejected before a client bundle is built", (t) => {
  for (const name of ["NEXT_PUBLIC_OPENAI_API_KEY", "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY"]) {
    const root = fixture({ "app/widget.jsx": `export const key = process.env.${name};` });
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    assert.match(auditBoundaries(root).join("\n"), /exposes a server credential through NEXT_PUBLIC_/);
  }
});

test("Node built-ins cannot cross a client import graph", (t) => {
  const root = fixture({
    "app/widget.jsx": '"use client";\nimport { value } from "../lib/bridge.mjs";',
    "lib/bridge.mjs": 'import path from "path";\nexport const value = path.sep;',
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.match(auditBoundaries(root).join("\n"), /client import graph reaches a Node-only module/);
});

test("isolated client modules pass", (t) => {
  const root = fixture({
    "app/widget.jsx": '"use client";\nimport { value } from "../lib/safe.mjs";',
    "lib/safe.mjs": 'export const value = "blindboxai";',
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(auditBoundaries(root), []);
});
