import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { generateLabubuOutputs, AFFILIATE_DISCLOSURE } from "./labubu-post-generator.mjs";
import { validate } from "./labubu-validate.mjs";

const repoRoot = process.cwd();
const baseDir = path.join(repoRoot, "data", "labubu");

function readCsv(filePath) {
  const text = fs.readFileSync(filePath, "utf8").trim();
  const [headerLine, ...rows] = text.split(/\r?\n/);
  return { headerLine, rows };
}

test("generator emits per-channel Buffer CSV files with required headers and disclosure", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "labubu-gen-"));
  const startAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const result = generateLabubuOutputs({ baseDir, outDir: tmpDir, startAt });

  assert.equal(result.outputs.length, 5);

  for (const output of result.outputs) {
    assert.ok(fs.existsSync(output.filePath));
    const { headerLine, rows } = readCsv(output.filePath);

    if (output.channel === "pinterest") {
      assert.equal(headerLine, "Text,Image URL,Tags,Posting Time,Board Name");
    } else {
      assert.equal(headerLine, "Text,Image URL,Tags,Posting Time");
    }

    assert.ok(rows.length > 0);
    assert.ok(rows.every((row) => row.includes(AFFILIATE_DISCLOSURE)));
  }

  const payload = JSON.parse(fs.readFileSync(path.join(tmpDir, "labubu-buffer-video-api-payloads.json"), "utf8"));
  assert.equal(payload.publish_path, "buffer_api_video");
  assert.ok(payload.note.includes("CSV upload is text+image only"));
});

test("validator succeeds in CI mode against generated outputs", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "labubu-val-"));
  generateLabubuOutputs({
    baseDir,
    outDir: tmpDir,
    startAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  });

  const result = await validate({
    baseDir,
    generatedDir: tmpDir,
    skipLiveUrlChecks: true,
    ci: true,
  });

  assert.equal(result.errors.length, 0, result.errors.join("\n"));
});
