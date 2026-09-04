import Link from "next/link";

import {
  allAmazonAccessoryOffers,
  amazonOutboundPath,
} from "../../../lib/amazon-associates.mjs";
import { normalizeCampaignId, normalizeSource } from "../../../lib/campaign-attribution.mjs";

export const metadata = {
  title: "Collector Display & Storage Accessories | BlindBoxAI",
  description:
    "Evergreen display, storage, lighting, and photography accessory categories for blind-box collectors.",
  alternates: { canonical: "/shop/accessories" },
};

export default async function AccessoriesShopPage({ searchParams }) {
  const query = await searchParams;
  const campaignId = normalizeCampaignId(query?.campaign);
  const source = normalizeSource(query?.source || "amazon_accessories");
  const offers = allAmazonAccessoryOffers();

  return (
    <main style={{ width: "min(900px, calc(100% - 32px))", margin: "40px auto 80px" }}>
      <Link className="crumb" href="/">← BlindBoxAI</Link>

      <section style={{ marginTop: 24, marginBottom: 28 }}>
        <p className="eyebrow">Collector setup guide</p>
        <h1 style={{ marginBottom: 12 }}>Display, protect, and photograph your collection</h1>
        <p style={{ maxWidth: 720 }}>
          These are evergreen accessory categories rather than price-sensitive product picks. Compare current
          options on Amazon, then choose the size and features that fit your collection.
        </p>
        <p style={{ maxWidth: 720, fontWeight: 700 }}>
          Affiliate disclosure: As an Amazon Associate I earn from qualifying purchases. Links below are paid links.
        </p>
      </section>

      <section
        aria-label="Collector accessory categories"
        style={{ display: "grid", gap: 14 }}
      >
        {offers.map((offer) => (
          <article
            key={offer.id}
            style={{
              border: "1px solid rgba(255,255,255,0.16)",
              borderRadius: 16,
              padding: 18,
              display: "grid",
              gap: 10,
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: "1.15rem" }}>{offer.title}</h2>
              <p style={{ margin: "8px 0 0" }}>{offer.useCase}</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <a
                className="cta"
                href={amazonOutboundPath(offer.id, { campaignId, source })}
                rel="sponsored nofollow"
              >
                Compare current Amazon options → <span style={{ fontSize: "0.78rem", opacity: 0.78 }}>(paid link)</span>
              </a>
            </div>
          </article>
        ))}
      </section>

      <section style={{ marginTop: 28, fontSize: "0.9rem", opacity: 0.82 }}>
        <p>
          BlindBoxAI does not display Amazon prices or availability here because those can change. The Amazon
          results page is the source for current listing details.
        </p>
      </section>
    </main>
  );
}
