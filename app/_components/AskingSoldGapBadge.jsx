import { askingVsSoldGapPct } from "../../lib/price-page-core.mjs";

export default function AskingSoldGapBadge({ askingMedian, soldMedian }) {
  const gap = askingVsSoldGapPct(askingMedian, soldMedian);
  const label = gap === null ? "Asking vs sold: no data" : `Asking vs sold: ${gap}%`;
  return (
    <span
      data-gap-status={gap === null ? "no-data" : "verified-math"}
      style={{
        display: "inline-block",
        border: "1px solid currentColor",
        borderRadius: 999,
        padding: "6px 10px",
        fontWeight: 700,
      }}
    >
      {label}
    </span>
  );
}
