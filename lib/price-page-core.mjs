function slugText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function priceSlug({ canonicalName, id, conditionType } = {}) {
  const name = slugText(canonicalName) || "collectible";
  const condition = slugText(conditionType) || "unknown";
  const stableId = String(id || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  if (!stableId) throw new Error("A stable collectible id is required");
  if (!["raw", "graded"].includes(condition)) throw new Error("Unsupported collectible condition");
  const suffix = `--${condition}--${stableId}`;
  const maxNameLength = Math.max(1, 120 - suffix.length);
  const safeName = name.slice(0, maxNameLength).replace(/-+$/g, "") || "collectible";
  return `${safeName}${suffix}`;
}

export function parsePriceSlug(value) {
  const raw = String(value || "").trim().toLowerCase();
  const match = /--(raw|graded)--([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(raw);
  if (!match) return null;
  return { conditionType: match[1], id: match[2] };
}

export function median(values) {
  const nums = values
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

export function askingVsSoldGapPct(askingMedian, soldMedian) {
  if (askingMedian === null || askingMedian === undefined || askingMedian === "" ||
      soldMedian === null || soldMedian === undefined || soldMedian === "") return null;
  const asking = Number(askingMedian);
  const sold = Number(soldMedian);
  if (!Number.isFinite(asking) || !Number.isFinite(sold) || asking <= 0 || sold <= 0) return null;
  return Math.round(((asking - sold) / sold) * 1000) / 10;
}

export function hasPublicPriceEvidence(sales) {
  const usable = Array.isArray(sales)
    ? sales.filter((sale) => Number.isFinite(Number(sale?.amount)) && Number(sale.amount) > 0)
    : [];
  return usable.length >= 2;
}
