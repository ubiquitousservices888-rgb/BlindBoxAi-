import Link from "next/link";

import { normalizeAttributionSource, normalizeCampaignId } from "../../../lib/campaign-attribution.mjs";
import {
  FAKE_CHECK_GUIDE,
  fakeCheckGuideOutboundPath,
  normalizeGuidePlacement,
} from "../../../lib/fake-check-guide.mjs";

// Reads ?campaign/&source/&from so a tagged visitor keeps attribution on the
// buy link; the page is therefore rendered per request.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "The Fake-Check Field Guide — spot fake Pop Mart blind boxes and Pokémon cards | BlindBoxAI",
  description: FAKE_CHECK_GUIDE.summary,
  alternates: { canonical: FAKE_CHECK_GUIDE.path },
};

const box = { border: "1px solid var(--line)", borderRadius: 14, padding: 18 };
const buyButton = {
  display: "inline-block",
  padding: "12px 20px",
  borderRadius: 10,
  background: "#6a3fd1",
  color: "#fff",
  fontWeight: 700,
  textDecoration: "none",
};

export default async function FakeCheckGuidePage({ searchParams }) {
  const query = await searchParams;
  // Repeated params arrive as arrays; only a single value counts.
  const single = (value) => (typeof value === "string" ? value : undefined);
  const attribution = {
    campaignId: normalizeCampaignId(single(query?.campaign)),
    source: normalizeAttributionSource(single(query?.source)),
  };
  const from = normalizeGuidePlacement(single(query?.from));
  const placement = from === "unknown" ? "guide_page" : from;
  const buyHref = fakeCheckGuideOutboundPath(attribution, placement);
  const buyLabel = `Get the guide on Gumroad: $${FAKE_CHECK_GUIDE.priceUsd} →`;

  return (
    <main style={{ width: "min(900px,calc(100% - 32px))", margin: "36px auto 80px" }}>
      <p style={{ fontFamily: "monospace", opacity: .72 }}>BLINDBOXAI GUIDE · PDF DOWNLOAD</p>
      <h1>{FAKE_CHECK_GUIDE.name}</h1>
      <p style={{ fontSize: "1.1rem", lineHeight: 1.6 }}>{FAKE_CHECK_GUIDE.summary}</p>
      {FAKE_CHECK_GUIDE.intro.map((line) => (
        <p key={line} style={{ lineHeight: 1.65 }}>{line}</p>
      ))}

      <section style={{ ...box, marginTop: 20 }} data-testid="fake-check-guide-buy">
        <p style={{ margin: "0 0 6px", fontSize: "1.4rem", fontWeight: 700 }}>${FAKE_CHECK_GUIDE.priceUsd}</p>
        <p style={{ margin: "0 0 14px", opacity: .8 }}>{FAKE_CHECK_GUIDE.format}. Instant download from Gumroad.</p>
        <a href={buyHref} style={buyButton} rel="noopener">{buyLabel}</a>
        <p style={{ margin: "12px 0 0", fontSize: 13, opacity: .75 }}>
          Checkout and delivery are handled by Gumroad. BlindBoxAI never sees your card details.
        </p>
      </section>

      <section style={{ marginTop: 30 }}>
        <h2>What's inside</h2>
        <ul style={{ lineHeight: 1.75 }}>
          {FAKE_CHECK_GUIDE.inside.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <p style={{ lineHeight: 1.65 }}>{FAKE_CHECK_GUIDE.sourcesLine}</p>
      </section>

      <section style={{ marginTop: 30 }}>
        <h2>Two of the pictures from the guide</h2>
        <p style={{ opacity: .8 }}>Original drawings, not photos of real products.</p>
        <div style={{ display: "grid", gap: 16 }}>
          <figure style={{ margin: 0 }}>
            <img
              src="/guides/fake-check/teeth.svg"
              alt="Drawing: a real Labubu mouth with exactly 9 even teeth next to a red-flag mouth with more, uneven teeth"
              width={470}
              height={184}
              style={{ width: "100%", height: "auto", maxWidth: 560 }}
            />
          </figure>
          <figure style={{ margin: 0 }}>
            <img
              src="/guides/fake-check/cardfront.svg"
              alt="Drawing: a real Pokémon card front with the accent on é and a sharp collector number, next to a red-flag front with no accent and an off-font number"
              width={470}
              height={184}
              style={{ width: "100%", height: "auto", maxWidth: 560 }}
            />
          </figure>
        </div>
      </section>

      <section style={{ ...box, marginTop: 30 }}>
        <a href={buyHref} style={buyButton} rel="noopener">{buyLabel}</a>
      </section>

      <p style={{ marginTop: 30, fontSize: 13, opacity: .78 }}>{FAKE_CHECK_GUIDE.disclaimer}</p>
      <p><Link href="/">← Back to BlindBoxAI</Link></p>
    </main>
  );
}
