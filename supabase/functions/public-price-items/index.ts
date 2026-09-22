import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=300, stale-while-revalidate=600",
      "x-content-type-options": "nosniff",
    },
  });
}
function slug(value: unknown) {
  return String(value || "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0,120);
}
function med(values:number[]) {
  const nums = values.filter(Number.isFinite).sort((a,b)=>a-b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length/2);
  return nums.length%2 ? nums[mid] : (nums[mid-1]+nums[mid])/2;
}

async function eligibleItems() {
  const { data: items, error: itemError } = await db.from("collectible_items")
    .select("id,canonical_name,vertical,brand,series,year,item_number,variant,language,updated_at");
  if (itemError) throw new Error("item lookup failed");
  const out:any[] = [];
  for (const item of items || []) {
    const { data: sales, error } = await db.from("sold_price_observations")
      .select("amount,sold_at,observed_at,condition_type")
      .eq("collectible_id", item.id)
      .eq("verified", true)
      .eq("exact_match", true)
      .order("sold_at", { ascending: true });
    if (error) throw new Error("sale lookup failed");
    if ((sales || []).length < 2) continue;
    const amounts = (sales || []).map((x:any)=>Number(x.amount)).filter(Number.isFinite);
    if (amounts.length < 2) continue;
    const saleDates = (sales || []).map((x:any)=>x.sold_at).filter(Boolean);
    const checked = (sales || []).map((x:any)=>x.observed_at).filter(Boolean).sort().at(-1) || item.updated_at;
    out.push({
      slug: slug(item.canonical_name),
      canonicalName: item.canonical_name,
      vertical: item.vertical,
      brand: item.brand,
      series: item.series,
      year: item.year,
      itemNumber: item.item_number,
      variant: item.variant,
      language: item.language,
      verifiedSaleCount: amounts.length,
      soldMedian: med(amounts),
      soldLow: Math.min(...amounts),
      soldHigh: Math.max(...amounts),
      askingMedian: null,
      gapPct: null,
      saleDates,
      lastCheckedAt: checked,
    });
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  try {
    const all = await eligibleItems();
    const wanted = new URL(req.url).searchParams.get("slug");
    if (!wanted) return json({ items: all });
    const item = all.find((x)=>x.slug === wanted);
    if (!item) return json({ error: "Not found" }, 404);
    return json({ item });
  } catch {
    return json({ error: "Price data unavailable" }, 503);
  }
});
