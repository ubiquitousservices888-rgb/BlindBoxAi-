// A read-only GET that validates every hop before sending the next request.
// Callers supply a strict allowlist. Never implicitly follow redirects.
export async function fetchApprovedPublicUrl(url, {
  allowUrl,
  fetchImpl = fetch,
  maxRedirects = 3,
} = {}) {
  if (typeof allowUrl !== "function") throw new Error("Public URL allowlist is required");
  let current = new URL(String(url));
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    if (!allowUrl(current)) throw new Error("Public URL is not on the approved read-only path");
    const response = await fetchImpl(current.toString(), {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: { "User-Agent": "BlindBoxAI-read-only-video-verification/1.0" },
      signal: AbortSignal.timeout(20000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Public redirect is missing Location");
      const next = new URL(location, current);
      if (!allowUrl(next)) throw new Error("Public redirect escaped the approved read-only path");
      current = next;
      continue;
    }
    if (response.status !== 200) {
      throw new Error(`Public URL returned HTTP ${response.status}`);
    }
    return { response, finalUrl: current.toString() };
  }
  throw new Error("Public URL exceeded bounded redirect limit");
}
