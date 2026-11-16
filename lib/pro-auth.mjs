import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { assertBlindBoxSupabaseOrigin } from "./blindbox-supabase-boundary.mjs";
import { ProError, proOrigin } from "./pro-config.mjs";

export function proAuth(request, { env = process.env, fetchImpl = fetch } = {}) {
  const origin = assertBlindBoxSupabaseOrigin(env.SUPABASE_URL, { allowTestLoopback: true });
  if (!env.SUPABASE_PUBLISHABLE_KEY) throw new ProError("configuration_unavailable");
  const headers = new Headers();
  const cookies = parseCookieHeader(request.headers.get("cookie") || "");
  const client = createServerClient(origin, env.SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: { name: "bbai-pro-auth", path: "/", httpOnly: true, sameSite: "lax", secure: proOrigin(env).startsWith("https:") },
    cookies: {
      getAll: () => cookies,
      setAll(values) {
        for (const { name, value, options } of values) {
          const existing = cookies.find(cookie => cookie.name === name);
          if (existing) existing.value = value; else cookies.push({ name, value });
          headers.append("Set-Cookie", serializeCookieHeader(name, value, { ...options, httpOnly: true }));
        }
      },
    },
    global: { fetch: (url, options) => fetchImpl(url, { ...options, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12000) }) },
  });
  return { client, headers };
}

export async function requireProUser(auth) {
  const { data, error } = await auth.client.auth.getUser();
  const user = data?.user;
  if (error || !user || user.is_anonymous || !user.email_confirmed_at ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)) throw new ProError("sign_in_required", 401);
  return user;
}
