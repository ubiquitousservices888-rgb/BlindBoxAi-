const FALLBACK_SUPABASE_URL = "https://lazzdoadoqzrzlarerfx.supabase.co";

export function publicPriceApiUrl() {
  const base = String(
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    FALLBACK_SUPABASE_URL,
  ).replace(/\/+$/, "");
  return `${base}/functions/v1/public-price-items`;
}
