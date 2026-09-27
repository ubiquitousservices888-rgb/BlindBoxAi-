import assert from "node:assert/strict";
import test from "node:test";

import { assertBlindBoxSupabaseOrigin, BLINDBOXAI_SUPABASE_ORIGIN } from "../lib/blindbox-supabase-boundary.mjs";

test("accepts only the dedicated project origin", () => {
  assert.equal(assertBlindBoxSupabaseOrigin(BLINDBOXAI_SUPABASE_ORIGIN), BLINDBOXAI_SUPABASE_ORIGIN);
  assert.equal(assertBlindBoxSupabaseOrigin(`${BLINDBOXAI_SUPABASE_ORIGIN}/`), BLINDBOXAI_SUPABASE_ORIGIN);
  for (const candidate of [
    "https://different-project.supabase.co",
    `${BLINDBOXAI_SUPABASE_ORIGIN}/rest/v1`,
    `${BLINDBOXAI_SUPABASE_ORIGIN}?query=x`,
    "https://user:pass@lazzdoadoqzrzlarerfx.supabase.co",
    "https://lazzdoadoqzrzlarerfx.supabase.co.evil.test",
  ]) {
    assert.throws(() => assertBlindBoxSupabaseOrigin(candidate), /dedicated BlindBoxAI project/);
  }
});

test("a local test service requires explicit ingest isolation", () => {
  const before = process.env.BLINDBOXAI_ALLOW_TEST_INGEST;
  try {
    delete process.env.BLINDBOXAI_ALLOW_TEST_INGEST;
    assert.throws(() => assertBlindBoxSupabaseOrigin("http://127.0.0.1:1234", { allowTestLoopback: true }));
    process.env.BLINDBOXAI_ALLOW_TEST_INGEST = "true";
    assert.equal(assertBlindBoxSupabaseOrigin("http://127.0.0.1:1234", { allowTestLoopback: true }), "http://127.0.0.1:1234");
    process.env.BLINDBOXAI_ALLOW_TEST_INGEST = " TRUE ";
    assert.equal(assertBlindBoxSupabaseOrigin("http://127.0.0.1:1234", { allowTestLoopback: true }), "http://127.0.0.1:1234");
    assert.throws(() => assertBlindBoxSupabaseOrigin("http://localhost:1234", { allowTestLoopback: true }));
    assert.throws(() => assertBlindBoxSupabaseOrigin("http://127.0.0.1:1234"));
  } finally {
    if (before === undefined) delete process.env.BLINDBOXAI_ALLOW_TEST_INGEST;
    else process.env.BLINDBOXAI_ALLOW_TEST_INGEST = before;
  }
});
