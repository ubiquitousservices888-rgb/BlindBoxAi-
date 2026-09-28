export function normalizeReviewRunId(value) {
  const raw = String(value ?? "");
  if (raw === "") return "";
  if (/^[a-f0-9]{16}$/.test(raw)) return `rv-${raw}`;
  if (/^rv-[a-f0-9]{16}$/.test(raw)) return raw;
  throw new Error(
    "PUBLISH_RESEARCH_RUN_ID must be rv- followed by exactly 16 lowercase hex characters (the rv- prefix may be omitted)",
  );
}
