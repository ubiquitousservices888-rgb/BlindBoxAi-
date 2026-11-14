import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));
const workflowFiles = ["autonomous-video.yml", "gemini-video-stage.yml"];
const fixtureEnv = {
  PATH: "/usr/bin:/bin",
  ALLOW_MANUAL_VIDEO_RENDER: "true",
  ALLOW_GEMINI_VIDEO_RENDER: "true",
  GEMINI_API_KEY: "fixture-only",
  BLOB_READ_WRITE_TOKEN: "fixture-only",
};

function renderShell(workflow) {
  const match = workflow.match(/      - name: (?:Render verified video with production-quality provider|Generate production-quality draft)\n        shell: bash\n        run: \|\n([\s\S]*?)(?=\n      - name:)/);
  assert.ok(match, "The actual workflow render shell must be exercised");
  return match[1].split("\n").map((line) => line.replace(/^          /, "")).join("\n");
}

for (const filename of workflowFiles) {
  const workflow = fs.readFileSync(path.join(root, ".github/workflows", filename), "utf8");

  test(`${filename}: paid render job is unconditionally paused and Gemini access is removed`, () => {
    assert.match(workflow, /\n  render:\n(?:    #[^\n]*\n)*    if: \$\{\{ false \}\}\n/);
    assert.match(workflow, /ALLOW_GEMINI_VIDEO_RENDER:\s*"false"/);
    assert.doesNotMatch(workflow, /GEMINI_API_KEY|BLOB_READ_WRITE_TOKEN|GEMINI_VIDEO_RESOLUTION|video:gemini-stage/);
  });

  for (const primaryConfigured of [false, true]) {
    test(`${filename}: no Gemini command after ${primaryConfigured ? "a failed" : "an unconfigured"} primary renderer`, (t) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gemini-workflow-disabled-"));
      t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
      const calls = path.join(dir, "commands.log");
      // Every provider command is replaced by this local stub. No renderer runs.
      fs.writeFileSync(path.join(dir, "npm"), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$STUB_COMMAND_LOG"\nexit 1\n', { mode: 0o700 });
      const result = spawnSync("/bin/bash", ["-c", renderShell(workflow)], {
        cwd: dir,
        env: {
          ...fixtureEnv,
          PATH: `${dir}:/usr/bin:/bin`,
          STUB_COMMAND_LOG: calls,
          CREATOMATE_API_KEY: primaryConfigured ? "fixture-only" : "",
        },
        encoding: "utf8",
        timeout: 10000,
      });
      assert.ifError(result.error);
      assert.equal(result.status, 1);
      const commands = fs.existsSync(calls) ? fs.readFileSync(calls, "utf8") : "";
      assert.equal(commands, primaryConfigured ? "run video:daily\n" : "");
      assert.match(result.stdout, /Gemini fallback is disabled/);
      assert.doesNotMatch(result.stdout, /VIDEO_RENDER_PROVIDER=gemini|READY_FOR_REVIEW/);
    });
  }
}

test("legacy Gemini CLI rejects all old opt-ins before network, uploads or state writes", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gemini-cli-disabled-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const networkMarker = path.join(dir, "network-attempted");
  const stateFile = path.join(dir, "state.json");
  const preload = path.join(dir, "block-network.mjs");
  fs.writeFileSync(preload, `
    import fs from "node:fs";
    import net from "node:net";
    import http from "node:http";
    import https from "node:https";
    const blocked = () => {
      fs.writeFileSync(process.env.NETWORK_MARKER, "blocked");
      throw new Error("Network forbidden in this offline test");
    };
    globalThis.fetch = blocked;
    net.Socket.prototype.connect = blocked;
    http.request = http.get = https.request = https.get = blocked;
  `);
  const result = spawnSync(process.execPath, ["--import", preload, path.join(root, "scripts/gemini-video-stage.mjs")], {
    cwd: dir,
    env: {
      ...fixtureEnv,
      NETWORK_MARKER: networkMarker,
      VIDEO_STATE_FILE: stateFile,
      VIDEO_PRODUCTS_FILE: path.join(dir, "must-not-be-read.json"),
    },
    encoding: "utf8",
    timeout: 10000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Gemini rendering is disabled.*owner approval.*max-dollar/);
  assert.match(result.stderr, /No render or upload was attempted/);
  assert.equal(result.stdout, "");
  assert.equal(fs.existsSync(networkMarker), false, "No network or upload may be attempted");
  assert.equal(fs.existsSync(stateFile), false, "No render state may be created");
  assert.deepEqual(fs.readdirSync(dir), ["block-network.mjs"]);
});
