/**
 * labubu-validate.mjs
 *
 * Validates all Labubu data and generated output before publish.
 * Exits with code 1 and descriptive errors if any check fails.
 *
 * Usage:
 *   node scripts/labubu-validate.mjs [--output-dir output/labubu]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ─── Config ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const outputDirArg = args[args.indexOf("--output-dir") + 1];
const OUTPUT_DIR = path.resolve(ROOT, outputDirArg ?? "output/labubu");
const SERIES_DIR = path.join(ROOT, "data", "series");
const PRICING_FILE = path.join(ROOT, "data", "labubu-market-pricing.json");

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

const REQUIRED_CSV_HEADERS = [
  "post_type",
  "series_slug",
  "series_name",
  "platform",
  "text",
  "image_url",
  "scheduled_at",
];

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
  /AKIA[0-9A-Z]{16}/,           // AWS access key
  /sk-[A-Za-z0-9]{32,}/,        // OpenAI / Stripe
  /ghp_[A-Za-z0-9]{36}/,        // GitHub personal token
  /xoxb-[0-9]+-[A-Za-z0-9]+/,  // Slack bot token
  /Bearer\s+[A-Za-z0-9\-_]{20,}/, // Generic bearer token
];

// Placeholder link patterns
const PLACEHOLDER_LINK_PATTERNS = [
  /https?:\/\/example\.com/i,
  /https?:\/\/placeholder/i,
  /YOUR_LINK_HERE/i,
  /INSERT_URL/i,
];

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
  // Parse the full text character-by-character so multi-line quoted fields work.
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
          // Escaped quote
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

    // Not in quote
    if (ch === '"') {
      inQuote = true;
      i++;
      continue;
    }

    if (ch === ",") {
      cells.push(cell);
      cell = "";
      i++;
      continue;
    }

    if (ch === "\r" && text[i + 1] === "\n") {
      cells.push(cell);
      cell = "";
      rows.push(cells);
      cells = [];
      i += 2;
      continue;
    }

    if (ch === "\n") {
      cells.push(cell);
      cell = "";
      rows.push(cells);
      cells = [];
      i++;
      continue;
    }

    cell += ch;
    i++;
  }

  // Flush last row
  if (cell !== "" || cells.length > 0) {
    cells.push(cell);
    if (cells.some((c) => c !== "")) rows.push(cells);
  }

  if (rows.length === 0) return { headers: [], rows: [] };

  const headers = rows[0];
  const dataRows = rows.slice(1).map((rowCells) => {
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = rowCells[idx] ?? "";
    });
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

    if (!Array.isArray(data.figures) || data.figures.length === 0) {
      error(`${slug}: figures array is empty or missing`);
    }

    if (errors.length === errorsBefore) {
      pass(`Series file OK: ${slug}`);
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

      // If status is 'verified', all price fields must be present
      if (variant.status === "verified") {
        if (!variant.price_low || !variant.price_median || !variant.price_high) {
          error(
            `Verified variant '${variant.variant}' in '${series.series}' is missing price fields`,
          );
        }
        if (!variant.source) {
          error(
            `Verified variant '${variant.variant}' in '${series.series}' must have a source`,
          );
        }
        if (!variant.checked_at) {
          error(
            `Verified variant '${variant.variant}' in '${series.series}' must have checked_at`,
          );
        }
        if (!variant.sample_size || variant.sample_size < 2) {
          warn(
            `Verified variant '${variant.variant}' in '${series.series}' has sample_size < 2 — recommend more data`,
          );
        }
      }
    }
  }

  pass("Pricing file structure OK");
}

function checkCSVOutput() {
  console.log("\n📄 Checking Buffer CSV output…");

  const csvPath = path.join(OUTPUT_DIR, "buffer-schedule.csv");
  if (!fs.existsSync(csvPath)) {
    error(`Missing Buffer CSV: ${csvPath}`);
    return;
  }

  const text = fs.readFileSync(csvPath, "utf8");
  const { headers, rows } = parseCSV(text);

  // Required headers
  for (const required of REQUIRED_CSV_HEADERS) {
    if (!headers.includes(required)) {
      error(`CSV missing required header: ${required}`);
    }
  }

  if (rows.length === 0) {
    error("CSV has no data rows");
    return;
  }

  const now = new Date();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const label = `Row ${i + 2}`;

    // Disclosure check
    if (!row.text?.includes(DISCLOSURE_PREFIX)) {
      error(`${label}: missing EPN disclosure. text must include: "${DISCLOSURE_PREFIX}"`);
    }

    // Prohibited phrases
    for (const phrase of PROHIBITED_PHRASES) {
      if (row.text?.toLowerCase().includes(phrase.toLowerCase())) {
        error(`${label}: prohibited phrase found: "${phrase}"`);
      }
    }

    // Placeholder links
    for (const pattern of PLACEHOLDER_LINK_PATTERNS) {
      if (pattern.test(row.text ?? "")) {
        error(`${label}: placeholder link found in post text`);
      }
    }

    // Secret patterns
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(row.text ?? "")) {
        error(`${label}: possible secret/token found in post text`);
      }
    }

    // Date must not be in the past
    if (row.scheduled_at) {
      const scheduled = new Date(row.scheduled_at);
      if (isNaN(scheduled.getTime())) {
        error(`${label}: invalid scheduled_at date: ${row.scheduled_at}`);
      } else if (scheduled < now) {
        error(`${label}: scheduled_at date is in the past: ${row.scheduled_at}`);
      }
    } else {
      warn(`${label}: scheduled_at is empty`);
    }

    // Required fields present
    for (const field of REQUIRED_CSV_HEADERS) {
      if (field === "image_url" || field === "figure_name") continue; // Optional
      if (!row[field] || row[field].trim() === "") {
        error(`${label}: required CSV field '${field}' is empty`);
      }
    }
  }

  // Check for accidentally embedded secrets in entire CSV
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      error("Possible secret/token pattern found in CSV output file");
    }
  }

  pass(`CSV output OK — ${rows.length} rows`);
}

function checkVideoManifest() {
  console.log("\n🎬 Checking scheduled video manifest…");

  const manifestPath = path.join(OUTPUT_DIR, "video-manifest-scheduled.json");
  if (!fs.existsSync(manifestPath)) {
    warn(`Video manifest not found (optional): ${manifestPath}`);
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (e) {
    error(`Invalid JSON in video manifest: ${e.message}`);
    return;
  }

  const now = new Date();
  const REQUIRED_VIDEO_FIELDS = ["id", "videoPath", "seriesSlug", "title", "caption", "cta", "targetChannels"];

  for (const video of manifest.videos ?? []) {
    for (const field of REQUIRED_VIDEO_FIELDS) {
      if (!video[field]) {
        error(`Video '${video.id ?? "unknown"}' missing required field '${field}'`);
      }
    }

    if (video.scheduledTime) {
      const scheduled = new Date(video.scheduledTime);
      if (isNaN(scheduled.getTime())) {
        error(`Video '${video.id}': invalid scheduledTime: ${video.scheduledTime}`);
      } else if (scheduled < now) {
        error(`Video '${video.id}': scheduledTime is in the past: ${video.scheduledTime}`);
      }
    }
  }

  pass("Video manifest OK");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log("🔍 Labubu Automation — Validation\n");
console.log(`Output directory: ${OUTPUT_DIR}`);

checkSeriesFiles();
checkPricingFile();
checkCSVOutput();
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
