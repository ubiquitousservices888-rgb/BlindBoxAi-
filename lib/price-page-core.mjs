export function priceSlug(value) {
  return String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function median(values) {
  const nums = values.map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

export function askingVsSoldGapPct(askingMedian, soldMedian) {
  const asking = Number(askingMedian);
  const sold = Number(soldMedian);
  if (!Number.isFinite(asking) || !Number.isFinite(sold) || sold <= 0) return null;
  return Math.round(((asking - sold) / sold) * 1000) / 10;
}
