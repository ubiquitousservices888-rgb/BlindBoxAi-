// Decide whether a published-video ledger row may be updated to a newer
// canonical copy whose channel list only grew (for example LinkedIn added
// after YouTube), or whose earlier "partial" status is now "published".
// Every other field and every earlier Buffer post ID must be unchanged.
// Returns the patch to write, or null when the change is a real conflict.
const sorted = (value) => JSON.stringify(Object.keys(value).sort().reduce((acc, key) => {
  acc[key] = value[key];
  return acc;
}, {}));

export function feedChannelGrowthPatch(existing, canonical) {
  const fixed = ["research_run_id", "title", "vertical", "video_url", "campaign_id"];
  if (fixed.some((key) => existing?.[key] !== canonical?.[key])) return null;
  if (canonical?.status !== "published" || !["published", "partial"].includes(existing?.status)) return null;
  const before = Array.isArray(existing.channels) ? existing.channels : [];
  const after = Array.isArray(canonical.channels) ? canonical.channels : [];
  if (!before.every((channel) => after.includes(channel))) return null;
  const beforeIds = existing.buffer_post_ids && typeof existing.buffer_post_ids === "object" ? existing.buffer_post_ids : {};
  const afterIds = canonical.buffer_post_ids && typeof canonical.buffer_post_ids === "object" ? canonical.buffer_post_ids : {};
  if (!Object.entries(beforeIds).every(([channel, id]) => afterIds[channel] === id)) return null;
  const grew = after.length > before.length || sorted(afterIds) !== sorted(beforeIds);
  const completed = existing.status === "partial";
  if (!grew && !completed) return null;
  return { channels: after, buffer_post_ids: afterIds, status: "published" };
}
