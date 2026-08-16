import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const productsFile = process.env.VIDEO_PRODUCTS_FILE ?? path.join(root, "data/verified-video-products.json");
const outputFile = process.env.VISUAL_DISCOVERY_OUTPUT ?? path.join(root, "output/visuals/candidates.json");

function extractMetaImage(html) {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].replaceAll("&amp;", "&");
  }
  return null;
}

function isApprovedDiscoverySource(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && (parsed.hostname === "www.popmart.com" || parsed.hostname.endsWith(".popmart.com"));
  } catch {
    return false;
  }
}

function matchConfidenceForSource(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.includes("/products/") ? "candidate-exact" : "candidate-unverified";
  } catch {
    return "candidate-unverified";
  }
}

export async function discoverProductVisual(product, fetchImpl = fetch) {
  const candidates = [];
  for (const source of product.sources ?? []) {
    if (source.status !== "verified" || !isApprovedDiscoverySource(source.url)) continue;
    try {
      const response = await fetchImpl(source.url, {
        headers: { "User-Agent": "BlindBoxAI-VisualDiscovery/1.0" },
        redirect: "follow",
      });
      if (!response.ok) {
        candidates.push({
          productId: product.id,
          sourcePage: source.url,
          state: "DISCOVERY_FAILED",
          reason: `http-${response.status}`,
        });
        continue;
      }
      const html = await response.text();
      const imageUrl = extractMetaImage(html);
      if (!imageUrl) {
        candidates.push({
          productId: product.id,
          sourcePage: source.url,
          state: "DISCOVERY_FAILED",
          reason: "missing-meta-image",
        });
        continue;
      }
      const productMatch = matchConfidenceForSource(source.url);
      candidates.push({
        productId: product.id,
        productName: product.name,
        url: imageUrl,
        sourcePage: source.url,
        sourceType: "official-product-image",
        productMatch,
        reuseRights: "unverified",
        aiUseAllowed: false,
        state: "REFERENCE_ONLY",
        discoveredAt: new Date().toISOString(),
        note: productMatch === "candidate-exact"
          ? "Official product-page image candidate. Exact visual identity still requires review and reuse rights must be established before render approval."
          : "Official collection/source image candidate. Exact product match and reuse rights must both be established before render approval.",
      });
      break;
    } catch (error) {
      candidates.push({
        productId: product.id,
        sourcePage: source.url,
        state: "DISCOVERY_FAILED",
        reason: String(error?.message || error),
      });
    }
  }
  return candidates;
}

async function main() {
  const data = JSON.parse(fs.readFileSync(productsFile, "utf8"));
  const results = [];
  for (const product of data.products ?? []) {
    results.push(...await discoverProductVisual(product));
  }
  const output = {
    schema: "blindboxai/visual-discovery-candidates/v1",
    generatedAt: new Date().toISOString(),
    candidates: results,
  };
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2) + "\n");
  console.log(`VISUAL_DISCOVERY_COMPLETE: ${results.length} candidates`);
  console.log(`Output: ${outputFile}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
