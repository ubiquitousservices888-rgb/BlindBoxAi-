import test from "node:test";
import assert from "node:assert/strict";

import { GET } from "../app/api/social-card/[slug]/route.js";

test("social-card route renders a real PNG for an existing series", async () => {
  const slug = "labubu-the-monsters-exciting-macaron";
  const response = await GET(
    new Request(`https://www.blindboxai.com/api/social-card/${slug}`),
    { params: Promise.resolve({ slug }) },
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^image\/png/i);

  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.ok(bytes.length > 1000, "social card should contain rendered image bytes");
  assert.deepEqual(Array.from(bytes.slice(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
});

test("social-card route fails closed for an unknown series", async () => {
  const response = await GET(
    new Request("https://www.blindboxai.com/api/social-card/not-a-real-series"),
    { params: Promise.resolve({ slug: "not-a-real-series" }) },
  );
  assert.equal(response.status, 404);
});
