/**
 * labubu-validate.mjs
 *
 * Validates all Labubu data and generated output before publish.
 * Exits with code 1 and descriptive errors if any check fails.
 *
 * Usage:
 *   node scripts/labubu-validate.mjs [--output-dir output/labubu] [--skip-url-check]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ─── Config ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const outputDirIdx = args.indexOf("--output-dir");
const outputDirArg = outputDirIdx >= 0 ? args[outputDirIdx + 1] : undefined;
const OUTPUT_DIR = path.resolve(ROOT, outputDirArg ?? "output/labubu");
const SKIP_URL_CHECK = args.includes("--skip-url-check");
const SERIES_DIR = path.join(ROOT, "data", "series");
const PRICING_FILE = path.join(ROOT, "data", "labubu-market-pricing.json");
const VIDEO_MANIFEST_FILE = path.join(ROOT, "data", "labubu-video-manifest.json");

const LABUBU_SLUGS = [
  "labubu-the-monsters-exciting-macaron",
  "labubu-the-monsters-have-a-seat",
  "labubu-the-monsters-big-into-energy",
  "labubu-the-monsters-hair-salon",
  "labubu-sanrio-collaboration",
];

const REQUIRED_SERIES_FIELDS = ["slug", "name", "brand", "retailUSD", "figures", "seriesPageUrl"];

const REQUIRED_PRICING_VARIANT_FIELDS = [
  "variant",
  "rarity",
  "price_low",
  "price_median",
  "price_high",
  "sample_size",
  "checked_at",
  "source",
  "status",
];

// Buffer official CSV headers (exact case-sensitive)
const BUFFER_CSV_HEADERS_BASE = ["Text", "Image URL", "Tags", "Posting Time"];
const BUFFER_CSV_HEADERS_PINTEREST = ["Text", "Image URL", "Tags", "Posting Time", "Board Name"];

// Per-channel CSV files produced by the generator
const CHANNEL_CSV_FILES = {
  tiktok:    "buffer-tiktok.csv",
  instagram: "buffer-instagram.csv",
  facebook:  "buffer-facebook.csv",
  x:         "buffer-x.csv",
  pinterest: "buffer-pinterest.csv",
};

const DISCLOSURE_PREFIX = "#ad BlindBoxAI may earn a commission";

const PROHIBITED_PHRASES = [
  "verified seller",
  "authentic seller",
  "guaranteed authentic",
  "100% real",
  "scam",
  "counterfeit seller",
  "fake seller",
];

// Secret patterns — checks output only for accidentally leaked secrets
const SECRET_PATTERNS = [
  /AKIA[0-9A-Z]{16}/,            // AWS access key
  /sk-[A-Za-z0-9]{32,}/,         // OpenAI / Stripe
  /ghp_[A-Za-z0-9]{36}/,         // GitHub personal token
  /xoxb-[0-9]+-[A-Za-z0-9]+/,   // Slack bot token
  /Bearer\s+[A-Za-z0-9\-_]{20,}/, // Generic bearer token
];

// Placeholder link patterns (also checks video manifest videoUrl placeholders)
const PLACEHOLDER_LINK_PATTERNS = [
  /https?:\/\/example\.com/i,
  /https?:\/\/placeholder/i,
  /YOUR_LINK_HERE/i,
  /INSERT_URL/i,
  /REPLACE_WITH_HOSTED_VIDEO_URL/i,
];

// Posting Time format: YYYY-MM-DD HH:mm
const POSTING_TIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

let errors = [];
let warnings = [];

function error(msg) {
  errors.push(msg);
  console.error(`  ❌ ${msg}`);
}

function warn(msg) {
  warnings.push(msg);
  console.warn(`  ⚠️  ${msg}`);
}

function pass(msg) {
  console.log(`  ✅ ${msg}`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCSV(text) {
  const rows = [];
  let cells = [];
  let cell = "";
  let inQuote = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        } else {
          inQuote = false;
          i++;
          continue;
        }
      } else {
        cell += ch;
        i++;
        continue;
      }
    }

    if (ch === '"') { inQuote = true; i++; continue; }
    if (ch === ",") { cells.push(cell); cell = ""; i++; continue; }

    if (ch === "\r" && text[i + 1] === "\n") {
      cells.push(cell); cell = ""; rows.push(cells); cells = []; i += 2; continue;
    }

    if (ch === "\n") {
      cells.push(cell); cell = ""; rows.push(cells); cells = []; i++; continue;
    }

    cell += ch;
    i++;
  }

  if (cell !== "" || cells.length > 0) {
    cells.push(cell);
    if (cells.some((c) => c !== "")) rows.push(cells);
  }

  if (rows.length === 0) return { headers: [], rows: [] };

  const headers = rows[0];
  const dataRows = rows.slice(1).map((rowCells) => {
    const row = {};
    headers.forEach((h, idx) => { row[h] = rowCells[idx] ?? ""; });
    return row;
  });

  return { headers, rows: dataRows };
}

// ─── Checks ───────────────────────────────────────────────────────────────────

function checkSeriesFiles() {
  console.log("\n📋 Checking series data files…");

  for (const slug of LABUBU_SLUGS) {
    const file = path.join(SERIES_DIR, `${slug}.json`);
    if (!fs.existsSync(file)) {
      error(`Missing series file: ${file}`);
      continue;
    }

    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      error(`Invalid JSON in ${file}: ${e.message}`);
      continue;
    }

    const errorsBefore = errors.length;

    for (const field of REQUIRED_SERIES_FIELDS) {
      if (data[field] === undefined || data[field] === null) {
        error(`${slug}: missing required field '${field}'`);
      }
    }

    if (data.seriesPageUrl && data.seriesPageUrl.includes("example.com")) {
      error(`${slug}: seriesPageUrl contains placeholder domain`);
    }

    if (!data.seriesPageUrl?.startsWith("https://")) {
      error(`${slug}: seriesPageUrl must start with https://`);
    }

    if (!Array.isArray(data.figures) || data.figures.length === 0) {
      error(`${slug}: figures array is empty or missing`);
    }

    // _dataQuality checks for factual fields
    if (!data._dataQuality?.retailUSD?.status) {
      warn(`${slug}: _dataQuality.retailUSD.status missing — retail price will not be emitted`);
    }

    if (errors.length === errorsBefore) {
      pass(`Series file OK: ${slug}`);
    }
  }
}

async function checkSeriesPageUrls() {
  if (SKIP_URL_CHECK) {
    console.log("\n🔗 URL check skipped (--skip-url-check)");
    return;
  }
  console.log("\n🔗 Validating series page URLs…");

  for (const slug of LABUBU_SLUGS) {
    const file = path.join(SERIES_DIR, `${slug}.json`);
    if (!fs.existsSync(file)) continue;
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const url = data.seriesPageUrl;
    if (!url) { error(`${slug}: seriesPageUrl is missing`); continue; }

    try {
      const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(10000) });
      if (!res.ok) {
        error(`${slug}: seriesPageUrl returned HTTP ${res.status}: ${url}`);
      } else {
        pass(`URL resolves (${res.status}): ${url}`);
      }
    } catch (e) {
      error(`${slug}: seriesPageUrl failed to fetch: ${url} — ${e.message}`);
    }
  }
}

function checkPricingFile() {
  console.log("\n💰 Checking market pricing file…");

  if (!fs.existsSync(PRICING_FILE)) {
    error(`Missing pricing file: ${PRICING_FILE}`);
    return;
  }

  let pricing;
  try {
    pricing = JSON.parse(fs.readFileSync(PRICING_FILE, "utf8"));
  } catch (e) {
    error(`Invalid JSON in pricing file: ${e.message}`);
    return;
  }

  if (!Array.isArray(pricing.series)) {
    error("Pricing file missing 'series' array");
    return;
  }

  for (const series of pricing.series) {
    for (const variant of series.variants ?? []) {
      for (const field of REQUIRED_PRICING_VARIANT_FIELDS) {
        if (variant[field] === undefined) {
          error(`Pricing variant '${variant.variant}' in '${series.series}' missing field '${field}'`);
        }
      }

      if (variant.status === "verified") {
        if (!variant.price_low || !variant.price_median || !variant.price_high) {
          error(`Verified variant '${variant.variant}' in '${series.series}' is missing price fields`);
        }
        if (!variant.source) {
          error(`Verified variant '${variant.variant}' in '${series.series}' must have a source`);
        }
        if (!variant.checked_at) {
          error(`Verified variant '${variant.variant}' in '${series.series}' must have checked_at`);
        }
        if (!variant.sample_size || variant.sample_size < 2) {
          warn(`Verified variant '${variant.variant}' in '${series.series}' has sample_size < 2`);
        }
      }
    }
  }

  pass("Pricing file structure OK");
}

function checkChannelCSV(channel, filename) {
  const csvPath = path.join(OUTPUT_DIR, filename);
  if (!fs.existsSync(csvPath)) {
    // Instagram and Pinterest are required (need images); others are expected
    if (channel === "instagram" || channel === "pinterest") {
      warn(`${channel} CSV not found (may have no qualifying posts with Image URL): ${csvPath}`);
    } else {
      warn(`${channel} CSV not found: ${csvPath}`);
    }
    return;
  }

  const text = fs.readFileSync(csvPath, "utf8");
  const { headers, rows } = parseCSV(text);

  const expectedHeaders = channel === "pinterest" ? BUFFER_CSV_HEADERS_PINTEREST : BUFFER_CSV_HEADERS_BASE;

  // Verify exact Buffer CSV headers (case-sensitive)
  for (const required of expectedHeaders) {
    if (!headers.includes(required)) {
      error(`${channel} CSV missing required Buffer header: '${required}' (found: ${JSON.stringify(headers)})`);
    }
  }

  if (rows.length === 0) {
    warn(`${channel} CSV has no data rows`);
    return;
  }

  const now = new Date();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const label = `${channel} Row ${i + 2}`;

    // Text / disclosure
    if (!row["Text"]?.includes(DISCLOSURE_PREFIX)) {
      error(`${label}: missing EPN disclosure in Text`);
    }

    // Prohibited phrases
    for (const phrase of PROHIBITED_PHRASES) {
      if (row["Text"]?.toLowerCase().includes(phrase.toLowerCase())) {
        error(`${label}: prohibited phrase found: "${phrase}"`);
      }
    }

    // Placeholder links
    for (const pattern of PLACEHOLDER_LINK_PATTERNS) {
      if (pattern.test(row["Text"] ?? "")) {
        error(`${label}: placeholder link found in post text`);
      }
    }

    // Secret patterns
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(row["Text"] ?? "")) {
        error(`${label}: possible secret/token found in post text`);
      }
    }

    // Instagram requires Image URL
    if (channel === "instagram" && !row["Image URL"]) {
      error(`${label}: Instagram post missing required Image URL`);
    }

    // Pinterest requires Board Name
    if (channel === "pinterest" && !row["Board Name"]) {
      error(`${label}: Pinterest post missing required Board Name`);
    }

    // Posting Time: must be YYYY-MM-DD HH:mm and in the future.
    // The format lacks a timezone designator; Buffer interprets it as the
    // account's local timezone. For validation we parse it as local time
    // by rewriting "YYYY-MM-DD HH:mm" → "YYYY-MM-DDTHH:mm:00" (ISO 8601
    // local form), which all modern JS engines consistently parse as local.
    const postingTime = row["Posting Time"];
    if (!postingTime || postingTime.trim() === "") {
      warn(`${label}: Posting Time is empty`);
    } else if (!POSTING_TIME_RE.test(postingTime.trim())) {
      error(`${label}: Posting Time must be YYYY-MM-DD HH:mm format, got: ${postingTime}`);
    } else {
      const isoLocal = postingTime.trim().replace(" ", "T") + ":00";
      const scheduled = new Date(isoLocal);
      if (isNaN(scheduled.getTime())) {
        error(`${label}: invalid Posting Time: ${postingTime}`);
      } else if (scheduled < now) {
        error(`${label}: Posting Time is in the past: ${postingTime}`);
      }
    }
  }

  // Check for accidentally embedded secrets in entire CSV file
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      error(`Possible secret/token pattern found in ${channel} CSV output`);
    }
  }

  pass(`${channel} CSV OK — ${rows.length} rows`);
}

function checkAllChannelCSVs() {
  console.log("\n📄 Checking Buffer per-channel CSV files…");
  for (const [channel, filename] of Object.entries(CHANNEL_CSV_FILES)) {
    checkChannelCSV(channel, filename);
  }
}

function checkVideoManifest() {
  console.log("\n🎬 Checking video manifest…");

  if (!fs.existsSync(VIDEO_MANIFEST_FILE)) {
    warn(`Video manifest not found (optional): ${VIDEO_MANIFEST_FILE}`);
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(VIDEO_MANIFEST_FILE, "utf8"));
  } catch (e) {
    error(`Invalid JSON in video manifest: ${e.message}`);
    return;
  }

  const REQUIRED_VIDEO_FIELDS = ["id", "videoUrl", "seriesSlug", "title", "caption", "cta", "targetChannels"];

  for (const video of manifest.videos ?? []) {
    for (const field of REQUIRED_VIDEO_FIELDS) {
      if (!video[field]) {
        error(`Video '${video.id ?? "unknown"}' missing required field '${field}'`);
      }
    }

    // videoUrl must be a real hosted URL, not a local path
    if (video.videoUrl && !video.videoUrl.startsWith("https://")) {
      error(`Video '${video.id}': videoUrl must be a public https:// URL, got: ${video.videoUrl}`);
    }

    // EPN disclosure required in video caption
    if (video.caption && !video.caption.includes(DISCLOSURE_PREFIX)) {
      error(`Video '${video.id}': caption missing EPN disclosure: "${DISCLOSURE_PREFIX}"`);
    }

    // No placeholder paths
    for (const pattern of PLACEHOLDER_LINK_PATTERNS) {
      if (pattern.test(video.videoUrl ?? "")) {
        error(`Video '${video.id}': videoUrl is a placeholder`);
      }
    }

    // YouTube should not appear in targetChannels with a note that CSV can't handle it
    // (youtube_shorts is valid for Buffer API publishing only)
  }

  pass("Video manifest structure OK");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log("🔍 Labubu Automation — Validation\n");
console.log(`Output directory: ${OUTPUT_DIR}`);

checkSeriesFiles();
await checkSeriesPageUrls();
checkPricingFile();
checkAllChannelCSVs();
checkVideoManifest();

console.log("\n─────────────────────────────────────────────");

if (errors.length > 0) {
  console.error(`\n❌ Validation FAILED — ${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(1);
} else if (warnings.length > 0) {
  console.warn(`\n⚠️  Validation passed with ${warnings.length} warning(s)`);
  process.exit(0);
} else {
  console.log("\n✅ All checks passed");
  process.exit(0);
}
