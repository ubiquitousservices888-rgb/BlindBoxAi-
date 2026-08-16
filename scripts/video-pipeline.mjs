import fs from "node:fs";
import path from "node:path";
import { approve, createBufferPublisher, createRenderRecord, generateVideoScript, markRendered, publishApproved, reject, renderCreatomate, selectDailyProduct, validateVerifiedProduct } from "../lib/video-pipeline.mjs";
import { assertBufferPublishReady } from "../lib/buffer-media-safety.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const dataFile = process.env.VIDEO_PRODUCTS_FILE ?? path.join(root, "data/verified-video-products.json");
const stateFile = process.env.VIDEO_STATE_FILE ?? path.join(root, "output/video-pipeline/state.json");
const command = process.argv[2] ?? "validate";
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const write = (value) => { fs.mkdirSync(path.dirname(stateFile), { recursive: true }); fs.writeFileSync(stateFile, JSON.stringify(value, null, 2) + "\n"); };
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? null : process.argv[i + 1]; };

if (command === "validate") {
  const products = read(dataFile).products ?? [];
  for (const product of products) validateVerifiedProduct(product);
  console.log(`Validated ${products.length} verified video product(s).`);
} else if (command === "daily") {
  const now = new Date();
  const products = read(dataFile).products ?? [];
  const product = selectDailyProduct(products, now);
  const channels = (process.env.VIDEO_CHANNELS ?? "twitter,tiktok").split(",").map((value) => value.trim()).filter(Boolean);
  if (!channels.length) throw new Error("VIDEO_CHANNELS must contain at least one Buffer service");
  const record = createRenderRecord(product, generateVideoScript(product, now), channels, now);
  const rendered = await renderCreatomate({ apiKey: process.env.CREATOMATE_API_KEY, templateId: process.env.CREATOMATE_TEMPLATE_ID, record });
  write(markRendered(record, rendered));
  console.log(`READY_FOR_REVIEW: ${record.id}`);
} else if (command === "approve") {
  const record = approve(read(stateFile)); write(record); console.log(`APPROVED: ${record.id}`);
} else if (command === "reject") {
  const record = reject(read(stateFile), arg("reason")); write(record); console.log(`REJECTED: ${record.id}`);
} else if (command === "publish") {
  const current = read(stateFile);
  await assertBufferPublishReady(current);
  const publisher = createBufferPublisher({
    token: process.env.BUFFER_API_TOKEN,
    organizationId: process.env.BUFFER_ORGANIZATION_ID,
  });
  const record = await publishApproved(current, publisher); write(record); console.log(`${record.state}: ${record.id}`);
  if (record.state !== "PUBLISHED") process.exitCode = 2;
} else throw new Error(`Unknown command: ${command}`);
