/**
 * labubu-post-generator.mjs
 *
 * Converts validated Labubu market data into platform-specific social posts
 * and Buffer-ready per-channel CSV files for bulk scheduling.
 *
 * Usage:
 *   node scripts/labubu-post-generator.mjs [--skip-url-check]
 *
 * Output (one file per channel):
 *   output/labubu/buffer-instagram.csv
 *   output/labubu/buffer-pinterest.csv
 *   output/labubu/buffer-facebook.csv
 *   output/labubu/buffer-x.csv
 *   output/labubu/buffer-tiktok.csv
 *
 * NOTE: Buffer CSV bulk upload supports text + single-image posts only.
 * Videos/Reels cannot be bulk-uploaded via CSV. See docs for the video
 * publishing path (Buffer API with a publicly accessible MP4 URL).
 *
 * Rules enforced:
 *   - Never invent prices.
 *   - Only use values present in validated source data (status !== STALE_SEED_DATA).
 *   - EPN disclosure required on every post.
 *   - CTA directs to BlindBoxAI series page, not raw affiliate links.
 *   - seriesPageUrl must resolve successfully before a CTA is generated.
 *   - Unverified factual fields (retailUSD, pullOdds) are not emitted.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ─── Config ───────────────────────────────────────────────────────────────────

const SERIES_DIR = path.join(ROOT, "data", "series");
const PRICING_FILE = path.join(ROOT, "data", "labubu-market-pricing.json");
const OUTPUT_DIR = path.join(ROOT, "output", "labubu");

const args = process.argv.slice(2);
const SKIP_URL_CHECK = args.includes("--skip-url-check");

const LABUBU_SLUGS = [
  "labubu-the-monsters-exciting-macaron",
  "labubu-the-monsters-have-a-seat",
  "labubu-the-monsters-big-into-energy",
  "labubu-the-monsters-hair-salon",
  "labubu-sanrio-collaboration",
];

const DISCLOSURE = "#ad BlindBoxAI may earn a commission from qualifying purchases.";

// Buffer CSV bulk upload supports: TikTok, Instagram, Facebook, X, Pinterest.
// YouTube CANNOT be bulk-uploaded via Buffer CSV — video requires the Buffer API.
const CSV_CHANNELS = ["tiktok", "instagram", "facebook", "x", "pinterest"];

const PLATFORM_CHAR_LIMITS = {
  tiktok: 2200,
  instagram: 2200,
  facebook: 63206,
  x: 280,
  pinterest: 500,
};

// Pinterest board used for Labubu posts
const PINTEREST_BOARD = "Labubu & Blind Box Collector Guides";

// Buffer official CSV headers (case-sensitive)
// Instagram and Pinterest require Image URL.
// Pinterest uses Board Name as an additional column.
const BUFFER_CSV_HEADERS_BASE = ["Text", "Image URL", "Tags", "Posting Time"];
const BUFFER_CSV_HEADERS_PINTEREST = ["Text", "Image URL", "Tags", "Posting Time", "Board Name"];

// ─── Utilities ─────────────────────────────────────────────────────────────────

function csvCell(value) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

/**
 * Format a Date as YYYY-MM-DD HH:mm (Buffer Posting Time format).
 */
function formatBufferDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    ` ${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * Generate scheduling dates starting from tomorrow, one post per day.
 */
function generateScheduleDates(count, startDate = new Date()) {
  const dates = [];
  const base = new Date(startDate);
  // Start from tomorrow to ensure dates are always in the future
  base.setDate(base.getDate() + 1);
  base.setHours(10, 0, 0, 0); // 10:00 AM local
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    dates.push(formatBufferDate(d));
  }
  return dates;
}

function truncatePost(text, platform) {
  const limit = PLATFORM_CHAR_LIMITS[platform] ?? 2200;
  if (text.length <= limit) return text;
  return text.slice(0, limit - 4) + "…";
}

/**
 * Verify a URL resolves with a 2xx response.
 * Returns true on success, throws on failure.
 */
async function verifyUrl(url) {
  if (SKIP_URL_CHECK) return true;
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return true;
  } catch (e) {
    throw new Error(`seriesPageUrl failed to resolve: ${url} — ${e.message}`);
  }
}

// ─── Data loading ──────────────────────────────────────────────────────────────

function loadSeries() {
  return LABUBU_SLUGS.map((slug) => {
    const file = path.join(SERIES_DIR, `${slug}.json`);
    if (!fs.existsSync(file)) {
      throw new Error(`Series data file not found: ${file}`);
    }
    return JSON.parse(fs.readFileSync(file, "utf8"));
  });
}

function loadPricing() {
  if (!fs.existsSync(PRICING_FILE)) {
    throw new Error(`Market pricing file not found: ${PRICING_FILE}`);
  }
  return JSON.parse(fs.readFileSync(PRICING_FILE, "utf8"));
}

// ─── Price helpers ─────────────────────────────────────────────────────────────

/**
 * Returns a human-readable price range string only if data is verified.
 * Returns null if data is stale/unverified — never invent prices.
 */
function getPriceText(pricingData, slug, variantName) {
  const series = pricingData.series?.find((s) => s.slug === slug);
  if (!series) return null;
  const variant = series.variants?.find((v) => v.variant === variantName);
  if (!variant) return null;
  if (variant.status !== "verified") return null;
  if (variant.price_low == null || variant.price_high == null) return null;
  const src = variant.source ? ` (source: ${variant.source})` : "";
  const n = variant.sample_size == null ? "" : `, ${variant.sample_size} recent listings checked`;
  return `$${variant.price_low}–$${variant.price_high}${n}${src}`;
}

/**
 * Returns the retail price text only if series._dataQuality.retailUSD.status === "verified".
 */
function getRetailText(series) {
  const dq = series._dataQuality?.retailUSD;
  if (!dq || dq.status !== "verified") return null;
  return `$${series.retailUSD} per box`;
}

// ─── Post templates ────────────────────────────────────────────────────────────

function buildHashtagBlock(series) {
  const tags = [
    "#Labubu",
    "#TheMonsters",
    "#POPMART",
    "#BlindBox",
    "#BlindBoxAI",
    "#CollectibleToys",
    "#LabubuCollector",
    "#BlindBoxUnboxing",
  ];
  if (series.slug.includes("sanrio")) {
    tags.push("#SanrioXLabubu", "#HelloKitty", "#SanrioCollabs");
  }
  if (series.slug.includes("macaron")) tags.push("#ExcitingMacaron");
  if (series.slug.includes("have-a-seat")) tags.push("#HaveASeat");
  if (series.slug.includes("big-into-energy")) tags.push("#BigIntoEnergy");
  if (series.slug.includes("hair-salon")) tags.push("#HairSalon");
  return tags.join(" ");
}

function buildSeriesPost(series, pricing, platform) {
  const pageUrl = series.seriesPageUrl;
  const hashtagBlock = buildHashtagBlock(series);

  // Check for any verified pricing
  const verifiedVariants = (series.figures ?? []).filter((fig) => {
    return getPriceText(pricing, series.slug, fig.name) !== null;
  });

  let priceLines = "";
  if (verifiedVariants.length > 0) {
    priceLines =
      "\n\n💰 Recent listings checked:\n" +
      verifiedVariants
        .map((fig) => `• ${fig.name}: ${getPriceText(pricing, series.slug, fig.name)}`)
        .join("\n");
  }

  // X has a 280-char hard limit — build a shorter version
  if (platform === "x") {
    const short = `Labubu ${series.name} — full guide at BlindBoxAI 🔗 ${pageUrl}\n\n${DISCLOSURE}`;
    return truncatePost(short, "x");
  }

  const rareCount = (series.figures ?? []).filter((f) => f.rarity === "rare").length;
  const secretCount = (series.figures ?? []).filter((f) => f.rarity === "secret").length;

  // Only emit retailUSD when _dataQuality marks it verified
  const retailText = getRetailText(series);

  const body =
    `✨ ${series.name} — Labubu series guide now on BlindBoxAI!\n\n` +
    `🎲 ${series.figures?.length ?? "?"} figures total` +
    (rareCount ? ` • ${rareCount} rare` : "") +
    (secretCount ? ` • ${secretCount} secret` : "") +
    (retailText ? `\n🛒 Retail: ${retailText}` : "") +
    priceLines +
    `\n\n🔗 Full authentication checklist + resale guide:\n${pageUrl}\n\n` +
    `${DISCLOSURE}\n\n` +
    hashtagBlock;

  return truncatePost(body, platform);
}

function buildFigureSpotlightPost(series, figure, pricing, platform) {
  const pageUrl = series.seriesPageUrl;
  const hashtagBlock = buildHashtagBlock(series);
  const priceText = getPriceText(pricing, series.slug, figure.name);

  const rarityEmoji = figure.rarity === "secret" ? "🌟" : figure.rarity === "rare" ? "💎" : "✨";

  if (platform === "x") {
    const short =
      `${rarityEmoji} ${figure.name} from ${series.name}` +
      (priceText ? ` — recent listings: ${priceText}` : "") +
      ` — guide at BlindBoxAI: ${pageUrl}\n\n${DISCLOSURE}`;
    return truncatePost(short, "x");
  }

  const priceSection = priceText
    ? `\n\n💰 Recent listings checked: ${priceText}`
    : "\n\n💰 Resale pricing: data pending — check BlindBoxAI for updates.";

  const body =
    `${rarityEmoji} ${figure.rarity.toUpperCase()} SPOTLIGHT — ${figure.name}\n` +
    `Series: ${series.name}\n\n` +
    `Thinking about adding this one to your collection?` +
    priceSection +
    `\n\n🔗 Authentication tips + full series guide:\n${pageUrl}\n\n` +
    `${DISCLOSURE}\n\n` +
    hashtagBlock;

  return truncatePost(body, platform);
}

function buildTipsPost(series, platform) {
  const pageUrl = series.seriesPageUrl;
  const hashtagBlock = buildHashtagBlock(series);
  const tips = (series.checklist ?? []).slice(0, 3);

  if (platform === "x") {
    const short =
      `🔍 How to spot a fake ${series.name} Labubu — full checklist at BlindBoxAI: ${pageUrl}\n\n${DISCLOSURE}`;
    return truncatePost(short, "x");
  }

  const tipLines = tips.map((t, i) => `${i + 1}. ${t}`).join("\n");

  const body =
    `🔍 How to spot a fake ${series.name} Labubu\n\n` +
    `${tipLines}\n\n` +
    `📋 Full authentication checklist at BlindBoxAI:\n${pageUrl}\n\n` +
    `${DISCLOSURE}\n\n` +
    hashtagBlock;

  return truncatePost(body, platform);
}

// ─── Post generation ──────────────────────────────────────────────────────────

function generatePostsForSeries(series, pricing) {
  const posts = [];

  // CSV bulk upload channels (no YouTube — YouTube cannot be bulk-uploaded by CSV)
  const platforms = ["tiktok", "instagram", "facebook", "x", "pinterest"];

  // 1. Series overview post for each platform
  for (const platform of platforms) {
    posts.push({
      type: "series_overview",
      seriesSlug: series.slug,
      seriesName: series.name,
      platform,
      text: buildSeriesPost(series, pricing, platform),
      imageUrl: "",
      tags: buildHashtagBlock(series),
      scheduledAt: null,
    });
  }

  // 2. Figure spotlight for secret/rare figures
  const spotlightFigures = (series.figures ?? []).filter(
    (f) => f.rarity === "secret" || f.rarity === "rare",
  );
  for (const fig of spotlightFigures) {
    for (const platform of ["tiktok", "instagram", "x"]) {
      posts.push({
        type: "figure_spotlight",
        seriesSlug: series.slug,
        seriesName: series.name,
        figureName: fig.name,
        platform,
        text: buildFigureSpotlightPost(series, fig, pricing, platform),
        imageUrl: "",
        tags: buildHashtagBlock(series),
        scheduledAt: null,
      });
    }
  }

  // 3. Authentication tips post
  for (const platform of ["tiktok", "instagram", "facebook"]) {
    posts.push({
      type: "auth_tips",
      seriesSlug: series.slug,
      seriesName: series.name,
      platform,
      text: buildTipsPost(series, platform),
      imageUrl: "",
      tags: buildHashtagBlock(series),
      scheduledAt: null,
    });
  }

  return posts;
}

// ─── CSV output ───────────────────────────────────────────────────────────────

function postsToBufferCSV(posts, channel) {
  const isPinterest = channel === "pinterest";
  const headers = isPinterest ? BUFFER_CSV_HEADERS_PINTEREST : BUFFER_CSV_HEADERS_BASE;
  const lines = [headers.join(",")];

  for (const post of posts) {
    if (post.platform !== channel) continue;
    // Instagram requires an image — skip text-only rows for Instagram
    if (channel === "instagram" && !post.imageUrl) continue;

    const row = [
      post.text,
      post.imageUrl ?? "",
      post.tags ?? "",
      post.scheduledAt ?? "",
    ];
    if (isPinterest) row.push(PINTEREST_BOARD);

    lines.push(row.map(csvCell).join(","));
  }

  // Only return a CSV string if there are data rows (beyond the header)
  if (lines.length <= 1) return null;
  return lines.join("\n") + "\n";
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const seriesList = loadSeries();
const pricing = loadPricing();

// Validate all series page URLs before generating CTAs
if (!SKIP_URL_CHECK) {
  console.log("🔗 Validating series page URLs…");
  for (const series of seriesList) {
    if (!series.seriesPageUrl) {
      throw new Error(`${series.slug}: seriesPageUrl is missing`);
    }
    await verifyUrl(series.seriesPageUrl);
    console.log(`  ✅ ${series.seriesPageUrl}`);
  }
}

const startDate = new Date();
let allPosts = [];

for (const series of seriesList) {
  allPosts = allPosts.concat(generatePostsForSeries(series, pricing));
}

// Assign schedule dates
const scheduleDates = generateScheduleDates(allPosts.length, startDate);
allPosts.forEach((post, i) => {
  post.scheduledAt = scheduleDates[i];
});

// Write output — one Buffer CSV per channel
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

let totalPosts = 0;
for (const channel of CSV_CHANNELS) {
  const csv = postsToBufferCSV(allPosts, channel);
  if (!csv) {
    console.log(`Skipped ${channel} (no qualifying posts)`);
    continue;
  }
  const csvPath = path.join(OUTPUT_DIR, `buffer-${channel}.csv`);
  fs.writeFileSync(csvPath, csv);
  const rowCount = csv.split("\n").filter(Boolean).length - 1;
  totalPosts += rowCount;
  console.log(`Wrote ${channel} CSV (${rowCount} posts): ${csvPath}`);
}

console.log(`\nTotal posts scheduled: ${totalPosts}`);
console.log(
  "\nNOTE: Videos/Reels cannot be bulk-uploaded via Buffer CSV." +
  "\nFor video publishing, use the Buffer API with a stable publicly accessible MP4 URL." +
  "\nSee docs/labubu-buffer-automation.md for details.",
);
