import assert from "node:assert/strict";
import test from "node:test";
import { fetchApprovedPublicUrl } from "../lib/read-only-url-fetch.mjs";

const allowPage = (url) =>
  url.protocol === "https:" &&
  ["www.blindboxai.com", "blindboxai.com"].includes(url.hostname) &&
  url.pathname === "/series/labubu-the-monsters-hair-salon" &&
  url.searchParams.get("campaign") === "bb-rv-3c9c9bb78c37ff6a" &&
  url.searchParams.get("source") === "youtube";
const input = "https://www.blindboxai.com/series/labubu-the-monsters-hair-salon?campaign=bb-rv-3c9c9bb78c37ff6a&source=youtube";

test("approved canonical redirect is manually checked before second GET", async () => {
  const requests = [];
  const mock = async (url, options) => {
    requests.push({ url, options });
    if (requests.length === 1) return new Response(null, { status: 308, headers: {
      location: url.replace("www.blindboxai.com", "blindboxai.com"),
    } });
    return new Response("Hair Salon", { status: 200 });
  };
  const result = await fetchApprovedPublicUrl(input, { allowUrl: allowPage, fetchImpl: mock });
  assert.equal(requests.length, 2);
  assert.ok(requests.every(({ options }) => options.redirect === "manual" && options.method === "GET"));
  assert.match(result.finalUrl, /blindboxai.com\/series\/labubu-the-monsters-hair-salon/);
});

test("reject redirect into affiliate click route before issuing any outbound GET", async () => {
  let requests = 0;
  const mock = async () => {
    requests++;
    return new Response(null, { status: 302,
      headers: { location: "/api/out/ebay?series=labubu-the-monsters-hair-salon" } });
  };
  await assert.rejects(
    fetchApprovedPublicUrl(input, { allowUrl: allowPage, fetchImpl: mock }),
    /redirect escaped the approved read-only path/,
  );
  assert.equal(requests, 1);
});

test("reject offsite and downgrade redirects without a second network request", async () => {
  for (const location of ["https://ebay.com/", "http://www.blindboxai.com/series/labubu-the-monsters-hair-salon"]) {
    let n = 0;
    await assert.rejects(fetchApprovedPublicUrl(input, {
      allowUrl: allowPage,
      fetchImpl: async () => {
        n++;
        return new Response(null, { status: 302, headers: { location } });
      },
    }), /redirect escaped the approved read-only path/);
    assert.equal(n, 1);
  }
});

test("reject missing allowlist and redirect cycles", async () => {
  await assert.rejects(fetchApprovedPublicUrl(input), /allowlist is required/);
  let requests = 0;
  await assert.rejects(fetchApprovedPublicUrl(input, {
    allowUrl: allowPage, maxRedirects: 2,
    fetchImpl: async () => {
      requests++;
      return new Response(null, { status: 302, headers: { location: input } });
    },
  }), /bounded redirect limit/);
  assert.equal(requests, 3);
});
