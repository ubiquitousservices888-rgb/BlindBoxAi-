import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAuditTask, buildRunPayload, validSessionId } from './browser-use-blindbox-audit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policy = JSON.parse(await fs.readFile(path.join(ROOT, 'agents', 'blindbox-agent-memory.json'), 'utf8'));

test('audit task preserves read-only owner gates', () => {
  const task = buildAuditTask(policy);
  assert.match(task, /READ-ONLY/);
  assert.match(task, /UNTRUSTED CONTENT/);
  assert.match(task, /DO NOT perform any action requiring owner approval/);
  assert.match(task, /Do not submit questions or forms/);
  assert.match(task, /BLOCKED_BY_POLICY/);
  assert.match(task, /blindboxai\.com/);
  assert.match(task, /\/ask/);
  assert.match(task, /ebay\.com/);
  assert.match(task, /campid/);
  assert.match(task, /toolid/);
});

test('run payload has a spend cap and recording disabled', () => {
  const payload = buildRunPayload('test', { maxCostUsd: 0.25 });
  assert.equal(payload.maxCostUsd, 0.25);
  assert.deepEqual(payload.browserSettings, { record: false });
  assert.equal('sessionId' in payload, false);
});

test('valid prior Browser Use session is reused; invalid one is not', () => {
  const valid = '123e4567-e89b-42d3-a456-426614174000';
  assert.equal(validSessionId(valid), true);
  assert.equal(validSessionId('not-a-session'), false);
  assert.equal(buildRunPayload('test', { sessionId: valid }).sessionId, valid);
  assert.equal('sessionId' in buildRunPayload('test', { sessionId: 'not-a-session' }), false);
});
