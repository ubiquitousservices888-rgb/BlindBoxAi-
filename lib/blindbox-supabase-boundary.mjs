export const BLINDBOXAI_SUPABASE_ORIGIN = "https://lazzdoadoqzrzlarerfx.supabase.co";

export function assertBlindBoxSupabaseOrigin(value, { allowTestLoopback = false } = {}) {
  let url;
  try {
    url = new URL(String(value ?? "").trim());
  } catch {
    throw new Error("SUPABASE_URL must be the dedicated BlindBoxAI project");
  }
  const bareOrigin = url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password;
  if (bareOrigin && url.origin === BLINDBOXAI_SUPABASE_ORIGIN) return url.origin;
  const testRuntime = process.env.NODE_ENV === "test" || Boolean(process.env.NODE_TEST_CONTEXT);
  if (bareOrigin && allowTestLoopback && testRuntime &&
      String(process.env.BLINDBOXAI_ALLOW_TEST_INGEST || "").trim().toLowerCase() === "true" &&
      url.protocol === "http:" && url.hostname === "127.0.0.1") return url.origin;
  throw new Error("SUPABASE_URL must be the dedicated BlindBoxAI project");
}
