import assert from "node:assert/strict";
import test from "node:test";

import { createMrKnowItAllHandler } from "../app/api/mr-know-it-all/route.js";
import { loadPrivateQuestionEvents } from "../lib/private-question-analytics.mjs";
import { recordKnowItAllQuestion } from "../lib/mr-know-it-all-store.mjs";

const now = new Date("2026-09-17T12:00:00.000Z");

function jsonResponse(rows, status = 200) {
  return new Response(JSON.stringify(rows), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function deterministicRow({ id, question, createdAt, confidence = null }) {
  return {
    id,
    question_redacted: question,
    created_at: createdAt,
    confidence,
    source_mode: "deterministic",
  };
}

test("route handler accepts an injected no-op recorder", async () => {
  let recorderCalls = 0;
  const handler = createMrKnowItAllHandler({
    recorder: async () => {
      recorderCalls += 1;
      return { stored: false, reason: "test_noop" };
    },
  });
  const response = await handler(new Request("https://www.blindboxai.com/api/mr-know-it-all", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://www.blindboxai.com" },
    body: JSON.stringify({ question: "Hirono Mist Walker" }),
  }));
  assert.equal(response.status, 200);
  assert.equal(recorderCalls, 1);
  const body = await response.json();
  assert.equal(body.researchStored, false);
});

test("mr:test makes zero ingest network calls without explicit opt-in", async () => {
  const previous = process.env.BLINDBOXAI_ALLOW_TEST_INGEST;
  delete process.env.BLINDBOXAI_ALLOW_TEST_INGEST;
  let calls = 0;
  try {
    const result = await recordKnowItAllQuestion({
      question: "Hirono Mist Walker",
      result: { matches: [], confidence: "low" },
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse({ ok: true }, 202);
      },
    });
    assert.equal(calls, 0);
    assert.equal(result.stored, false);
    assert.equal(result.reason, "test_recording_disabled");
  } finally {
    if (previous !== undefined) process.env.BLINDBOXAI_ALLOW_TEST_INGEST = previous;
  }
});

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

test("reader allowlists deterministic rows, excludes fixtures, and paginates past excluded rows", async () => {
  const requested = [];
  const fixtureFiller = Array.from({ length: 92 }, (_, index) => deterministicRow({
    id: `fixture-${index}`,
    question: "Hirono Mist Walker",
    createdAt: `2026-09-17T07:${String(50 - (index % 10)).padStart(2, "0")}:00.000Z`,
  }));
  const pages = [
    [
      deterministicRow({ id: "valid-3", question: "What is HIRONO Mist Walker worth?", createdAt: "2026-09-17T07:59:00.000Z", confidence: "high" }),
      deterministicRow({ id: "valid-2", question: "How do I check a LABUBU for authenticity?", createdAt: "2026-09-17T07:58:30.000Z", confidence: "medium" }),
      deterministicRow({ id: "owner-1", question: "Owner verification one", createdAt: "2026-09-17T10:27:05.239284+00:00" }),
      deterministicRow({ id: "owner-2", question: "Owner verification two", createdAt: "2026-09-17T10:27:30.679203+00:00" }),
      deterministicRow({ id: "fixture-hirono", question: "Hirono Mist Walker", createdAt: "2026-09-17T07:58:00.000Z" }),
      deterministicRow({ id: "fixture-buy", question: "Buy using my account right now", createdAt: "2026-09-17T07:57:30.000Z" }),
      deterministicRow({ id: "malformed", question: "   ", createdAt: "2026-09-17T07:57:00.000Z" }),
      { id: "tool-bot", question_redacted: "Automatic research seed", created_at: "2026-09-17T07:56:30.000Z", confidence: null, source_mode: "tool_bot_repeater" },
      ...fixtureFiller,
    ],
    [
      deterministicRow({ id: "valid-1", question: "Which SKULLPANDA series should I compare?", createdAt: "2026-09-17T07:56:00.000Z" }),
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
  assert.equal(result.excluded, 97);
  assert.deepEqual(result.events.map((event) => event.question), [
    "Which SKULLPANDA series should I compare?",
    "How do I check a LABUBU for authenticity?",
    "What is HIRONO Mist Walker worth?",
  ]);
  assert.equal(result.events[0].recordedAt, "2026-09-17T07:56:00.000Z");
  assert.equal(result.events[2].answerMetadata.confidence, "high");

  const first = new URL(requested[0].url);
  assert.equal(first.searchParams.get("source_mode"), "eq.deterministic");
  assert.match(first.searchParams.get("select"), /source_mode/);
  assert.equal(first.searchParams.get("order"), "created_at.desc,id.desc");
  assert.equal(first.searchParams.get("offset"), "0");
  assert.equal(first.searchParams.get("limit"), "100");
  assert.match(first.searchParams.get("created_at"), /^gte\./);
  assert.equal(requested[0].init.headers.apikey, "server-only-secret");
  assert.equal(requested[0].init.headers.authorization, "Bearer server-only-secret");

  const second = new URL(requested[1].url);
  assert.equal(second.searchParams.get("offset"), "100");
  assert.equal(second.searchParams.get("limit"), "100");
});

test("reader excludes all four owner verification timestamps without deleting rows", async () => {
  const result = await loadPrivateQuestionEvents({
    supabaseUrl: "https://example.supabase.co",
    serviceRoleKey: "server-only-secret",
    now,
    maxEvents: 1,
    fetchImpl: async () => jsonResponse([
      deterministicRow({ id: "owner-1", question: "Verification one", createdAt: "2026-09-17T10:27:05.239284+00:00" }),
      deterministicRow({ id: "owner-2", question: "Verification two", createdAt: "2026-09-17T10:27:30.679203+00:00" }),
      deterministicRow({ id: "owner-3", question: "Verification three", createdAt: "2026-09-17T10:27:33.251834+00:00" }),
      deterministicRow({ id: "owner-4", question: "Verification four", createdAt: "2026-09-17T10:35:23.502419+00:00" }),
      deterministicRow({ id: "human", question: "Which new blind box has real buyer interest?", createdAt: "2026-09-17T10:20:00.000Z", confidence: "medium" }),
    ]),
  });

  assert.equal(result.excluded, 4);
  assert.deepEqual(result.events.map((event) => event.question), ["Which new blind box has real buyer interest?"]);
});

test("maxEvents keeps the newest eligible rows instead of the oldest rows in the lookback window", async () => {
  const result = await loadPrivateQuestionEvents({
    supabaseUrl: "https://example.supabase.co",
    serviceRoleKey: "server-only-secret",
    now,
    maxEvents: 2,
    fetchImpl: async () => jsonResponse([
      deterministicRow({ id: "3", question: "Newest question", createdAt: "2026-09-17T07:59:00.000Z", confidence: "high" }),
      deterministicRow({ id: "2", question: "Second newest question", createdAt: "2026-09-17T07:58:00.000Z", confidence: "medium" }),
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
