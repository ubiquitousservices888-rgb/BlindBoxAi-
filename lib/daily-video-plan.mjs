import { createHash } from 'node:crypto';
const DAY_MS = 86_400_000;
const hash = (value) => createHash('sha256').update(value).digest('hex');
export function planDailyVideo({ products, history, now, validateProduct, makeScript, monthlyRenderLimit = 0 }) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('Valid UTC date required');
  if (!Array.isArray(products) || !Array.isArray(history)) throw new Error('Product list and complete artifact history are required');
  if (typeof validateProduct !== 'function' || typeof makeScript !== 'function') throw new Error('Production validators are required');
  if (!Number.isInteger(monthlyRenderLimit) || monthlyRenderLimit < 0 || monthlyRenderLimit > 31) throw new Error('Monthly render limit must be 0–31');
  const today = now.toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const validHistory = history.map((item) => {
    if (!item || !/^[a-z0-9][a-z0-9-]{1,79}$/.test(String(item.productId || '')) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(String(item.date || ''))) throw new Error('Malformed artifact history; fail closed');
    const dateMs = Date.parse(item.date + 'T00:00:00.000Z');
    if (!Number.isFinite(dateMs) || new Date(dateMs).toISOString().slice(0, 10) !== item.date || dateMs > now.getTime()) throw new Error('Invalid artifact date');
    return { productId: item.productId, date: item.date, dateMs };
  });
  const recentlyUsed = new Set(validHistory.filter((item) => now.getTime() - item.dateMs < 30 * DAY_MS).map((item) => item.productId));
  const eligible = products.filter((product) => {
    if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(String(product?.id || ''))) return false;
    try { validateProduct(product, now); return true; } catch { return false; }
  }).sort((a, b) => a.id.localeCompare(b.id));
  const available = eligible.filter((product) => !recentlyUsed.has(product.id));
  const monthAttempts = validHistory.filter((item) => item.date.startsWith(month)).length;
  if (!available.length) {
    return { status: 'NO_UNUSED_VERIFIED_PRODUCT', date: today, eligibleCount: eligible.length,
      availableCount: 0, monthlyAttempts: monthAttempts, canRender: false };
  }
  const index = Number.parseInt(hash(today).slice(0, 8), 16) % available.length;
  const product = available[index];
  const script = makeScript(product, now);
  const url = new URL(String(script?.productUrl || ''), 'https://invalid.example');
  const firstParty = url.protocol === 'https:' && ['blindboxai.com', 'www.blindboxai.com'].includes(url.hostname) &&
    !url.username && !url.password && !url.port &&
    (url.pathname.startsWith('/series/') || url.pathname === '/shop/accessories');
  if (!firstParty || (script.productUrl !== product.productUrl && script.productUrl !== 'https://blindboxai.com/shop/accessories') ||
      !script?.caption?.includes('#ad BlindBoxAI may earn a commission from qualifying purchases.')) {
    throw new Error('Verified script must include first-party CTA and disclosure');
  }
  return {
    status: 'READY_TO_RENDER', date: today, productId: product.id, productName: product.name,
    productUrl: product.productUrl, script, eligibleCount: eligible.length,
    availableCount: available.length, monthlyAttempts: monthAttempts,
    canRender: monthlyRenderLimit > 0 && monthAttempts < monthlyRenderLimit,
  };
}
