import Link from "next/link";

import {
  allAmazonAccessoryOffers,
  buildAmazonSearchUrl,
} from "../../../lib/amazon-associates.mjs";
import { resolveAmazonAccessoryAttribution } from "../../../lib/amazon-shop-attribution.mjs";
import AmazonAffiliateLink from "./AmazonAffiliateLink";
import ImageSlot from "../../_components/ImageSlot";

export const metadata = {
  title: "Collector Display & Storage Accessories | BlindBoxAI",
  description:
    "Evergreen display, storage, lighting, and photography accessory categories for blind-box collectors.",
  alternates: { canonical: "/shop/accessories" },
};

export default async function AccessoriesShopPage({ searchParams }) {
  const query = await searchParams;
  const { campaignId, source } = resolveAmazonAccessoryAttribution(query);
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

      <style>{ACC_CSS}</style>
      <section
        aria-label="Collector accessory categories"
        style={{ display: "grid", gap: 14 }}
      >
        {offers.map((offer) => (
          <article
            key={offer.id}
            id={offer.id}
            style={{
              scrollMarginTop: 96,
              border: "1px solid rgba(255,255,255,0.16)",
              borderRadius: 16,
              padding: 18,
            }}
            className="acc-row"
          >
            <ImageSlot slot={"accessory/" + offer.id} kind="case" alt="" className="acc-thumb" />
            <div className="acc-body">
            <div>
              <h2 style={{ margin: 0, fontSize: "1.15rem" }}>{offer.title}</h2>
              <p style={{ margin: "8px 0 0" }}>{offer.useCase}</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <AmazonAffiliateLink
                className="cta"
                href={buildAmazonSearchUrl(offer.id)}
                offerId={offer.id}
                campaignId={campaignId}
                source={source}
                ariaLabel={`View ${offer.title} on Amazon (paid link)`}
              >
                View on Amazon → <span style={{ fontSize: "0.78rem", opacity: 0.78 }}>(paid link)</span>
              </AmazonAffiliateLink>
            </div>
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

// Pictures are BlindBoxAI's own drawings of each accessory type. Amazon listing
// photos are never downloaded or re-hosted here.
const ACC_CSS = `
.acc-row{display:grid;grid-template-columns:160px minmax(0,1fr);gap:18px;align-items:center;background:#fff;border-color:#DCE5E3!important}
.acc-thumb{aspect-ratio:1/1;border-radius:12px}
.acc-body{display:grid;gap:10px}
@media(max-width:520px){.acc-row{grid-template-columns:104px minmax(0,1fr);gap:12px}}
`;
