import assert from "node:assert/strict";
import fs from "node:fs";
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

const response = (status, contentType = "video/mp4", overrides = {}) => ({
  status,
  headers: { get: (name) => name.toLowerCase() === "content-type" ? contentType : null },
  ...overrides,
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
  it("rejects eBay subdomains and does not block lookalike hostnames", () => {
    const bad = record();
    const ebayHost = ["rover", "ebay", "co", "uk"].join(".");
    bad.script.caption += `\n${new URL("/redirect", `${"https:"}//${ebayHost}`).href}`;
    assert.throws(() => assertBlindBoxSocialCta(bad), /Raw eBay\/EPN URLs are forbidden/i);

    const safe = record();
    safe.script.caption += "\nhttps://notebay.com/collector-guide";
    assert.equal(assertBlindBoxSocialCta(safe), true);
  });
  it("uses the stored CTA text after separately validating its host", () => {
    const safe = record({ script: { productUrl: "https://WWW.BlindBoxAI.com", caption: "https://WWW.BlindBoxAI.com" } });
    assert.equal(assertBlindBoxSocialCta(safe), true);
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
  it("does not accept an MP4 suffix only in a query or fragment", async () => {
    await assert.rejects(() => assertPublicMp4("https://cdn.example/private-file?name=video.mp4", async () => response(200)), /MP4 resource/i);
    await assert.rejects(() => assertPublicMp4("https://cdn.example/private-file#video.mp4", async () => response(200)), /MP4 resource/i);
  });
  it("rejects private media hosts before fetching", async () => {
    let fetched = false;
    await assert.rejects(() => assertPublicMp4("https://127.0.0.1/video.mp4", async () => { fetched = true; return response(200); }), /public host/i);
    assert.equal(fetched, false);
  });
  it("does not confuse ordinary public hostnames with IPv6 private ranges", async () => {
    await assertPublicMp4("https://fcdn.example/video.mp4", async () => response(206));
  });
  it("rejects redirects and requests redirect:error", async () => {
    let options;
    await assert.rejects(
      () => assertPublicMp4("https://cdn.example/video.mp4", async (_url, received) => {
        options = received;
        return response(200, "video/mp4", { redirected: true, url: "https://private.example/video.mp4" });
      }),
      /must not redirect/i,
    );
    assert.equal(options.redirect, "error");
  });
  it("accepts application/mp4 and cancels the response body", async () => {
    let cancelled = false;
    await assertPublicMp4("https://cdn.example/video.mp4", async () => response(200, "application/mp4; charset=binary", {
      body: { cancel: async () => { cancelled = true; } },
    }));
    assert.equal(cancelled, true);
  });
  it("runs CTA and media checks together", async () => {
    await assertBufferPublishReady(record(), async () => response(200));
  });
  it("checks publish state before media reachability in the CLI", () => {
    const source = fs.readFileSync(new URL("./video-pipeline.mjs", import.meta.url), "utf8");
    assert.ok(source.indexOf("assertPublishableState(current)") < source.indexOf("assertBufferPublishReady(current)"));
  });
});
