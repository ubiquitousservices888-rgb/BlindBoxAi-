// CI contract: scanner stays research-only, bounded, seller-free, and heartbeat-covered.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { assertCallBudget, flagIdentifierMismatch, FLAG_TTL_MS } from "../lib/mislisting-scanner-core.mjs";

test("identifier mismatch is detected",()=>{
  const flag=flagIdentifierMismatch(
    {id:"mew-152",expectedIdentifier:"152",conflictingIdentifiers:["158"]},
    {itemId:"v1|1|0",title:"Pokemon 30th Mew ex #158",price:{value:"199.99",currency:"USD"}}
  );
  assert.equal(flag?.reason,"identifier_mismatch: expected 152; found 158");
});
test("matching listing is not flagged",()=>{
  const flag=flagIdentifierMismatch(
    {id:"mew-152",expectedIdentifier:"152",conflictingIdentifiers:["158"]},
    {itemId:"v1|1|0",title:"Pokemon 30th Mew ex #152",price:{value:"199.99",currency:"USD"}}
  );
  assert.equal(flag,null);
});
test("Browse call budget is capped below account default",()=>{
  assert.equal(assertCallBudget(new Array(500).fill({})),500);
  assert.throws(()=>assertCallBudget(new Array(501).fill({})),/budget exceeded/i);
});
test("listing flags expire in six hours",()=>assert.equal(FLAG_TTL_MS,6*60*60*1000));
test("seller field is never persisted",()=>{
  const migration=fs.readFileSync(new URL("../supabase/migrations/20260922130000_mislisting_scanner.sql",import.meta.url),"utf8");
  const edge=fs.readFileSync(new URL("../supabase/functions/mislisting-scanner-ingest/index.ts",import.meta.url),"utf8");
  const scanner=fs.readFileSync(new URL("../scripts/mislisting-scanner.mjs",import.meta.url),"utf8");
  assert.doesNotMatch(migration,/seller/i);
  assert.doesNotMatch(edge,/seller/i);
  assert.doesNotMatch(scanner,/seller/i);
});
test("scanner is research-only and heartbeat checks it",()=>{
  const workflow=fs.readFileSync(new URL("../.github/workflows/mislisting-scanner.yml",import.meta.url),"utf8");
  const heartbeat=fs.readFileSync(new URL("../.github/workflows/heartbeat.yml",import.meta.url),"utf8");
  assert.match(workflow,/cron: "29 5 \* \* \*"/);
  assert.doesNotMatch(workflow,/publish|Buffer|youtube|tiktok/i);
  assert.match(heartbeat,/mislisting-scanner\.yml/);
  assert.match(heartbeat,/cron: "41 \*\/6 \* \* \*"/);
});
