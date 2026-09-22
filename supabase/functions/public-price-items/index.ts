import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const SUCCESS_HEADERS = {
  "content-type": "application/json",
  "cache-control": "public, max-age=300, stale-while-revalidate=600",
  "x-content-type-options": "nosniff",
};
const ERROR_HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: status >= 400 ? ERROR_HEADERS : SUCCESS_HEADERS,
  });
}

function cleanCondition(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
}

function finitePositive(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function median(values: number[]) {
  const nums = values.filter((value) => Number.isFinite(value) && value > 0).sort((a,b)=>a-b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length/2);
  return nums.length%2 ? nums[mid] : (nums[mid-1]+nums[mid])/2;
}

async function paged(table: string, columns: string, configure: (query: any) => any, pageSize = 500) {
  const out:any[] = [];
  for (let from = 0; ; from += pageSize) {
    let query = db.from(table).select(columns).range(from, from + pageSize - 1);
    query = configure(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table} lookup failed`);
    out.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

function summarize(item:any, conditionType:string, sales:any[]) {
  const amounts = sales.map((sale:any)=>finitePositive(sale.amount)).filter((value:any)=>value !== null);
  if (amounts.length < 2) return null;
  const saleDates = sales.map((sale:any)=>sale.sold_at).filter(Boolean);
  const checked = sales.map((sale:any)=>sale.observed_at).filter(Boolean).sort().at(-1) || item.updated_at;
  return {
    id: String(item.id),
    canonicalName: item.canonical_name,
    conditionType,
    vertical: item.vertical,
    brand: item.brand,
    series: item.series,
    year: item.year,
    itemNumber: item.item_number,
    variant: item.variant,
    language: item.language,
    verifiedSaleCount: amounts.length,
    soldMedian: median(amounts),
    soldLow: Math.min(...amounts),
    soldHigh: Math.max(...amounts),
    askingMedian: null,
    gapPct: null,
    saleDates,
    lastCheckedAt: checked,
  };
}

async function oneItem(id:string, conditionType:string) {
  const { data:item, error:itemError } = await db.from("collectible_items")
    .select("id,canonical_name,vertical,brand,series,year,item_number,variant,language,updated_at")
    .eq("id", id)
    .maybeSingle();
  if (itemError) throw new Error("item lookup failed");
  if (!item) return null;
  const sales = await paged(
    "sold_price_observations",
    "amount,sold_at,observed_at,condition_type",
    (query) => query
      .eq("collectible_id", id)
      .eq("verified", true)
      .eq("exact_match", true)
      .eq("condition_type", conditionType)
      .order("sold_at", { ascending: true }),
  );
  return summarize(item, conditionType, sales);
}

async function eligibleItems() {
  const [items, sales] = await Promise.all([
    paged(
      "collectible_items",
      "id,canonical_name,vertical,brand,series,year,item_number,variant,language,updated_at",
      (query) => query.order("id", { ascending: true }),
    ),
    paged(
      "sold_price_observations",
      "collectible_id,amount,sold_at,observed_at,condition_type",
      (query) => query
        .eq("verified", true)
        .eq("exact_match", true)
        .order("collectible_id", { ascending: true }),
      1000,
    ),
  ]);

  const groups = new Map<string, any[]>();
  for (const sale of sales) {
    const conditionType = cleanCondition(sale.condition_type);
    const amount = finitePositive(sale.amount);
    if (!sale.collectible_id || !conditionType || amount === null) continue;
    const key = `${sale.collectible_id}::${conditionType}`;
    const group = groups.get(key) || [];
    group.push({ ...sale, amount });
    groups.set(key, group);
  }

  const byId = new Map(items.map((item:any)=>[String(item.id), item]));
  const out:any[] = [];
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const [id, conditionType] = key.split("::");
    const item = byId.get(id);
    if (!item) continue;
    const summary = summarize(item, conditionType, group);
    if (summary) out.push(summary);
  }
  return out.sort((a,b)=>String(a.canonicalName).localeCompare(String(b.canonicalName)));
}

Deno.serve(async (req:Request) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  try {
    const url = new URL(req.url);
    const id = String(url.searchParams.get("id") || "").trim();
    const conditionType = cleanCondition(url.searchParams.get("condition"));
    if (id || conditionType) {
      if (!id || !conditionType || !/^[a-zA-Z0-9-]{1,64}$/.test(id)) return json({ error: "Invalid item request" }, 400);
      const item = await oneItem(id, conditionType);
      if (!item) return json({ error: "Not found" }, 404);
      return json({ item });
    }
    return json({ items: await eligibleItems() });
  } catch (cause) {
    console.error("public_price_items_failed", {
      message: cause instanceof Error ? cause.message : "unknown",
    });
    return json({ error: "Price data unavailable" }, 503);
  }
});
