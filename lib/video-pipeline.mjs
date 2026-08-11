import crypto from "node:crypto";
import { bufferGraphQL } from "./daily-product-pipeline.mjs";
import {
  CAPTION_LIMITS,
  assertBufferOrganizationId,
  discoverBufferChannels,
  findExistingBufferPostPaginated,
} from "./daily-product-publish-safety.mjs";

export const DISCLOSURE = "#ad BlindBoxAI may earn a commission from qualifying purchases.";
export const STATES = Object.freeze({
  RENDERING: "RENDERING", READY: "READY_FOR_REVIEW", APPROVED: "APPROVED",
  REJECTED: "REJECTED", PARTIAL: "PARTIALLY_PUBLISHED", PUBLISHED: "PUBLISHED",
  FAILED: "FAILED",
});

const isoDate = (value) => /^\d{4}-\d{2}-\d{2}T/.test(value ?? "");
const httpsUrl = (value) => { try { return new URL(value).protocol === "https:"; } catch { return false; } };
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");

export function validateVerifiedProduct(product, now = new Date()) {
  if (!product?.id || !product?.name || !httpsUrl(product?.productUrl)) throw new Error("Product identity and HTTPS productUrl are required");
  if (!Array.isArray(product.sources) || product.sources.length === 0) throw new Error("At least one verified source is required");
  const sources = new Map();
  for (const source of product.sources) {
    if (!source.id || source.status !== "verified" || !httpsUrl(source.url) || !isoDate(source.checkedAt)) throw new Error(`Source ${source.id ?? "unknown"} is not verified`);
    const age = now.getTime() - new Date(source.checkedAt).getTime();
    if (age < 0 || age > 30 * 86400000) throw new Error(`Source ${source.id} is stale or future-dated`);
    sources.set(source.id, source);
  }
  if (!Array.isArray(product.claims) || product.claims.length === 0) throw new Error("At least one sourced claim is required");
  for (const claim of product.claims) {
    if (!claim?.text || !claim.sourceId || !sources.has(claim.sourceId)) throw new Error("Every claim must cite a verified sourceId");
  }
  return product;
}

export function selectDailyProduct(products, date = new Date()) {
  const eligible = products.filter((p) => { try { validateVerifiedProduct(p, date); return true; } catch { return false; } });
  if (!eligible.length) throw new Error("No products pass verified-data requirements");
  const day = date.toISOString().slice(0, 10);
  const index = Number.parseInt(hash(day).slice(0, 8), 16) % eligible.length;
  return eligible.sort((a, b) => a.id.localeCompare(b.id))[index];
}

export function generateVideoScript(product, date = new Date()) {
  validateVerifiedProduct(product, date);
  const facts = product.claims.slice(0, 3).map((c) => c.text);
  const narration = [`Collector check: ${product.name}.`, ...facts, `See the verified details: ${product.productUrl}`].join(" ");
  const caption = `${product.name}\n\n${facts.join("\n")}\n\n${product.productUrl}\n\n${DISCLOSURE}`;
  if (!caption.includes(DISCLOSURE) || !caption.includes(product.productUrl)) throw new Error("BlindBoxAI CTA and EPN disclosure are required");
  return { title: product.name, narration, caption, facts, productUrl: product.productUrl };
}

export function videoCaptionForService(script, service) {
  const productUrl = String(script?.productUrl ?? "").trim();
  if (!httpsUrl(productUrl)) throw new Error("Video script requires an HTTPS BlindBoxAI CTA");

  const facts = Array.isArray(script?.facts) ? script.facts : [];
  const lead = [String(script?.title ?? "").trim(), facts.join("\n")].filter(Boolean).join("\n\n");
  const suffix = `\n\n${productUrl}\n\n${DISCLOSURE}`;
  const fullCaption = `${lead}${suffix}`;
  const limit = CAPTION_LIMITS[service];

  if (!limit || fullCaption.length <= limit) return fullCaption;
  if (suffix.length >= limit) throw new Error(`${service}: required CTA/disclosure cannot fit platform limit`);

  const room = limit - suffix.length;
  const compactLead = room > 1 ? `${lead.slice(0, room - 1).trimEnd()}…` : "";
  const compacted = `${compactLead}${suffix}`;
  if (compacted.length > limit || !compacted.includes(productUrl) || !compacted.includes(DISCLOSURE)) {
    throw new Error(`${service}: safe video caption could not be constructed`);
  }
  return compacted;
}

export function createRenderRecord(product, script, channels, now = new Date()) {
  const id = `${now.toISOString().slice(0, 10)}-${product.id}`;
  return { id, productId: product.id, state: STATES.RENDERING, script, channels,
    render: { provider: "creatomate", id: null, videoUrl: null },
    publications: Object.fromEntries(channels.map((c) => [c, { status: "pending", externalId: null, error: null }])),
    approvedAt: null, rejectedAt: null, rejectionReason: null, createdAt: now.toISOString(), updatedAt: now.toISOString() };
}

export function markRendered(record, render, now = new Date()) {
  if (record.state !== STATES.RENDERING) throw new Error("Only RENDERING records can become review-ready");
  if (!render?.id || !httpsUrl(render.videoUrl) || !/\.mp4(?:$|\?)/i.test(render.videoUrl)) throw new Error("Creatomate must return a hosted HTTPS MP4 URL");
  return { ...record, state: STATES.READY, render: { provider: "creatomate", id: render.id, videoUrl: render.videoUrl }, updatedAt: now.toISOString() };
}

export function approve(record, now = new Date()) {
  if (record.state !== STATES.READY) throw new Error("Only READY_FOR_REVIEW records can be approved");
  if (!record.script?.caption?.includes(DISCLOSURE) || !record.script?.caption?.includes(record.script?.productUrl)) throw new Error("Cannot approve without BlindBoxAI CTA and EPN disclosure");
  return { ...record, state: STATES.APPROVED, approvedAt: now.toISOString(), updatedAt: now.toISOString() };
}

export function reject(record, reason, now = new Date()) {
  if (record.state !== STATES.READY) throw new Error("Only READY_FOR_REVIEW records can be rejected");
  if (!reason?.trim()) throw new Error("Rejection reason is required");
  return { ...record, state: STATES.REJECTED, rejectedAt: now.toISOString(), rejectionReason: reason.trim(), updatedAt: now.toISOString() };
}

export async function publishApproved(record, publishChannel, now = new Date()) {
  if (![STATES.APPROVED, STATES.PARTIAL].includes(record.state)) throw new Error("Manual approval is required before publishing");
  if (!record.render?.videoUrl || !record.script?.caption?.includes(DISCLOSURE) || !record.script?.caption?.includes(record.script?.productUrl)) throw new Error("Hosted video, BlindBoxAI CTA, and EPN disclosure are required");
  const publications = structuredClone(record.publications);
  for (const channel of record.channels) {
    if (publications[channel]?.status === "published") continue;
    try {
      const result = await publishChannel({
        channel,
        videoUrl: record.render.videoUrl,
        caption: videoCaptionForService(record.script, channel),
        idempotencyKey: `${record.id}:${channel}`,
      });
      publications[channel] = { status: "published", externalId: result.id, error: null };
    } catch (error) {
      publications[channel] = { status: "failed", externalId: null, error: error.message };
    }
  }
  const values = Object.values(publications);
  const state = values.every((p) => p.status === "published") ? STATES.PUBLISHED : STATES.PARTIAL;
  return { ...record, state, publications, updatedAt: now.toISOString() };
}

export async function renderCreatomate({ apiKey, templateId, record, fetchImpl = fetch, pollMs = 3000, maxPolls = 60 }) {
  if (!apiKey || !templateId) throw new Error("CREATOMATE_API_KEY and CREATOMATE_TEMPLATE_ID are required");
  const response = await fetchImpl("https://api.creatomate.com/v2/renders", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ template_id: templateId, modifications: { "Title": record.script.title, "Narration": record.script.narration } }) });
  if (!response.ok) throw new Error(`Creatomate render request failed: ${response.status}`);
  let render = (await response.json())[0];
  for (let i = 0; i < maxPolls && !["succeeded", "failed"].includes(render.status); i++) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    const poll = await fetchImpl(`https://api.creatomate.com/v2/renders/${render.id}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!poll.ok) throw new Error(`Creatomate poll failed: ${poll.status}`);
    render = await poll.json();
  }
  if (render.status !== "succeeded") throw new Error(`Creatomate render did not succeed: ${render.status}`);
  return { id: render.id, videoUrl: render.url };
}

export async function discoverBufferVideoChannels({ token, organizationId, services, fetchImpl = fetch }) {
  const requested = [...new Set((services ?? []).map((service) => String(service).trim()).filter(Boolean))];
  if (!requested.length) throw new Error("At least one Buffer video service is required");

  const active = await discoverBufferChannels({
    token,
    organizationId,
    services: requested,
    fetchImpl,
  });

  const resolved = {};
  for (const service of requested) {
    const matches = active.filter((channel) => channel.service === service);
    if (matches.length !== 1) throw new Error(`${service}: expected exactly one active Buffer channel, found ${matches.length}`);
    resolved[service] = matches[0];
  }
  return resolved;
}

export function createBufferPublisher({ token, organizationId, fetchImpl = fetch }) {
  if (!token) throw new Error("BUFFER_API_TOKEN is required");
  const targetId = assertBufferOrganizationId(organizationId);
  const resolvedChannels = new Map();

  return async ({ channel, videoUrl, caption }) => {
    if (!httpsUrl(videoUrl) || !/\.mp4(?:$|\?)/i.test(videoUrl)) throw new Error("Buffer video URL must be a hosted HTTPS MP4");
    if (!caption?.includes(DISCLOSURE)) throw new Error("Buffer caption must include the affiliate disclosure");
    const limit = CAPTION_LIMITS[channel];
    if (limit && caption.length > limit) throw new Error(`${channel}: caption exceeds ${limit} characters`);

    if (!resolvedChannels.has(channel)) {
      const channels = await discoverBufferVideoChannels({ token, organizationId: targetId, services: [channel], fetchImpl });
      resolvedChannels.set(channel, channels[channel]);
    }
    const target = resolvedChannels.get(channel);

    const existing = await findExistingBufferPostPaginated({
      token,
      organizationId: targetId,
      channelId: target.id,
      text: caption,
      fetchImpl,
    });
    if (existing?.id) return { id: existing.id, duplicate: true };

    const data = await bufferGraphQL(
      token,
      `mutation CreateVideo($text: String!, $channelId: ChannelId!, $videoUrl: String!) {
        createPost(input: {
          text: $text
          channelId: $channelId
          schedulingType: automatic
          mode: addToQueue
          assets: [{ video: { url: $videoUrl } }]
        }) {
          ... on PostActionSuccess { post { id text status channelId } }
          ... on MutationError { message }
        }
      }`,
      { text: caption, channelId: target.id, videoUrl },
      fetchImpl,
    );

    const result = data?.createPost;
    if (result?.message) throw new Error(`Buffer ${channel} publish failed: ${result.message}`);
    if (!result?.post?.id) throw new Error(`Buffer ${channel} publish returned no post ID`);
    return { id: result.post.id, duplicate: false };
  };
}
