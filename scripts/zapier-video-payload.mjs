import fs from "node:fs";
import path from "node:path";
import {
  DISCLOSURE,
  generateVideoScript,
  selectDailyProduct,
  videoCaptionForService,
} from "../lib/video-pipeline.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const productsFile = process.env.VIDEO_PRODUCTS_FILE ?? path.join(root, "data/verified-video-products.json");
const outputFile = process.env.ZAPIER_VIDEO_PAYLOAD_FILE ?? path.join(root, "output/zapier/video-request.json");
const templateId = process.env.CREATOMATE_TEMPLATE_ID ?? "8b360817-3e33-40e3-bbb4-55a8b508f06e";
const channels = [...new Set((process.env.VIDEO_CHANNELS ?? "twitter,tiktok")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean))];

if (!channels.length) throw new Error("VIDEO_CHANNELS must contain at least one service");

const now = new Date();
const data = JSON.parse(fs.readFileSync(productsFile, "utf8"));
const product = selectDailyProduct(data.products ?? [], now);
const script = generateVideoScript(product, now);
const id = `${now.toISOString().slice(0, 10)}-${product.id}`;

const payload = {
  schema: "blindboxai/zapier-video-request/v1",
  id,
  state: "READY_FOR_ZAPIER",
  generatedAt: now.toISOString(),
  approvalRequired: true,
  creatomate: {
    templateId,
    modifications: {
      Title: script.title,
      Narration: script.narration,
    },
  },
  product: {
    id: product.id,
    name: product.name,
    productUrl: product.productUrl,
  },
  verifiedClaims: product.claims.map((claim) => ({ ...claim })),
  sourceUrls: product.sources.map((source) => source.url),
  social: {
    channels,
    caption: script.caption,
    captions: Object.fromEntries(channels.map((channel) => [channel, videoCaptionForService(script, channel)])),
    disclosure: DISCLOSURE,
  },
  safety: {
    verifiedDataOnly: true,
    manualApprovalBeforeBuffer: true,
    duplicatePublishPreventionRequired: true,
  },
};

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2) + "\n");
console.log(`READY_FOR_ZAPIER: ${id}`);
console.log(`Payload: ${outputFile}`);

const webhookUrl = String(process.env.ZAPIER_VIDEO_WEBHOOK_URL ?? "").trim();
if (webhookUrl) {
  const parsed = new URL(webhookUrl);
  if (parsed.protocol !== "https:" || parsed.hostname !== "hooks.zapier.com") {
    throw new Error("ZAPIER_VIDEO_WEBHOOK_URL must be an HTTPS hooks.zapier.com URL");
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) throw new Error(`Zapier webhook failed: ${response.status}`);
  console.log(`ZAPIER_WEBHOOK_ACCEPTED: ${response.status}`);
} else {
  console.log("ZAPIER_WEBHOOK_NOT_CONFIGURED: artifact generated only");
}
