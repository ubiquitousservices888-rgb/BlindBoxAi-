import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { affiliateReportRow, affiliateRollupKey } from "../lib/affiliate-reporting.mjs";

const PREFIX = "affiliate/clicks/";
const OUTPUT_DIR = "reports/affiliate";
const CLICK_EVENTS = new Set(["affiliate_click", "outbound_affiliate_click"]);

function csvCell(value) {
  const text = String(value ?? "");

  if (
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n")
  ) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

async function loadEvents() {
  const { get, list } = await import("@vercel/blob");
  const events = [];
  let cursor;

  do {
    const page = await list({
      prefix: PREFIX,
      limit: 1000,
      cursor,
    });

    for (const blob of page.blobs) {
      const result = await get(blob.pathname, {
        access: "private",
      });

      if (!result || result.statusCode !== 200) continue;

      try {
        const text = await new Response(result.stream).text();
        const event = JSON.parse(text);
        if (CLICK_EVENTS.has(event?.event)) events.push(event);
      } catch (error) {
        console.warn(
          "Skipping unreadable click event:",
          blob.pathname,
          error instanceof Error ? error.message : error,
        );
      }
    }

    cursor = page.cursor;
  } while (cursor);

  return events;
}

const eventHeaders = [
  "clicked_at",
  "provider",
  "custom_id",
  "offer_id",
  "offer_title",
  "series_slug",
  "series_name",
  "figure",
  "kind",
  "placement",
  "source",
  "campaign_id",
  "source_path",
];

function buildEventLines(events) {
  return [
    eventHeaders.join(","),
    ...events.map(event => {
      const row = affiliateReportRow(event);
      return [
        row.clickedAt,
        row.provider,
        row.customId,
        row.offerId,
        row.offerTitle,
        row.seriesSlug,
        row.seriesName,
        row.figure,
        row.kind,
        row.placement,
        row.source,
        row.campaignId,
        row.sourcePath,
      ].map(csvCell).join(",");
    }),
  ];
}

const rollupHeaders = [
  "rollup_key",
  "provider",
  "custom_id",
  "offer_id",
  "offer_title",
  "series_slug",
  "series_name",
  "figure",
  "kind",
  "placement",
  "source",
  "campaign_id",
  "clicks",
  "first_click",
  "last_click",
];

function buildRollupLines(rollups) {
  return [
    rollupHeaders.join(","),
    ...[...rollups.values()].map(row =>
      [
        row.rollupKey,
        row.provider,
        row.customId,
        row.offerId,
        row.offerTitle,
        row.seriesSlug,
        row.seriesName,
        row.figure,
        row.kind,
        row.placement,
        row.source,
        row.campaignId,
        row.clicks,
        row.firstClick,
        row.lastClick,
      ].map(csvCell).join(","),
    ),
  ];
}

export const legacyRollupHeaders = [
  "custom_id",
  "series_slug",
  "series_name",
  "figure",
  "kind",
  "placement",
  "source",
  "campaign_id",
  "clicks",
  "first_click",
  "last_click",
];

export function buildLegacyRollupLines(rollups) {
  return [
    legacyRollupHeaders.join(","),
    ...[...rollups.values()].map(row =>
      [
        row.customId,
        row.seriesSlug,
        row.seriesName,
        row.figure,
        row.kind,
        row.placement,
        row.source,
        row.campaignId,
        row.clicks,
        row.firstClick,
        row.lastClick,
      ].map(csvCell).join(","),
    ),
  ];
}

async function main() {
  const events = await loadEvents();
  events.sort((a, b) => String(a.clickedAt).localeCompare(String(b.clickedAt)));

  const rollups = new Map();

  for (const event of events) {
    const normalized = affiliateReportRow(event);
    const key = affiliateRollupKey(event);

    if (!rollups.has(key)) {
      rollups.set(key, {
        rollupKey: key,
        ...normalized,
        clicks: 0,
        firstClick: normalized.clickedAt,
        lastClick: normalized.clickedAt,
      });
    }

    const row = rollups.get(key);
    row.clicks += 1;
    if (normalized.clickedAt < row.firstClick) row.firstClick = normalized.clickedAt;
    if (normalized.clickedAt > row.lastClick) row.lastClick = normalized.clickedAt;
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const eventLines = buildEventLines(events);
  const rollupLines = buildRollupLines(rollups);
  const legacyRollupLines = buildLegacyRollupLines(rollups);

  const eventsPath = path.join(OUTPUT_DIR, "click-events.csv");
  const rollupPath = path.join(OUTPUT_DIR, "affiliate-rollup.csv");
  const legacyRollupPath = path.join(OUTPUT_DIR, "customid-rollup.csv");

  fs.writeFileSync(eventsPath, eventLines.join("\n") + "\n");
  fs.writeFileSync(rollupPath, rollupLines.join("\n") + "\n");
  fs.writeFileSync(legacyRollupPath, legacyRollupLines.join("\n") + "\n");

  console.log(`Affiliate events: ${events.length}`);
  console.log(`Affiliate rollups: ${rollups.size}`);
  console.log(`Wrote ${eventsPath}`);
  console.log(`Wrote ${rollupPath}`);
  console.log(`Wrote ${legacyRollupPath} (legacy 11-column compatibility schema)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
