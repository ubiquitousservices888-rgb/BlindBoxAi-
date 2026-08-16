import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertBlindBoxSocialCta, assertBufferPublishReady, assertPublicMp4 } from "../lib/buffer-media-safety.mjs";

function record(overrides = {}) {
  return {
    script: {
      productUrl: "https://www.blindboxai.com/series/hirono-shelter-series",
      caption: "HIRONO Mantel Clock\n\nhttps://www.blindboxai.com/series/hirono-shelter-series\n\n#ad BlindBoxAI may earn a commission from qualifying purchases.",
    },
    render: { videoUrl: "https://cdn.example/video.mp4" },
    ...overrides,
  };
}

const response = (status, contentType = "video/mp4") => ({
  status,
  headers: { get: (name) => name.toLowerCase() === "content-type" ? contentType : null },
});

describe("BlindBoxAI social CTA safety", () => {
  it("accepts a BlindBoxAI CTA", () => assert.equal(assertBlindBoxSocialCta(record()), true));
  it("rejects direct affiliate marketplace CTAs", () => {
    const bad = record({ script: { productUrl: "https://www.ebay.com/sch/i.html?_nkw=HIRONO&campid=5339171775", caption: "https://www.ebay.com/sch/i.html?_nkw=HIRONO&campid=5339171775" } });
    assert.throws(() => assertBlindBoxSocialCta(bad), /blindboxai\.com/i);
  });
  it("rejects raw EPN links embedded beside a valid CTA", () => {
    const bad = record();
    bad.script.caption += "\nhttps://www.ebay.com/sch/i.html?_nkw=HIRONO&campid=5339171775";
    assert.throws(() => assertBlindBoxSocialCta(bad), /Raw eBay\/EPN URLs are forbidden/i);
  });
});

describe("public Buffer media safety", () => {
  it("accepts a publicly retrievable HTTPS MP4", async () => {
    await assertPublicMp4("https://cdn.example/video.mp4", async () => response(206));
  });
  it("rejects inaccessible media before Buffer is called", async () => {
    await assert.rejects(() => assertPublicMp4("https://cdn.example/video.mp4", async () => response(403)), /not publicly accessible/i);
  });
  it("rejects a non-MP4 URL", async () => {
    await assert.rejects(() => assertPublicMp4("https://cdn.example/private-file", async () => response(200)), /MP4 resource/i);
  });
  it("runs CTA and media checks together", async () => {
    await assertBufferPublishReady(record(), async () => response(200));
  });
});
