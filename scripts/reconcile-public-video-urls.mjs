import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { DISCLOSURE } from "../lib/daily-product-pipeline.mjs";
import { assertApprovedReviewVideoUrl } from "../lib/review-publish-safety.mjs";
import { assertPublicPostProof, canonicalPublicPostUrl, probePublicPostHttp, publicProofDiagnostics, readReviewBufferPost, resolveReviewBufferChannel } from "../lib/buffer-review-publisher.mjs";

function sourceMatchType(value, expected) {
  if (value === expected) return "APPROVED_SOURCE";
  try {
    const source = new URL(value), approved = new URL(expected);
    if (source.protocol !== "https:") return "NON_HTTPS_SOURCE";
    if (source.origin === approved.origin && source.pathname === approved.pathname) return "SAME_PATH_DIFFERENT_URL";
    if (source.origin === approved.origin) return "SAME_STORAGE_DIFFERENT_SOURCE";
    return "OTHER_HTTPS_SOURCE";
  } catch { return "SOURCE_NOT_A_URL"; }
}

function hasTrackedCta(text, runId, channel) {
  return [...String(text).matchAll(/https:\/\/[^\s<>"']+/g)].some(([value]) => {
    try {
      const url = new URL(value);
      return ["blindboxai.com", "www.blindboxai.com"].includes(url.hostname) && !url.username && !url.password && !url.port &&
        url.searchParams.getAll("campaign").length === 1 && url.searchParams.get("campaign") === `bb-${runId}` &&
        url.searchParams.getAll("source").length === 1 && url.searchParams.get("source") === channel;
    } catch { return false; }
  });
}

// Exact known post IDs only. No mutations, captions in output, fuzzy search,
// uploads, DB writes, or attempts to manufacture missing historical evidence.
export async function reconcilePublicVideoUrls({ inventory, token, organizationId, fetchImpl = fetch, probeImpl = probePublicPostHttp }) {
  if (!String(token ?? "").trim() || !String(organizationId ?? "").trim()) throw new Error("Buffer configuration unavailable");
  if (!Array.isArray(inventory) || inventory.length > 100) throw new Error("Invalid public URL inventory");
  const seen = new Set();
  for (const row of inventory) {
    if (!/^rv-[a-f0-9]{16}$/.test(row.research_run_id)) throw new Error("Invalid inventory run ID");
    assertApprovedReviewVideoUrl(row.video_url);
    for (const [channel, id] of Object.entries(row.buffer_post_ids || {})) {
      if (id == null) continue;
      if (!["youtube", "tiktok"].includes(channel) || !/^[A-Za-z0-9_-]{1,200}$/.test(String(id)) || seen.has(String(id))) {
        throw new Error("Invalid or duplicate inventory post identity");
      }
      seen.add(String(id));
    }
  }
  const readOnlyFetch = (url, init) => {
    if (/mutation\b/.test(JSON.parse(init.body).query)) throw new Error("Mutation refused by receipt reconciliation");
    return fetchImpl(url, { ...init, redirect: "error", signal: AbortSignal.timeout(12000) });
  };
  const targets = new Map();
  const receipts = [];
  for (const row of inventory) {
    for (const channel of ["youtube", "tiktok"]) {
      const postId = row.buffer_post_ids?.[channel];
      const base = { researchRunId: row.research_run_id, channel, postId: postId || null, status: "UNVERIFIED" };
      if (!postId) { receipts.push({ ...base, reason: "MISSING_PROVIDER_POST_ID" }); continue; }
      if (!targets.has(channel)) {
        try { targets.set(channel, await resolveReviewBufferChannel({ token, organizationId, channel, fetchImpl: readOnlyFetch })); }
        catch { targets.set(channel, null); }
      }
      const target = targets.get(channel);
      if (!target) { receipts.push({ ...base, reason: "EXACT_DESTINATION_UNAVAILABLE" }); continue; }
      let post;
      try { post = await readReviewBufferPost({ token, postId, fetchImpl: readOnlyFetch }); }
      catch { receipts.push({ ...base, reason: "PROVIDER_RECEIPT_UNAVAILABLE" }); continue; }
      if (!post || post.id !== postId || post.channelId !== target.id) {
        receipts.push({ ...base, reason: "PROVIDER_IDENTITY_MISMATCH" }); continue;
      }
      if (post.status !== "sent") { receipts.push({ ...base, reason: "PROVIDER_NOT_SENT" }); continue; }
      let candidatePublicUrl;
      try { candidatePublicUrl = canonicalPublicPostUrl(channel, post.externalLink); } catch {}
      const observed = { ...base, ...(candidatePublicUrl ? { candidatePublicUrl } : {}) };
      if (!Array.isArray(post.assets) || post.assets.length !== 1 || post.assets[0]?.source !== row.video_url) {
        receipts.push({ ...observed, reason: "APPROVED_MEDIA_IDENTITY_UNVERIFIED", sourceAssetCount: Array.isArray(post.assets) ? post.assets.length : 0,
          sourceMatchTypes: Array.isArray(post.assets) ? post.assets.slice(0, 4).map(asset => sourceMatchType(asset.source, row.video_url)) : [] }); continue;
      }
      if (!String(post.text).includes(DISCLOSURE) || !hasTrackedCta(post.text, row.research_run_id, channel)) {
        receipts.push({ ...observed, reason: "APPROVED_ATTRIBUTION_UNVERIFIED" }); continue;
      }
      try {
        const publicUrl = canonicalPublicPostUrl(channel, post.externalLink);
        const proof = await probeImpl({ channel, externalLink: publicUrl });
        const mediaId = assertPublicPostProof({ channel, publicUrl, proof });
        receipts.push({ ...base, status: "VERIFIED", publicUrl, mediaId, checkedAt: proof.checkedAt });
      } catch (error) { receipts.push({ ...observed, reason: "PUBLIC_MEDIA_UNVERIFIED", ...publicProofDiagnostics(error) }); }
    }
  }
  return receipts;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const { rows } = JSON.parse(readFileSync(new URL("../data/public-video-receipt-inventory.json", import.meta.url), "utf8"));
    const receipts = await reconcilePublicVideoUrls({ inventory: rows, token: process.env.BUFFER_API_TOKEN, organizationId: process.env.BUFFER_ORGANIZATION_ID });
    console.log(`PUBLIC_URL_RECEIPT_REVISION: ${/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA || "") ? process.env.GITHUB_SHA : "UNVERIFIED"}`);
    for (const receipt of receipts) console.log(`PUBLIC_URL_RECEIPT: ${JSON.stringify(receipt)}`);
    console.log(`PUBLIC_URL_RECONCILIATION: ${receipts.filter(r => r.status === "VERIFIED").length}/${receipts.length} verified; zero publish or database mutations`);
    if (receipts.some(r => r.status !== "VERIFIED")) process.exitCode = 2;
  } catch {
    console.error("PUBLIC_URL_RECONCILIATION: FAIL_CLOSED; configuration or inventory unavailable");
    process.exitCode = 1;
  }
}
