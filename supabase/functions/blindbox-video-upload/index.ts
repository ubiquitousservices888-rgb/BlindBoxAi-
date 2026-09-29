import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "blindboxai-review-videos";
const MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED_ORIGINS = new Set([
  "https://blindboxai.com",
  "https://www.blindboxai.com",
]);

function cors(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://blindboxai.com";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json" },
  });
}

function bearer(req: Request) {
  const value = req.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

function safePath(value: unknown) {
  const path = String(value || "");
  if (!/^media\/review\/[a-zA-Z0-9._-]+\.mp4$/i.test(path)) {
    throw new Error("invalid_path");
  }
  return path;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

  const ownerCode = bearer(req);
  if (!ownerCode) return json({ error: "unauthorized" }, 401, origin);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_request" }, 400, origin);
  }

  let path: string;
  try {
    path = safePath(body.path);
  } catch {
    return json({ error: "invalid_path" }, 400, origin);
  }

  const authCheck = await fetch("https://blindboxai.com/api/owner/storage-auth", {
    method: "POST",
    headers: { Authorization: `Bearer ${ownerCode}` },
  });
  if (!authCheck.ok) return json({ error: "unauthorized" }, 401, origin);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRole) return json({ error: "storage_not_configured" }, 503, origin);

  const supabase = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const action = String(body.action || "ticket");
  if (action === "delete") {
    const removed = await supabase.storage.from(BUCKET).remove([path]);
    if (removed.error) return json({ error: "delete_failed" }, 503, origin);
    return json({ deleted: true, path }, 200, origin);
  }
  if (action !== "ticket") return json({ error: "invalid_action" }, 400, origin);

  const sizeBytes = Number(body.sizeBytes || 0);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_BYTES) {
    return json({ error: "invalid_size" }, 400, origin);
  }

  const bucketState = await supabase.storage.getBucket(BUCKET);
  if (bucketState.error) {
    const created = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: ["video/mp4"],
    });
    if (created.error && !/already exists/i.test(created.error.message || "")) {
      return json({ error: "bucket_unavailable" }, 503, origin);
    }
  }

  const ticket = await supabase.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (ticket.error || !ticket.data?.signedUrl) {
    return json({ error: "ticket_failed" }, 503, origin);
  }

  const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return json({ signedUrl: ticket.data.signedUrl, publicUrl, path }, 200, origin);
});
