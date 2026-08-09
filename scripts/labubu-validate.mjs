import fs from "node:fs";
import path from "node:path";
import { AFFILIATE_DISCLOSURE, resolveVideoUrl } from "./labubu-post-generator.mjs";

const CHANNELS = ["tiktok", "instagram", "facebook", "x", "pinterest"];
const REQUIRED_HEADERS = {
  default: ["Text", "Image URL", "Tags", "Posting Time"],
  pinterest: ["Text", "Image URL", "Tags", "Posting Time", "Board Name"],
};
const MAX_VERIFIED_AGE_DAYS = 30;
const SECRET_PATTERNS = [
  /\bghp_[A-Za-z0-9]{20,}\b/,
  /\bsk_live_[A-Za-z0-9]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{15,}\b/,
  /\bBUFFER_API_TOKEN\s*=\s*[^\s]+/,
];
const PLACEHOLDER_PATTERNS = [
  /REPLACE_WITH_HOSTED_VIDEO_URL/i,
  /placeholder/i,
  /example\.com/i,
  /TODO/i,
];

function parseArgs(argv) {
  const options = {
    baseDir: path.join(process.cwd(), "data", "labubu"),
    generatedDir: path.join(process.cwd(), "data", "labubu", "generated"),
    skipLiveUrlChecks: false,
    ci: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base-dir") options.baseDir = path.resolve(argv[++i]);
    else if (arg === "--generated-dir") options.generatedDir = path.resolve(argv[++i]);
    else if (arg === "--skip-live-url-checks") options.skipLiveUrlChecks = true;
    else if (arg === "--ci") options.ci = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.ci) options.skipLiveUrlChecks = true;
  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readSeries(baseDir) {
  const seriesDir = path.join(baseDir, "series");
  return fs
    .readdirSync(seriesDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => readJson(path.join(seriesDir, file)));
}

function daysOld(isoDate) {
  const timestamp = new Date(isoDate).getTime();
  return (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

function parseCsvLine(line) {
  const out = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (insideQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === "," && !insideQuotes) {
      out.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  out.push(current);
  return out;
}

function parseCsv(content) {
  const lines = content.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
  return { headers, rows };
}

async function urlResolves(url) {
  const requestWithTimeout = async (method) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
      return await fetch(url, {
        method,
        redirect: "follow",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  };

  try {
    const response = await requestWithTimeout("HEAD");

    if (response.status >= 200 && response.status < 400) return true;

    const fallback = await requestWithTimeout("GET");

    return fallback.status >= 200 && fallback.status < 400;
  } catch {
    return false;
  }
}

function containsPattern(value, patterns) {
  return patterns.some((pattern) => pattern.test(value));
}

async function validate(options) {
  const errors = [];
  const warnings = [];
  const series = readSeries(options.baseDir);
  const market = readJson(path.join(options.baseDir, "market-pricing.json"));
  const videoManifest = readJson(path.join(options.baseDir, "video-manifest.json"));

  assert(market.status === "stale_seed_data", "market-pricing.json must remain stale_seed_data until independently verified.", errors);
  assert(market.pull_odds?.status === "unverified", "pull_odds must stay unverified until sourced and checked.", errors);

  for (const entry of series) {
    assert(entry.status === "verified", `${entry.slug}: status must be verified for publishable series.`, errors);
    assert(Boolean(entry.source?.name && entry.source?.url), `${entry.slug}: source.name and source.url are required.`, errors);
    assert(Boolean(entry.checked_at), `${entry.slug}: checked_at is required.`, errors);
    assert(daysOld(entry.checked_at) <= MAX_VERIFIED_AGE_DAYS, `${entry.slug}: checked_at is stale (>${MAX_VERIFIED_AGE_DAYS} days).`, errors);

    assert(Boolean(entry.series_page_url?.startsWith("https://")), `${entry.slug}: series_page_url must be https URL.`, errors);
    assert(Boolean(entry.cta_url?.startsWith("https://")), `${entry.slug}: cta_url must be https URL.`, errors);
    assert(Boolean(entry.media?.image_url?.startsWith("https://")), `${entry.slug}: media.image_url must be https URL.`, errors);
    assert(Boolean(entry.media?.thumbnail_url?.startsWith("https://")), `${entry.slug}: media.thumbnail_url must be https URL.`, errors);

    const serialised = JSON.stringify(entry);
    assert(!containsPattern(serialised, PLACEHOLDER_PATTERNS), `${entry.slug}: contains placeholder-like content.`, errors);

    if (!options.skipLiveUrlChecks) {
      const targets = [entry.series_page_url, entry.cta_url, entry.media.image_url, entry.media.thumbnail_url];
      for (const target of targets) {
        // eslint-disable-next-line no-await-in-loop
        const live = await urlResolves(target);
        assert(live, `${entry.slug}: URL does not resolve (${target}).`, errors);
      }
    }
  }

  const videoBaseUrl = process.env[videoManifest.video_base_url_env || "BLINDBOXAI_VIDEO_BASE_URL"] || "";
  for (const entry of videoManifest.entries || []) {
    assert(entry.status === "verified", `${entry.slug}: video manifest entries must be verified.`, errors);
    assert(Boolean(entry.video_path), `${entry.slug}: video_path is required.`, errors);

    const resolved = resolveVideoUrl(videoBaseUrl, entry.video_path);
    if (!resolved) warnings.push(`${entry.slug}: BLINDBOXAI_VIDEO_BASE_URL not set; API payload will remain blocked.`);
    if (resolved && !resolved.startsWith("https://")) {
      errors.push(`${entry.slug}: resolved video URL must be https (${resolved}).`);
    }
  }

  for (const channel of CHANNELS) {
    const csvPath = path.join(options.generatedDir, `labubu-buffer-${channel}.csv`);
    assert(fs.existsSync(csvPath), `Missing generated CSV: ${csvPath}`, errors);
    if (!fs.existsSync(csvPath)) continue;

    const csvText = fs.readFileSync(csvPath, "utf8");
    assert(!containsPattern(csvText, SECRET_PATTERNS), `${channel}: generated CSV appears to contain a secret/token.`, errors);

    const parsed = parseCsv(csvText);
    const requiredHeaders = channel === "pinterest" ? REQUIRED_HEADERS.pinterest : REQUIRED_HEADERS.default;
    assert(
      JSON.stringify(parsed.headers) === JSON.stringify(requiredHeaders),
      `${channel}: CSV headers must exactly be ${requiredHeaders.join(", ")}.`,
      errors,
    );

    for (const row of parsed.rows) {
      const text = row.Text || "";
      assert(text.includes(AFFILIATE_DISCLOSURE), `${channel}: missing required affiliate disclosure.`, errors);
      assert(!/youtube/i.test(text), `${channel}: post text must not reference YouTube.`, errors);
      assert(Boolean(row["Image URL"]?.startsWith("https://")), `${channel}: Image URL must be https.`, errors);
      assert(Boolean(row.Tags), `${channel}: Tags is required.`, errors);
      const postingDate = new Date(row["Posting Time"]);
      assert(!Number.isNaN(postingDate.getTime()), `${channel}: invalid Posting Time value.`, errors);
      assert(postingDate.getTime() > Date.now(), `${channel}: Posting Time must be in the future.`, errors);
      if (channel === "pinterest") {
        assert(Boolean(row["Board Name"]), "pinterest: Board Name is required.", errors);
      }
    }
  }

  const videoPayloadPath = path.join(options.generatedDir, "labubu-buffer-video-api-payloads.json");
  assert(fs.existsSync(videoPayloadPath), `Missing video payload file: ${videoPayloadPath}`, errors);

  if (fs.existsSync(videoPayloadPath)) {
    const payloadText = fs.readFileSync(videoPayloadPath, "utf8");
    assert(!containsPattern(payloadText, SECRET_PATTERNS), "video payload file appears to contain a secret/token.", errors);
    const payload = JSON.parse(payloadText);
    assert(payload.publish_path === "buffer_api_video", "video payload file must declare buffer_api_video path.", errors);
    for (const row of payload.payloads || []) {
      assert(Boolean(row.cta_url?.startsWith("https://")), `${row.slug}: payload cta_url must be https.`, errors);
      if (row.video_url) {
        assert(row.video_url.endsWith(".mp4"), `${row.slug}: video_url must point to an mp4 file.`, errors);
      }
    }
  }

  return { errors, warnings, checkedSeries: series.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs(process.argv);
  const result = await validate(options);

  if (result.warnings.length) {
    process.stdout.write(`${result.warnings.map((warning) => `WARN: ${warning}`).join("\n")}\n`);
  }

  if (result.errors.length) {
    process.stderr.write(`${result.errors.map((error) => `ERROR: ${error}`).join("\n")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`Validation passed for ${result.checkedSeries} series.\n`);
  }
}

export { validate };
