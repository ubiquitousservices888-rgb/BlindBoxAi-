import assert from "node:assert/strict";
import test from "node:test";

import { loadPrivateQuestionEvents } from "../lib/private-question-analytics.mjs";

const now = new Date("2026-09-17T08:00:00.000Z");

function jsonResponse(rows, status = 200) {
  return new Response(JSON.stringify(rows), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("Supabase reader requires server-side URL and service role credentials", async () => {
  await assert.rejects(
    () => loadPrivateQuestionEvents({ supabaseUrl: "", serviceRoleKey: "secret", now }),
    /SUPABASE_URL is required/,
  );
  await assert.rejects(
    () => loadPrivateQuestionEvents({ supabaseUrl: "https://example.supabase.co", serviceRoleKey: "", now }),
    /SUPABASE_SERVICE_ROLE_KEY is required/,
  );
});

test("Supabase query failure throws instead of returning an empty demand set", async () => {
  await assert.rejects(
    () => loadPrivateQuestionEvents({
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "server-only-secret",
      now,
      fetchImpl: async () => jsonResponse({ error: "denied" }, 403),
    }),
    /query failed with status 403/,
  );
});

test("reader applies lookback, stable newest-first ordering, pagination, mapping, and reverse return order", async () => {
  const requested = [];
  const pages = [
    [
      { id: "00000000-0000-0000-0000-000000000004", question_redacted: "What is HIRONO Mist Walker worth?", created_at: "2026-09-17T07:59:00.000Z", confidence: "high" },
      { id: "00000000-0000-0000-0000-000000000003", question_redacted: "How do I check a LABUBU for authenticity?", created_at: "2026-09-17T07:59:00.000Z", confidence: "medium" },
    ],
    [
      { id: "00000000-0000-0000-0000-000000000002", question_redacted: "   ", created_at: "2026-09-17T07:58:00.000Z", confidence: "low" },
      { id: "00000000-0000-0000-0000-000000000001", question_redacted: "Which SKULLPANDA series should I compare?", created_at: "2026-09-17T07:57:00.000Z", confidence: null },
    ],
  ];
  let call = 0;

  const result = await loadPrivateQuestionEvents({
    supabaseUrl: "https://example.supabase.co",
    serviceRoleKey: "server-only-secret",
    now,
    lookbackDays: 30,
    maxEvents: 3,
    fetchImpl: async (url, init) => {
      requested.push({ url: String(url), init });
      return jsonResponse(pages[call++] ?? []);
    },
  });

  assert.equal(result.lookbackDays, 30);
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.events.map((event) => event.question), [
    "Which SKULLPANDA series should I compare?",
    "How do I check a LABUBU for authenticity?",
    "What is HIRONO Mist Walker worth?",
  ]);
  assert.equal(result.events[0].recordedAt, "2026-09-17T07:57:00.000Z");
  assert.equal(result.events[2].answerMetadata.confidence, "high");

  const first = new URL(requested[0].url);
  assert.equal(first.searchParams.get("order"), "created_at.desc,id.desc");
  assert.equal(first.searchParams.get("offset"), "0");
  assert.equal(first.searchParams.get("limit"), "3");
  assert.match(first.searchParams.get("created_at"), /^gte\./);
  assert.equal(requested[0].init.headers.apikey, "server-only-secret");
  assert.equal(requested[0].init.headers.authorization, "Bearer server-only-secret");

  const second = new URL(requested[1].url);
  assert.equal(second.searchParams.get("offset"), "2");
  assert.equal(second.searchParams.get("limit"), "1");
});

test("maxEvents keeps the newest rows instead of the oldest rows in the lookback window", async () => {
  const result = await loadPrivateQuestionEvents({
    supabaseUrl: "https://example.supabase.co",
    serviceRoleKey: "server-only-secret",
    now,
    maxEvents: 2,
    fetchImpl: async () => jsonResponse([
      { id: "3", question_redacted: "Newest question", created_at: "2026-09-17T07:59:00.000Z", confidence: "high" },
      { id: "2", question_redacted: "Second newest question", created_at: "2026-09-17T07:58:00.000Z", confidence: "medium" },
    ]),
  });

  assert.deepEqual(result.events.map((event) => event.question), [
    "Second newest question",
    "Newest question",
  ]);
});

test("errors never include the service-role value", async () => {
  const secret = "do-not-print-this-service-role-secret";
  await assert.rejects(
    async () => {
      try {
        await loadPrivateQuestionEvents({
          supabaseUrl: "https://example.supabase.co",
          serviceRoleKey: secret,
          now,
          fetchImpl: async () => { throw new Error(`network failed ${secret}`); },
        });
      } catch (error) {
        assert.doesNotMatch(String(error?.message), new RegExp(secret));
        throw error;
      }
    },
    /Supabase private question query failed/,
  );
});
