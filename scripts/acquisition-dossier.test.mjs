import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(new URL("../.github/workflows/monthly-acquisition-dossier.yml", import.meta.url), "utf8");
const edge = fs.readFileSync(new URL("../supabase/functions/acquisition-dossier/index.ts", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../supabase/migrations/20260922123000_acquisition_dossiers.sql", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../app/api/owner/acquisition-dossier/route.js", import.meta.url), "utf8");

test("monthly dossier is owner-only and OIDC-generated", () => {
  assert.match(workflow, /cron: "23 4 2 \* \*"/);
  assert.match(workflow, /id-token: write/);
  assert.doesNotMatch(workflow, /SUPABASE_SERVICE_ROLE|OPENAI_API_KEY|BUFFER_API_TOKEN/);
  assert.match(edge, /blindboxai-acquisition-dossier/);
  assert.match(edge, /workflow_ref/);
  assert.match(route, /assertOwnerCode/);
  assert.doesNotMatch(route, /assertUploadCode/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all .* anon, authenticated/);
});

test("missing acquisition metrics remain no data", () => {
  assert.match(edge, /epnEarnings: noData\(\)/);
  assert.match(edge, /authenticityChecksByStatus: noData\(\)/);
  assert.match(edge, /publicUrl: noData\(\)/);
  assert.doesNotMatch(edge, /estimate|estimated/i);
});
