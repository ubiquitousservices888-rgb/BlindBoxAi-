import { assertBlindBoxSupabaseOrigin, BLINDBOXAI_SUPABASE_ORIGIN } from "./blindbox-supabase-boundary.mjs";

export function publicPriceApiUrl() {
  const base = String(
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    BLINDBOXAI_SUPABASE_ORIGIN,
  ).replace(/\/+$/, "");
  return `${assertBlindBoxSupabaseOrigin(base)}/functions/v1/public-price-items`;
}
