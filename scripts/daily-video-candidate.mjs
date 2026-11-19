import fs from 'node:fs';
import path from 'node:path';
import { planDailyVideo } from '../lib/daily-video-plan.mjs';
import { validateVerifiedProduct, generateVideoScript, DISCLOSURE } from '../lib/video-pipeline.mjs';
import { hardenGenerativeVideoScript } from '../lib/epn-genai-safety.mjs';

const outputDir = 'output/daily-video';
const historyDir = path.join(outputDir, 'history');
const products = JSON.parse(fs.readFileSync('data/verified-video-products.json', 'utf8')).products;
const history = fs.existsSync(historyDir) ? fs.readdirSync(historyDir)
  .filter((name) => /^candidate-[0-9]+\.json$/.test(name))
  .map((name) => JSON.parse(fs.readFileSync(path.join(historyDir, name), 'utf8'))) : [];
const now = new Date();
const monthlyLimitRaw = process.env.DAILY_VIDEO_MAX_RENDERS_PER_MONTH || '0';
if (!/^(0|[1-9][0-9]?)$/.test(monthlyLimitRaw)) throw new Error('Invalid monthly render cap');
const candidate = planDailyVideo({
  products, history, now,
  validateProduct: validateVerifiedProduct,
  makeScript: (product, date) => hardenGenerativeVideoScript(generateVideoScript(product, date), DISCLOSURE),
  monthlyRenderLimit: Number(monthlyLimitRaw),
});
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'candidate.json'), JSON.stringify(candidate, null, 2) + '\n');
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT,
    'has_candidate=' + (candidate.status === 'READY_TO_RENDER') + '\n' +
    'can_render=' + (candidate.canRender === true) + '\n' +
    'product_id=' + (candidate.productId || '') + '\n');
}
console.log('DAILY_VIDEO_STATUS=' + candidate.status);
console.log('DAILY_VIDEO_ELIGIBLE=' + candidate.eligibleCount);
console.log('DAILY_VIDEO_UNUSED=' + candidate.availableCount);
console.log('DAILY_VIDEO_RENDER_ALLOWED_BY_CAP=' + (candidate.canRender === true));
