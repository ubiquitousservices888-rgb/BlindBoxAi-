import fs from "node:fs";
import path from "node:path";

function reviewedCatalogRecord(series) {
  const reviewedFigures = (series.figures ?? [])
    .filter((figure) => (
      figure?.needsReview === false &&
      Number.isFinite(figure?.resaleLow) &&
      Number.isFinite(figure?.resaleHigh) &&
      figure.resaleLow > 0 &&
      figure.resaleHigh >= figure.resaleLow
    ))
    .map((figure) => ({
      name: figure.name,
      rarity: figure.rarity,
      observedUsdRange: [figure.resaleLow, figure.resaleHigh],
      evidence: figure.evidence,
      reviewStatus: "reviewed",
    }));

  return {
    brand: series.brand,
    series: series.name,
    page: `https://www.blindboxai.com/series/${series.slug}`,
    reviewedFigures,
    pendingFigureCount: (series.figures ?? []).filter((figure) => figure?.needsReview !== false).length,
  };
}

export function buildCatalogSnapshot(seriesDirectory = path.join(process.cwd(), "data", "series")) {
  if (!fs.existsSync(seriesDirectory)) return [];
  return fs.readdirSync(seriesDirectory)
    .filter((name) => name.endsWith(".json") && !name.startsWith("_"))
    .map((name) => JSON.parse(fs.readFileSync(path.join(seriesDirectory, name), "utf8")))
    .map(reviewedCatalogRecord)
    .sort((a, b) => a.series.localeCompare(b.series));
}
