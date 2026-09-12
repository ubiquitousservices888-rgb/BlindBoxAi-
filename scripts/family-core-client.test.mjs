import test from 'node:test';
import assert from 'node:assert/strict';
import { askFamilyCore } from '../lib/family-core-client.mjs';

test('requires https endpoint', async () => {
  await assert.rejects(
    () => askFamilyCore({ question: 'test', baseUrl: 'http://example.com', token: 'token', fetchImpl: async () => ({}) }),
    /must use https/
  );
});

test('keeps token in authorization header and out of body', async () => {
  let captured;
  const result = await askFamilyCore({
    question: 'research pokemon tcg demand',
    context: 'public evidence only',
    baseUrl: 'https://family.example.test',
    token: 'family-secret-token',
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return {
        ok: true,
        status: 200,
        async json() {
          return { status: 'READY_FOR_REVIEW', actionAuthority: 'none', synthesis: { content: 'review me' } };
        },
      };
    },
  });

  assert.equal(captured.url, 'https://family.example.test/api/council');
  assert.equal(captured.options.headers.Authorization, 'Bearer family-secret-token');
  assert.equal(captured.options.body.includes('family-secret-token'), false);
  assert.equal(result.status, 'READY_FOR_REVIEW');
});

test('fails closed on unexpected execution authority', async () => {
  await assert.rejects(
    () => askFamilyCore({
      question: 'test',
      baseUrl: 'https://family.example.test',
      token: 'token',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() { return { status: 'READY_FOR_REVIEW', actionAuthority: 'execute' }; },
      }),
    }),
    /unsafe or unexpected state/
  );
});
