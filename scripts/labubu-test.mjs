/**
 * labubu-test.mjs
 *
 * Unit and integration tests for the Labubu automation pipeline.
 * Uses Node's built-in test runner (node:test).
 *
 * Usage:
 *   node --test scripts/labubu-test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const LABUBU_SLUGS = [
  "labubu-the-monsters-exciting-macaron",
  "labubu-the-monsters-have-a-seat",
  "labubu-the-monsters-big-into-energy",
  "labubu-the-monsters-hair-salon",
  "labubu-sanrio-collaboration",
];

const REQUIRED_SERIES_FIELDS = ["slug", "name", "brand", "retailUSD", "figures", "seriesPageUrl"];
const REQUIRED_PRICING_FIELDS = ["_schema", "_status", "series"];
const DISCLOSURE_PREFIX = "#ad BlindBoxAI may earn a commission";

// Buffer official CSV headers (exact case-sensitive)
const BUFFER_CSV_HEADERS_BASE = ["Text", "Image URL", "Tags", "Posting Time"];
const BUFFER_CSV_HEADERS_PINTEREST = ["Text", "Image URL", "Tags", "Posting Time", "Board Name"];

// Per-channel CSV files produced by the generator
const CHANNEL_FILES = {
  tiktok:    "buffer-tiktok.csv",
  instagram: "buffer-instagram.csv",
  facebook:  "buffer-facebook.csv",
  x:         "buffer-x.csv",
  pinterest: "buffer-pinterest.csv",
};

// Posting Time format: YYYY-MM-DD HH:mm
const POSTING_TIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

// ─── CSV parser ───────────────────────────────────────────────────────────────

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
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuote = false; i++; continue;
      }
      cell += ch; i++; continue;
    }
    if (ch === '"') { inQuote = true; i++; continue; }
    if (ch === ",") { cells.push(cell); cell = ""; i++; continue; }
    if (ch === "\r" && text[i + 1] === "\n") {
      cells.push(cell); cell = ""; rows.push(cells); cells = []; i += 2; continue;
    }
    if (ch === "\n") {
      cells.push(cell); cell = ""; rows.push(cells); cells = []; i++; continue;
    }
    cell += ch; i++;
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

// ─── Series data tests ─────────────────────────────────────────────────────────

describe("Series data files", () => {
  for (const slug of LABUBU_SLUGS) {
    it(`${slug}: file exists and is valid JSON`, () => {
      const file = path.join(ROOT, "data", "series", `${slug}.json`);
      assert.ok(fs.existsSync(file), `Missing file: ${file}`);
      const raw = fs.readFileSync(file, "utf8");
      assert.doesNotThrow(() => JSON.parse(raw), `Invalid JSON: ${file}`);
    });

    it(`${slug}: contains required fields`, () => {
      const file = path.join(ROOT, "data", "series", `${slug}.json`);
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      for (const field of REQUIRED_SERIES_FIELDS) {
        assert.ok(
          data[field] !== undefined && data[field] !== null,
          `Missing field '${field}' in ${slug}`,
        );
      }
    });

    it(`${slug}: slug matches filename`, () => {
      const file = path.join(ROOT, "data", "series", `${slug}.json`);
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      assert.equal(data.slug, slug, `slug mismatch in ${slug}.json`);
    });

    it(`${slug}: figures array is non-empty`, () => {
      const file = path.join(ROOT, "data", "series", `${slug}.json`);
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      assert.ok(Array.isArray(data.figures), "figures must be an array");
      assert.ok(data.figures.length > 0, "figures must not be empty");
    });

    it(`${slug}: seriesPageUrl is a valid https:// URL (not a placeholder)`, () => {
      const file = path.join(ROOT, "data", "series", `${slug}.json`);
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      assert.ok(
        data.seriesPageUrl?.startsWith("https://"),
        `seriesPageUrl must start with https://`,
      );
      assert.ok(
        !data.seriesPageUrl?.includes("example.com"),
        "seriesPageUrl must not be a placeholder",
      );
    });

    it(`${slug}: marketPricing._status is set`, () => {
      const file = path.join(ROOT, "data", "series", `${slug}.json`);
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      assert.ok(data.marketPricing?._status, "marketPricing._status must be set");
    });

    it(`${slug}: _dataQuality is present with retailUSD and pullOdds entries`, () => {
      const file = path.join(ROOT, "data", "series", `${slug}.json`);
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      assert.ok(data._dataQuality, "_dataQuality must be present");
      assert.ok(data._dataQuality.retailUSD?.status, "_dataQuality.retailUSD.status must be set");
      assert.ok(data._dataQuality.pullOdds?.status, "_dataQuality.pullOdds.status must be set");
    });
  }
});

// ─── Pricing data tests ────────────────────────────────────────────────────────

describe("Market pricing file", () => {
  const pricingFile = path.join(ROOT, "data", "labubu-market-pricing.json");

  it("exists and is valid JSON", () => {
    assert.ok(fs.existsSync(pricingFile), `Missing: ${pricingFile}`);
    const raw = fs.readFileSync(pricingFile, "utf8");
    assert.doesNotThrow(() => JSON.parse(raw), "Invalid JSON in pricing file");
  });

  it("contains required top-level fields", () => {
    const data = JSON.parse(fs.readFileSync(pricingFile, "utf8"));
    for (const field of REQUIRED_PRICING_FIELDS) {
      assert.ok(data[field] !== undefined, `Missing field '${field}'`);
    }
  });

  it("_status is STALE_SEED_DATA (no live prices committed)", () => {
    const data = JSON.parse(fs.readFileSync(pricingFile, "utf8"));
    assert.equal(data._status, "STALE_SEED_DATA");
  });

  it("all variants have required fields", () => {
    const data = JSON.parse(fs.readFileSync(pricingFile, "utf8"));
    const REQUIRED = ["variant", "rarity", "status"];
    for (const series of data.series ?? []) {
      for (const variant of series.variants ?? []) {
        for (const field of REQUIRED) {
          assert.ok(
            variant[field] !== undefined,
            `Variant '${variant.variant}' missing '${field}'`,
          );
        }
      }
    }
  });

  it("no verified variants have null prices", () => {
    const data = JSON.parse(fs.readFileSync(pricingFile, "utf8"));
    for (const series of data.series ?? []) {
      for (const variant of series.variants ?? []) {
        if (variant.status === "verified") {
          assert.ok(
            variant.price_low !== null,
            `Verified variant '${variant.variant}' has null price_low`,
          );
          assert.ok(
            variant.price_high !== null,
            `Verified variant '${variant.variant}' has null price_high`,
          );
        }
      }
    }
  });

  it("unverified variants cannot emit price claims (price fields are null)", () => {
    const data = JSON.parse(fs.readFileSync(pricingFile, "utf8"));
    for (const series of data.series ?? []) {
      for (const variant of series.variants ?? []) {
        if (variant.status !== "verified") {
          // Unverified variants must NOT have populated price fields
          // (they should be null so the generator cannot use them)
          const hasPrice = variant.price_low !== null || variant.price_high !== null;
          assert.ok(
            !hasPrice,
            `Unverified variant '${variant.variant}' in '${series.series}' has price data — set status to 'verified' or null out prices`,
          );
        }
      }
    }
  });
});

// ─── Video manifest tests ──────────────────────────────────────────────────────

describe("Video manifest file", () => {
  const manifestFile = path.join(ROOT, "data", "labubu-video-manifest.json");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "labubu-test-"));

  it("exists and is valid JSON", () => {
    assert.ok(fs.existsSync(manifestFile), `Missing: ${manifestFile}`);
    const raw = fs.readFileSync(manifestFile, "utf8");
    assert.doesNotThrow(() => JSON.parse(raw), "Invalid JSON in video manifest");
  });

  it("each video entry has required fields including videoUrl (not videoPath)", () => {
    const data = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    for (const video of data.videos ?? []) {
      assert.ok(video.id, `Video missing 'id'`);
      assert.equal(typeof video.enabled, "boolean", `Video '${video.id}' must set boolean 'enabled'`);
      assert.ok(video.videoUrl !== undefined, `Video '${video.id}' must have 'videoUrl', not 'videoPath'`);
      assert.ok(!video.videoPath, `Video '${video.id}' must not use deprecated 'videoPath' — use 'videoUrl'`);
      assert.ok(video.seriesSlug, `Video '${video.id}' missing 'seriesSlug'`);
      assert.ok(video.title, `Video '${video.id}' missing 'title'`);
      assert.ok(video.caption, `Video '${video.id}' missing 'caption'`);
      assert.ok(video.cta, `Video '${video.id}' missing 'cta'`);
      assert.ok(video.targetChannels, `Video '${video.id}' missing 'targetChannels'`);
    }
  });

  it("video captions contain EPN disclosure", () => {
    const data = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    for (const video of data.videos ?? []) {
      assert.ok(
        video.caption?.includes(DISCLOSURE_PREFIX),
        `Video '${video.id}' caption missing EPN disclosure: "${DISCLOSURE_PREFIX}"`,
      );
    }
  });

  it("manifest notes that video publishing requires Buffer API, not CSV", () => {
    const data = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    // Either _videoPublishingPath note or a _note that mentions API
    const note = JSON.stringify(data).toLowerCase();
    assert.ok(
      note.includes("api") || note.includes("not csv"),
      "Video manifest should note that video publishing uses Buffer API, not CSV",
    );
  });

  it("disabled placeholder videos do not fail ordinary CI validation and are not publishable", () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const manifestPath = path.join(tmpDir, "video-disabled-placeholder.json");
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          videos: [
            {
              id: "disabled-video",
              enabled: false,
              videoUrl: "REPLACE_WITH_HOSTED_VIDEO_URL",
              seriesSlug: "labubu-sanrio-collaboration",
              title: "Disabled draft",
              caption:
                "Draft caption only.\n\n#ad BlindBoxAI may earn a commission from qualifying purchases.",
              hashtags: ["#Labubu"],
              cta: "Link in bio.",
              targetChannels: ["tiktok"],
              videoSpec: { format: "MP4", codec: "H.264", audio: "AAC" },
              scheduledTime: null,
            },
          ],
        },
        null,
        2,
      ),
    );

    const out = execFileSync(
      process.execPath,
      [path.join(ROOT, "scripts", "labubu-validate.mjs"), "--skip-url-check"],
      {
        cwd: ROOT,
        env: { ...process.env, LABUBU_VIDEO_MANIFEST_FILE: manifestPath },
        stdio: "pipe",
      },
    ).toString();
    assert.ok(
      out.includes("is disabled and will not publish"),
      "Expected disabled video warning indicating it cannot publish",
    );
  });

  it("enabled placeholder videos fail validation", () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const manifestPath = path.join(tmpDir, "video-enabled-placeholder.json");
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          videos: [
            {
              id: "enabled-video",
              enabled: true,
              videoUrl: "REPLACE_WITH_HOSTED_VIDEO_URL",
              seriesSlug: "labubu-sanrio-collaboration",
              title: "Enabled draft",
              caption:
                "Enabled caption.\n\n#ad BlindBoxAI may earn a commission from qualifying purchases.",
              hashtags: ["#Labubu"],
              cta: "Link in bio.",
              targetChannels: ["tiktok"],
              videoSpec: { format: "MP4", codec: "H.264", audio: "AAC" },
              scheduledTime: null,
            },
          ],
        },
        null,
        2,
      ),
    );

    assert.throws(
      () =>
        execFileSync(
          process.execPath,
          [path.join(ROOT, "scripts", "labubu-validate.mjs"), "--skip-url-check"],
          {
            cwd: ROOT,
            env: { ...process.env, LABUBU_VIDEO_MANIFEST_FILE: manifestPath },
            stdio: "pipe",
          },
        ),
      /videoUrl is a placeholder/,
    );
  });
});

// ─── Post generator smoke test ─────────────────────────────────────────────────

describe("Post generator", () => {
  it("runs without error and produces per-channel CSV files", () => {
    try {
      execFileSync(
        process.execPath,
        [path.join(ROOT, "scripts", "labubu-post-generator.mjs"), "--skip-url-check"],
        { env: { ...process.env }, cwd: ROOT, stdio: "pipe" },
      );
    } catch (e) {
      assert.fail(
        `Post generator exited with error:\n${e.stderr?.toString()}\n${e.stdout?.toString()}`,
      );
    }

    // At minimum, non-Instagram channels should be produced
    for (const [channel, filename] of Object.entries(CHANNEL_FILES)) {
      if (channel === "instagram" || channel === "pinterest") continue; // image required
      const csvPath = path.join(ROOT, "output", "labubu", filename);
      assert.ok(fs.existsSync(csvPath), `${channel} CSV not produced: ${csvPath}`);
    }
  });

  it("per-channel CSVs use exact Buffer headers", () => {
    for (const [channel, filename] of Object.entries(CHANNEL_FILES)) {
      const csvPath = path.join(ROOT, "output", "labubu", filename);
      if (!fs.existsSync(csvPath)) continue;

      const { headers } = parseCSV(fs.readFileSync(csvPath, "utf8"));
      const expected = channel === "pinterest" ? BUFFER_CSV_HEADERS_PINTEREST : BUFFER_CSV_HEADERS_BASE;
      for (const h of expected) {
        assert.ok(
          headers.includes(h),
          `${channel} CSV missing Buffer header '${h}' (found: ${JSON.stringify(headers)})`,
        );
      }
    }
  });

  it("Posting Time format is YYYY-MM-DD HH:mm in all CSVs", () => {
    for (const [channel, filename] of Object.entries(CHANNEL_FILES)) {
      const csvPath = path.join(ROOT, "output", "labubu", filename);
      if (!fs.existsSync(csvPath)) continue;

      const { rows } = parseCSV(fs.readFileSync(csvPath, "utf8"));
      for (let i = 0; i < rows.length; i++) {
        const pt = rows[i]["Posting Time"];
        if (!pt || pt.trim() === "") continue;
        assert.ok(
          POSTING_TIME_RE.test(pt.trim()),
          `${channel} Row ${i + 2}: Posting Time must be YYYY-MM-DD HH:mm, got: ${pt}`,
        );
      }
    }
  });

  it("all Posting Time values are in the future", () => {
    const now = new Date();
    for (const [channel, filename] of Object.entries(CHANNEL_FILES)) {
      const csvPath = path.join(ROOT, "output", "labubu", filename);
      if (!fs.existsSync(csvPath)) continue;

      const { rows } = parseCSV(fs.readFileSync(csvPath, "utf8"));
      for (let i = 0; i < rows.length; i++) {
        const pt = rows[i]["Posting Time"];
        if (!pt || pt.trim() === "") continue;
        const d = new Date(pt.trim());
        if (!isNaN(d.getTime())) {
          assert.ok(d >= now, `${channel} Row ${i + 2}: Posting Time is in the past: ${pt}`);
        }
      }
    }
  });

  it("every CSV row contains the EPN disclosure", () => {
    for (const [channel, filename] of Object.entries(CHANNEL_FILES)) {
      const csvPath = path.join(ROOT, "output", "labubu", filename);
      if (!fs.existsSync(csvPath)) continue;

      const { rows } = parseCSV(fs.readFileSync(csvPath, "utf8"));
      for (let i = 0; i < rows.length; i++) {
        assert.ok(
          rows[i]["Text"]?.includes(DISCLOSURE_PREFIX),
          `${channel} Row ${i + 2}: missing EPN disclosure in Text`,
        );
      }
    }
  });

  it("no CSV row contains a prohibited phrase", () => {
    const PROHIBITED = ["verified seller", "guaranteed authentic", "100% real", "scam", "verified feedback history"];
    for (const [channel, filename] of Object.entries(CHANNEL_FILES)) {
      const csvPath = path.join(ROOT, "output", "labubu", filename);
      if (!fs.existsSync(csvPath)) continue;

      const text = fs.readFileSync(csvPath, "utf8").toLowerCase();
      for (const phrase of PROHIBITED) {
        assert.ok(!text.includes(phrase), `${channel} CSV contains prohibited phrase: "${phrase}"`);
      }
    }
  });

  it("no secrets appear in generated CSV files", () => {
    const SECRET_PATTERNS = [
      /AKIA[0-9A-Z]{16}/,
      /sk-[A-Za-z0-9]{32,}/,
      /ghp_[A-Za-z0-9]{36}/,
    ];
    for (const [channel, filename] of Object.entries(CHANNEL_FILES)) {
      const csvPath = path.join(ROOT, "output", "labubu", filename);
      if (!fs.existsSync(csvPath)) continue;
      const text = fs.readFileSync(csvPath, "utf8");
      for (const pat of SECRET_PATTERNS) {
        assert.ok(!pat.test(text), `${channel} CSV contains a secret pattern`);
      }
    }
  });

  it("no placeholder URLs remain in generated CSV files", () => {
    const PLACEHOLDERS = [/https?:\/\/example\.com/i, /YOUR_LINK_HERE/i, /INSERT_URL/i];
    for (const [channel, filename] of Object.entries(CHANNEL_FILES)) {
      const csvPath = path.join(ROOT, "output", "labubu", filename);
      if (!fs.existsSync(csvPath)) continue;
      const text = fs.readFileSync(csvPath, "utf8");
      for (const pat of PLACEHOLDERS) {
        assert.ok(!pat.test(text), `${channel} CSV contains placeholder URL`);
      }
    }
  });

  it("Pinterest CSV includes Board Name column", () => {
    const csvPath = path.join(ROOT, "output", "labubu", CHANNEL_FILES.pinterest);
    if (!fs.existsSync(csvPath)) return; // Skip if no Pinterest posts (needs image)
    const { headers } = parseCSV(fs.readFileSync(csvPath, "utf8"));
    assert.ok(headers.includes("Board Name"), "Pinterest CSV must include 'Board Name' column");
  });

  it("generator does not produce a combined buffer-schedule.csv", () => {
    const oldPath = path.join(ROOT, "output", "labubu", "buffer-schedule.csv");
    assert.ok(
      !fs.existsSync(oldPath),
      "buffer-schedule.csv should not exist — generator now produces per-channel CSVs",
    );
  });
});
