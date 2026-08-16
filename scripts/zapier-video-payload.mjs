import fs from "node:fs";
import path from "node:path";
import {
  DISCLOSURE,
  generateVideoScript,
  selectDailyProduct,
  videoCaptionForService,
} from "../lib/video-pipeline.mjs";
import { evaluateVisualManifest } from "../lib/verified-visual-asset.mjs";
import {
  disclosureFirstCaption,
  hardenGenerativeVideoScript,
  sanitizeProductForGenerativeVideo,
} from "../lib/epn-genai-safety.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const productsFile = process.env.VIDEO_PRODUCTS_FILE ?? path.join(root, "data/verified-video-products.json");
const outputFile = process.env.ZAPIER_VIDEO_PAYLOAD_FILE ?? path.join(root, "output/zapier/video-request.json");
const templateId = process.env.CREATOMATE_TEMPLATE_ID ?? "8b360817-3e33-40e3-bbb4-55a8b508f06e";
const channels = [...new Set((process.env.VIDEO_CHANNELS ?? "youtube,tiktok")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean))];

if (!channels.length) throw new Error("VIDEO_CHANNELS must contain at least one service");

const now = new Date();
const data = JSON.parse(fs.readFileSync(productsFile, "utf8"));
const product = selectDailyProduct(data.products ?? [], now);
const id = `${now.toISOString().slice(0, 10)}-${product.id}`;
const visualManifest = evaluateVisualManifest({
  productId: product.id,
  assets: product.visualAssets ?? [],
});

fs.mkdirSync(path.dirname(outputFile), { recursive: true });

if (visualManifest.status !== "APPROVED_VISUAL_MANIFEST") {
  const holdPayload = {
    schema: "blindboxai/zapier-video-request/v3",
    id,
    state: "HOLD_FOR_VISUAL",
    generatedAt: now.toISOString(),
    approvalRequired: true,
    product: {
      id: product.id,
      name: product.name,
      productUrl: product.productUrl,
    },
    visuals: {
      gate: visualManifest.status,
      reasons: visualManifest.reasons,
      assets: visualManifest.renderableAssets,
    },
    social: { channels },
    safety: {
      verifiedDataOnly: true,
      approvedVisualsOnly: true,
      noWebhookSentWhileHeld: true,
      manualApprovalBeforePublish: true,
    },
  };
  fs.writeFileSync(outputFile, JSON.stringify(holdPayload, null, 2) + "\n");
  console.log(`HOLD_FOR_VISUAL: ${id}`);
  console.log(`VISUAL_GATE: ${visualManifest.status}`);
  console.log(`VISUAL_HOLD_REASONS: ${visualManifest.reasons.join(",")}`);
  console.log(`Payload: ${outputFile}`);
} else {
  const genAiProduct = sanitizeProductForGenerativeVideo(product);
  const baseScript = generateVideoScript(genAiProduct, now);
  const script = hardenGenerativeVideoScript(baseScript, DISCLOSURE);

  const payload = {
    schema: "blindboxai/zapier-video-request/v3",
    id,
    state: "READY_FOR_ZAPIER",
    generatedAt: now.toISOString(),
    approvalRequired: true,
    creatomate: {
      templateId,
      modifications: {
        Title: script.displayTitle,
        Narration: script.narration,
      },
    },
    product: {
      id: product.id,
      name: product.name,
      productUrl: product.productUrl,
    },
    visuals: {
      gate: visualManifest.status,
      assets: visualManifest.renderableAssets,
    },
    verifiedClaims: genAiProduct.claims.map((claim) => ({ ...claim })),
    sourceUrls: genAiProduct.sources.map((source) => source.url),
    social: {
      channels,
      caption: script.caption,
      captions: Object.fromEntries(channels.map((channel) => [
        channel,
        disclosureFirstCaption(videoCaptionForService(script, channel), DISCLOSURE),
      ])),
      disclosure: DISCLOSURE,
    },
    safety: {
      verifiedDataOnly: true,
      ebayDataExcludedFromGenerativePath: true,
      audibleAffiliateDisclosureFirst: true,
      visualAffiliateDisclosureAtOpening: true,
      approvedVisualsOnly: true,
      manualApprovalBeforePublish: true,
      duplicatePublishPreventionRequired: true,
    },
  };

  fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2) + "\n");
  console.log(`READY_FOR_ZAPIER: ${id}`);
  console.log(`VISUAL_GATE: ${visualManifest.status}`);
  console.log(`GENAI_EBAY_DATA_EXCLUDED: true`);
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
}
