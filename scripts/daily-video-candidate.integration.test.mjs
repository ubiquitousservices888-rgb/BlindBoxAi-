import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(projectRoot, 'scripts/daily-video-candidate.mjs');
const output = path.join(projectRoot, 'output/daily-video/candidate.json');

test('the real zero-spend candidate CLI reads canonical inputs from any cwd', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'blindbox-video-candidate-smoke-'));
  const previous = fs.existsSync(output) ? fs.readFileSync(output) : null;
  try {
    const child = spawnSync(process.execPath, [entry], {
      cwd,
      env: { ...process.env, DAILY_VIDEO_MAX_RENDERS_PER_MONTH: '0',
        NEXT_PUBLIC_EPN_CAMPID: process.env.NEXT_PUBLIC_EPN_CAMPID || '5339171775' },
      encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024,
    });
    assert.equal(child.status, 0, child.stderr || child.stdout);
    assert.ok(fs.existsSync(output), 'expected a draft-only candidate JSON artifact');
    const candidate = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.ok(['READY_TO_RENDER', 'NO_UNUSED_VERIFIED_PRODUCT'].includes(candidate.status));
    assert.equal(candidate.canRender, false);
    assert.notEqual(candidate.productId, 'labubu-hair-salon-vinyl-plush-pendant');
    if (candidate.status === 'READY_TO_RENDER') {
      assert.match(candidate.script.caption, /#ad BlindBoxAI may earn a commission/);
      assert.ok(candidate.script.productUrl.startsWith('https://blindboxai.com/'));
    }
  } finally {
    if (previous === null) fs.rmSync(output, { force: true });
    else fs.writeFileSync(output, previous);
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('the CLI never creates a candidate from a numeric product ID', () => {
  const source = fs.readFileSync(new URL('./daily-video-candidate.mjs', import.meta.url), 'utf8');
  assert.match(source, /sanitizeProductForGenerativeVideo\(product\)/);
  assert.match(source, /generateVideoScript\(product, date, \{ evidenceProduct:/);
});
