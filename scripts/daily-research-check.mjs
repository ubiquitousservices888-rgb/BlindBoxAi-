import fs from "node:fs/promises";
import { runDailyResearchCheck } from "../lib/daily-research-check.mjs";

const videoProducts = JSON.parse(await fs.readFile(new URL("../data/verified-video-products.json", import.meta.url), "utf8")).products || [];
const report = await runDailyResearchCheck({ expectedRevision: process.env.GITHUB_SHA || "", videoProducts });
await fs.mkdir("output/mr-know-it-all", { recursive: true });
await fs.writeFile("output/mr-know-it-all/daily-check.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) {
  const failed = report.pages.filter(page => page.status !== "ok").map(page => page.path);
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,
    `## Daily research checks\n\nChecked: ${report.checkedAt}\n\n` +
    `Page health: **${report.status}**\n\n` +
    `Reviewed prices: ${report.prices.fresh} fresh, ${report.prices.dated} dated, ${report.prices.unknown} unknown.\n\n` +
    `Video primary sources needing recheck: ${report.videoSources.filter(source => source.status !== "fresh").length}.\n\n` +
    (failed.length ? `Pages requiring attention: ${failed.join(", ")}\n\n` : "") +
    "Research collection and queued sold-price retrieval remain in their existing scheduled workflows.\n");
}
if (report.status !== "ok") process.exitCode = 1;
