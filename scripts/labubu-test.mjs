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

    it(`${slug}: seriesPageUrl is a valid URL`, () => {
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
});

// ─── Video manifest tests ──────────────────────────────────────────────────────

describe("Video manifest file", () => {
  const manifestFile = path.join(ROOT, "data", "labubu-video-manifest.json");

  it("exists and is valid JSON", () => {
    assert.ok(fs.existsSync(manifestFile), `Missing: ${manifestFile}`);
    const raw = fs.readFileSync(manifestFile, "utf8");
    assert.doesNotThrow(() => JSON.parse(raw), "Invalid JSON in video manifest");
  });

  it("each video entry has required fields", () => {
    const data = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    const REQUIRED = ["id", "videoPath", "seriesSlug", "title", "caption", "cta", "targetChannels"];
    for (const video of data.videos ?? []) {
      for (const field of REQUIRED) {
        assert.ok(video[field], `Video '${video.id ?? "?"}' missing field '${field}'`);
      }
    }
  });
});

// ─── Post generator smoke test ─────────────────────────────────────────────────

describe("Post generator", () => {
  it("runs without error and produces CSV and manifest", () => {
    try {
      execFileSync(
        process.execPath,
        [path.join(ROOT, "scripts", "labubu-post-generator.mjs")],
        {
          env: { ...process.env },
          cwd: ROOT,
          stdio: "pipe",
        },
      );
    } catch (e) {
      assert.fail(
        `Post generator exited with error:\n${e.stderr?.toString()}\n${e.stdout?.toString()}`,
      );
    }

    const csvPath = path.join(ROOT, "output", "labubu", "buffer-schedule.csv");
    assert.ok(fs.existsSync(csvPath), "buffer-schedule.csv not produced");

    const manifestPath = path.join(ROOT, "output", "labubu", "video-manifest-scheduled.json");
    assert.ok(fs.existsSync(manifestPath), "video-manifest-scheduled.json not produced");
  });

  it("every CSV row contains the EPN disclosure", () => {
    const csvPath = path.join(ROOT, "output", "labubu", "buffer-schedule.csv");
    if (!fs.existsSync(csvPath)) return; // Skip if generator hasn't run yet

    const text = fs.readFileSync(csvPath, "utf8");
    // Count occurrences of disclosure — should appear at least once per data row
    const headerCount = 1;
    const disclosureCount = (text.match(new RegExp(DISCLOSURE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
    // Each row should have one disclosure, so total disclosures >= data row count
    // Count data rows via unambiguous post_type occurrences
    const postTypeMatches = (text.match(/series_overview|figure_spotlight|auth_tips/g) ?? []).length;
    assert.ok(
      disclosureCount >= postTypeMatches,
      `Disclosure count (${disclosureCount}) should be >= post count (${postTypeMatches})`,
    );
  });

  it("no CSV row contains a prohibited phrase", () => {
    const csvPath = path.join(ROOT, "output", "labubu", "buffer-schedule.csv");
    if (!fs.existsSync(csvPath)) return;

    const PROHIBITED = ["verified seller", "guaranteed authentic", "100% real", "scam"];
    const text = fs.readFileSync(csvPath, "utf8").toLowerCase();
    for (const phrase of PROHIBITED) {
      assert.ok(!text.includes(phrase), `CSV contains prohibited phrase: "${phrase}"`);
    }
  });

  it("all scheduled_at dates are in the future", () => {
    const csvPath = path.join(ROOT, "output", "labubu", "buffer-schedule.csv");
    if (!fs.existsSync(csvPath)) return;

    const lines = fs.readFileSync(csvPath, "utf8").split("\n").filter(Boolean);
    const headers = lines[0].split(",");
    const scheduledIdx = headers.indexOf("scheduled_at");
    if (scheduledIdx === -1) return;

    const now = new Date();
    for (let i = 1; i < lines.length; i++) {
      // Simple parse — find last N comma-separated values
      const cells = lines[i].split(",");
      const rawDate = cells[scheduledIdx];
      if (!rawDate || rawDate.trim() === "") continue;
      const d = new Date(rawDate.replace(/"/g, ""));
      if (!isNaN(d.getTime())) {
        assert.ok(d >= now, `Row ${i + 1}: scheduled_at is in the past: ${rawDate}`);
      }
    }
  });
});
