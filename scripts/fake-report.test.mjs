import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route=fs.readFileSync(new URL("../app/api/research/fake-report/route.js",import.meta.url),"utf8");
const edge=fs.readFileSync(new URL("../supabase/functions/fake-report-ingest/index.ts",import.meta.url),"utf8");
const migration=fs.readFileSync(new URL("../supabase/migrations/20260922124500_fake_report_intake.sql",import.meta.url),"utf8");
const page=fs.readFileSync(new URL("../app/ask/page.jsx",import.meta.url),"utf8");

test("fake reports are private and never auto-publish",()=>{
  assert.match(migration,/enable row level security/);
  assert.match(migration,/public, false/);
  assert.match(edge,/status:"pending_owner_review"/);
  assert.match(edge,/authenticity_tier:null/);
  assert.doesNotMatch(edge,/publish|published|Buffer|youtube|tiktok/i);
});

test("fake report storage omits personal identifiers",()=>{
  for(const source of [route,edge,migration]){
    assert.doesNotMatch(source,/\bemail\b|\buser[_-]?agent\b|\breferrer\b|\bx-forwarded-for\b|\bip_address\b/i);
  }
  assert.match(page,/store no name, email, IP address, user-agent, or referrer/i);
});
