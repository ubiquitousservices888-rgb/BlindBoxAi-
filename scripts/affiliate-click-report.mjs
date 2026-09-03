import fs from "node:fs";
import path from "node:path";

import { get, list } from "@vercel/blob";

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

const events = await loadEvents();

events.sort((a, b) => String(a.clickedAt).localeCompare(String(b.clickedAt)));

const rollups = new Map();

for (const event of events) {
  const key = event.customId;

  if (!rollups.has(key)) {
    rollups.set(key, {
      customId: key,
      seriesSlug: event.seriesSlug,
      seriesName: event.seriesName,
      figure: event.figure,
      kind: event.kind,
      placement: event.placement,
      source: event.source || "direct",
      campaignId: event.campaignId || "",
      clicks: 0,
      firstClick: event.clickedAt,
      lastClick: event.clickedAt,
    });
  }

  const row = rollups.get(key);
  row.clicks += 1;
  if (event.clickedAt < row.firstClick) row.firstClick = event.clickedAt;
  if (event.clickedAt > row.lastClick) row.lastClick = event.clickedAt;
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const eventHeaders = [
  "clicked_at",
  "custom_id",
  "series_slug",
  "series_name",
  "figure",
  "kind",
  "placement",
  "source",
  "campaign_id",
  "source_path",
];

const eventLines = [
  eventHeaders.join(","),
  ...events.map(event =>
    [
      event.clickedAt,
      event.customId,
      event.seriesSlug,
      event.seriesName,
      event.figure,
      event.kind,
      event.placement,
      event.source || "direct",
      event.campaignId || "",
      event.sourcePath,
    ].map(csvCell).join(","),
  ),
];

const rollupHeaders = [
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

const rollupLines = [
  rollupHeaders.join(","),
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

const eventsPath = path.join(OUTPUT_DIR, "click-events.csv");
const rollupPath = path.join(OUTPUT_DIR, "customid-rollup.csv");

fs.writeFileSync(eventsPath, eventLines.join("\n") + "\n");
fs.writeFileSync(rollupPath, rollupLines.join("\n") + "\n");

console.log(`Affiliate events: ${events.length}`);
console.log(`Custom IDs: ${rollups.size}`);
console.log(`Wrote ${eventsPath}`);
console.log(`Wrote ${rollupPath}`);
