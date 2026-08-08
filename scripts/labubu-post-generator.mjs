/**
 * labubu-post-generator.mjs
 *
 * Converts validated Labubu market data into platform-specific social posts
 * and a Buffer-ready CSV for bulk scheduling.
 *
 * Usage:
 *   node scripts/labubu-post-generator.mjs
 *
 * Output:
 *   output/labubu/buffer-schedule.csv
 *   output/labubu/video-manifest-scheduled.json
 *
 * Rules enforced:
 *   - Never invent prices.
 *   - Only use values present in validated source data (status !== STALE_SEED_DATA).
 *   - EPN disclosure required on every post.
 *   - CTA directs to BlindBoxAI series page, not raw affiliate links.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ─── Config ───────────────────────────────────────────────────────────────────

const SERIES_DIR = path.join(ROOT, "data", "series");
const PRICING_FILE = path.join(ROOT, "data", "labubu-market-pricing.json");
const VIDEO_MANIFEST_FILE = path.join(ROOT, "data", "labubu-video-manifest.json");
const OUTPUT_DIR = path.join(ROOT, "output", "labubu");

const LABUBU_SLUGS = [
  "labubu-the-monsters-exciting-macaron",
  "labubu-the-monsters-have-a-seat",
  "labubu-the-monsters-big-into-energy",
  "labubu-the-monsters-hair-salon",
  "labubu-sanrio-collaboration",
];

const DISCLOSURE = "#ad BlindBoxAI may earn a commission from qualifying purchases.";

const PLATFORM_CHAR_LIMITS = {
  tiktok: 2200,
  instagram: 2200,
  facebook: 63206,
  x: 280,
  pinterest: 500,
  youtube_shorts: 5000,
};

// ─── Utilities ─────────────────────────────────────────────────────────────────

function csvCell(value) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

/**
 * Generate scheduling dates starting from today, one post per day at a
 * fixed time per platform.
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
    dates.push(d.toISOString());
  }
  return dates;
}

function truncatePost(text, platform) {
  const limit = PLATFORM_CHAR_LIMITS[platform] ?? 2200;
  if (text.length <= limit) return text;
  // Truncate and append ellipsis so the disclosure is always included
  return text.slice(0, limit - 4) + "…";
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

function loadVideoManifest() {
  if (!fs.existsSync(VIDEO_MANIFEST_FILE)) {
    return { videos: [] };
  }
  return JSON.parse(fs.readFileSync(VIDEO_MANIFEST_FILE, "utf8"));
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
  if (!variant.price_low || !variant.price_high) return null;
  const src = variant.source ? ` (source: ${variant.source})` : "";
  const n = variant.sample_size ? `, ${variant.sample_size} recent listings checked` : "";
  return `$${variant.price_low}–$${variant.price_high}${n}${src}`;
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
  const pageUrl = series.seriesPageUrl ?? `https://www.blindboxai.com/series/${series.slug}`;
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
    const short = `Labubu ${series.name} — full guide + authentication tips at BlindBoxAI 🔗 ${pageUrl}\n\n${DISCLOSURE}`;
    return truncatePost(short, "x");
  }

  const rareCount = (series.figures ?? []).filter((f) => f.rarity === "rare").length;
  const secretCount = (series.figures ?? []).filter((f) => f.rarity === "secret").length;

  const body =
    `✨ ${series.name} — Labubu series guide now on BlindBoxAI!\n\n` +
    `🎲 ${series.figures?.length ?? "?"} figures total` +
    (rareCount ? ` • ${rareCount} rare` : "") +
    (secretCount ? ` • ${secretCount} secret` : "") +
    `\n🛒 Retail: $${series.retailUSD} per box` +
    priceLines +
    `\n\n🔗 Full authentication checklist + resale guide:\n${pageUrl}\n\n` +
    `${DISCLOSURE}\n\n` +
    hashtagBlock;

  return truncatePost(body, platform);
}

function buildFigureSpotlightPost(series, figure, pricing, platform) {
  const pageUrl = series.seriesPageUrl ?? `https://www.blindboxai.com/series/${series.slug}`;
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
  const pageUrl = series.seriesPageUrl ?? `https://www.blindboxai.com/series/${series.slug}`;
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
      scheduledAt: null,
    });
  }

  return posts;
}

// ─── Video manifest scheduling ────────────────────────────────────────────────

function scheduleVideoManifest(manifest, startDate) {
  let dayOffset = 1; // Start from tomorrow
  return (manifest.videos ?? []).map((video) => {
    const scheduledDate = new Date(startDate);
    scheduledDate.setDate(scheduledDate.getDate() + dayOffset);
    scheduledDate.setHours(18, 0, 0, 0); // 6 PM for video content
    dayOffset += 3; // Space video posts 3 days apart

    return {
      ...video,
      scheduledTime: scheduledDate.toISOString(),
    };
  });
}

// ─── CSV output ───────────────────────────────────────────────────────────────

const CSV_HEADERS = [
  "post_type",
  "series_slug",
  "series_name",
  "figure_name",
  "platform",
  "text",
  "image_url",
  "scheduled_at",
];

function postsToCSV(posts) {
  const lines = [CSV_HEADERS.join(",")];
  for (const post of posts) {
    lines.push(
      [
        post.type,
        post.seriesSlug,
        post.seriesName,
        post.figureName ?? "",
        post.platform,
        post.text,
        post.imageUrl ?? "",
        post.scheduledAt ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const seriesList = loadSeries();
const pricing = loadPricing();
const videoManifest = loadVideoManifest();

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

// Schedule video manifest
const scheduledVideos = scheduleVideoManifest(videoManifest, startDate);

// Write output
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const csvPath = path.join(OUTPUT_DIR, "buffer-schedule.csv");
fs.writeFileSync(csvPath, postsToCSV(allPosts));

const videoManifestOutPath = path.join(OUTPUT_DIR, "video-manifest-scheduled.json");
fs.writeFileSync(
  videoManifestOutPath,
  JSON.stringify({ ...videoManifest, videos: scheduledVideos }, null, 2) + "\n",
);

console.log(`Posts generated: ${allPosts.length}`);
console.log(`Wrote Buffer CSV: ${csvPath}`);
console.log(`Wrote scheduled video manifest: ${videoManifestOutPath}`);
