#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { FUNNEL_EVENTS, isProductionEvent } from "../../lib/funnel-events.mjs";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 10000;
const directory = path.dirname(fileURLToPath(import.meta.url));
const childEnvironment = () => ({ PATH: process.env.PATH || "/usr/bin:/bin", LANG: "C", LC_ALL: "C" });
const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const identity = (value) => typeof value === "string" && value.length > 0 &&
  value === value.trim() && Buffer.byteLength(value) <= 512;
const encode = (value) => Buffer.from(value, "utf8").toString("hex");

function cents(value) {
  if (!["number", "string"].includes(typeof value)) return "X";
  const match = String(value).trim().match(/^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/);
  if (!match || match[1].length > 14) return "X";
  return String(BigInt(match[1]) * 100n + BigInt((match[2] || "").padEnd(2, "0")));
}

function normalize(input) {
  const snapshot = isRecord(input) && input.schema === "blindboxai.stuck-review-receipts/v1";
  const rows = snapshot ? input.rows : Array.isArray(input) ? input : input?.events;
  if (!Array.isArray(rows) || rows.length > MAX_ROWS) throw new Error("invalid_input_shape");
  const counts = { inputRows: rows.length, excludedNonProductionRows: 0, nonConversionRows: 0, invalidRows: 0 };
  const lines = [];
  rows.forEach((row, index) => {
    if (!isRecord(row)) { counts.invalidRows += 1; return; }
    if (snapshot) {
      if (!identity(row.research_run_id) || !isRecord(row.buffer_post_ids) ||
          (row.public_urls !== undefined && !isRecord(row.public_urls))) {
        counts.invalidRows += 1; return;
      }
      const postIds = row.buffer_post_ids;
      const urls = row.public_urls || {};
      const channels = [...new Set([...Object.keys(postIds), ...Object.keys(urls)])];
      if (channels.length === 0) { counts.invalidRows += 1; return; }
      for (const channel of channels) {
        if (!["youtube", "tiktok"].includes(channel)) { counts.invalidRows += 1; continue; }
        const postId = postIds[channel] ?? "";
        const url = urls[channel] ?? "";
        if ((postId !== "" && !identity(postId)) || (url !== "" && !identity(url))) {
          counts.invalidRows += 1; continue;
        }
        lines.push(["R", index, encode(row.research_run_id), encode(channel), encode(postId), encode(url)].join("\t"));
      }
      return;
    }
    if (!isProductionEvent(row)) { counts.excludedNonProductionRows += 1; return; }
    if (row.event !== FUNNEL_EVENTS.PROVIDER_CONVERSION) { counts.nonConversionRows += 1; return; }
    if (!identity(row.provider) || !identity(row.providerEvidenceId)) {
      counts.invalidRows += 1; return;
    }
    const validAttribution = row.customId === undefined || row.customId === null || row.customId === "" || identity(row.customId);
    const phase = validAttribution && ["provider_confirmed", "reconciled"].includes(row.status) ? "C" : "B";
    // The existing export field is explicitly USD. An explicit other currency blocks it.
    const currency = row.currency === undefined || row.currency === "USD" ? "USD" : "OTHER";
    lines.push(["E", index, encode(row.provider), encode(row.providerEvidenceId), phase,
      encode(validAttribution ? row.customId ?? "" : ""), currency, cents(row.confirmedRevenueUSD)].join("\t"));
  });
  return { counts, lines, inputType: snapshot ? "historical_review_receipts" : "funnel_events" };
}

export function createAuditor() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "blindbox-evidence-audit-"));
  const binary = path.join(temporary, "audit");
  const remove = () => fs.rmSync(temporary, { recursive: true, force: true });
  const compiled = spawnSync("c++", ["-std=c++17", "-O2", "-Wall", "-Wextra", "-Werror", "-pedantic",
    path.join(directory, "audit.cpp"), "-o", binary], {
    encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024, env: childEnvironment(),
  });
  if (compiled.error || compiled.status !== 0) { remove(); throw new Error("compiler_unavailable_or_failed"); }
  let closed = false;
  return {
    audit(input, { kind } = {}) {
      if (closed) throw new Error("auditor_closed");
      if (!["fixture", "export"].includes(kind)) throw new Error("explicit_evidence_kind_required");
      const normalized = normalize(input);
      const protocol = normalized.lines.join("\n") + (normalized.lines.length ? "\n" : "");
      if (Buffer.byteLength(protocol) > 20 * 1024 * 1024) throw new Error("normalized_input_too_large");
      const result = spawnSync(binary, [], {
        input: protocol, encoding: "utf8", timeout: 5000, maxBuffer: 4 * 1024 * 1024, env: childEnvironment(),
      });
      if (result.error || result.status !== 0) throw new Error("audit_execution_failed");
      return {
        schema: "blindboxai.offline-evidence-audit/v1",
        evidenceKind: kind,
        evidenceStatus: kind === "fixture" ? "FIXTURE_ONLY" : "UNVERIFIED_EXPORT",
        inputType: normalized.inputType,
        ...normalized.counts,
        analysis: JSON.parse(result.stdout),
        financialTruth: {
          providerAuthenticationVerified: false,
          livePublicationVerified: false,
          cashReceivedUSD: null,
          profitUSD: null,
        },
        readOnly: true,
      };
    },
    close() { if (!closed) { closed = true; remove(); } },
  };
}

function readInput(inputPath) {
  const fd = fs.openSync(inputPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error("input_must_be_small_regular_file");
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    for (;;) {
      const count = fs.readSync(fd, buffer, length, buffer.length - length, null);
      length += count;
      if (length > MAX_BYTES) throw new Error("input_too_large");
      if (count === 0) break;
    }
    const bytes = buffer.subarray(0, length);
    return { input: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
      inputSha256: createHash("sha256").update(bytes).digest("hex") };
  } finally { fs.closeSync(fd); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let auditor;
  try {
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== "--input" || args[2] !== "--kind" || !["fixture", "export"].includes(args[3])) {
      throw new Error("usage");
    }
    const { input, inputSha256 } = readInput(args[1]);
    auditor = createAuditor();
    console.log(JSON.stringify({ ...auditor.audit(input, { kind: args[3] }), inputSha256 }, null, 2));
  } catch {
    console.error("EVIDENCE_AUDIT: could not audit input. Requires C++17, a regular JSON file up to 5 MiB, and --input PATH --kind fixture|export. Input values are never printed in errors.");
    process.exitCode = 2;
  } finally { auditor?.close(); }
}
