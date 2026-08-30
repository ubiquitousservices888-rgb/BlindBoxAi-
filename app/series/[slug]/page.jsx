import Link from "next/link";
import { allSeries, getSeries, ebayOutboundPath } from "../../../lib/data";
import { normalizeCampaignId, normalizeSource } from "../../../lib/campaign-attribution.mjs";
import FakeCheck from "../../_components/FakeCheck";
import LiveEbayListings from "../../_components/LiveEbayListings";

export const revalidate = 86400;
export function generateStaticParams() { return allSeries().map(s => ({ slug: s.slug })); }
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const s = getSeries(slug);
  return s ? {
    title: `${s.name} — prices, pull odds & fake check | BlindBoxAI`,
    description: `${s.name} (${s.brand}): US-sold resale ranges, pull odds, and how to spot counterfeits.`,
  } : {};
}

export default async function SeriesPage({ params, searchParams }) {
  const { slug } = await params;
  const query = await searchParams;
  const campaignId = normalizeCampaignId(query?.campaign);
  const source = normalizeSource(query?.source);
  const attribution = { campaignId, source };
  const s = getSeries(slug);
  if (!s) return <main><h1>Series not found</h1><p><Link href="/">← All series</Link></p></main>;
  return (
    <main>
      <Link className="crumb" href="/">← All series</Link>
      <h1 className="ptitle"><span className="brand">{s.brand}</span>{s.name}</h1>
      <div className="sub">
        <span className="mono">Retail ~${s.retailUSD}</span>
        {s.pullOdds?.secret && <span className="chip secret">SECRET {s.pullOdds.secret} · {s.pullOdds.source}</span>}
      </div>

      <section className="block">
        <h2>Resale prices <span className="k">US-SOLD</span></h2>
          <p
            style={{
              margin: "12px 0",
              fontSize: "0.82rem",
              lineHeight: 1.5,
              opacity: 0.82,
            }}
          >
            Disclosure: As an eBay Partner, BlindBoxAI may earn a commission
            from qualifying purchases.
          </p>
        <table className="ptable">
          <thead><tr><th>Figure</th><th>Rarity</th><th>Range</th><th>Market</th></tr></thead>
          <tbody>
            {s.figures.map(f => (
              <tr key={f.name}>
                <td>{f.name}</td>
                <td><span className={`rar ${f.rarity === "secret" ? "secret" : ""}`}>{f.rarity}</span></td>
                <td className="rng">
                  {f.resaleLow != null
                    ? (f.resaleLow === f.resaleHigh ? `$${f.resaleLow}` : `$${f.resaleLow}–$${f.resaleHigh}`)
                    : <span className="nodata">no data</span>}
                  {f.needsReview && f.resaleLow != null && <span className="nodata"> ·unconfirmed</span>}
                </td>
                <td>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <a
                      className="ebay"
                      href={ebayOutboundPath(s.slug, f.name, "sold", attribution)}
                      target="_blank"
                      rel="sponsored nofollow noopener noreferrer"
                    >
                      Sold comps ↗
                    </a>
                    <a
                      className="ebay"
                      href={ebayOutboundPath(s.slug, f.name, "active", attribution)}
                      target="_blank"
                      rel="sponsored nofollow noopener noreferrer"
                    >
                      Shop active ↗
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <LiveEbayListings
        seriesSlug={s.slug}
        campaignId={campaignId}
        source={source}
      />

      <section className="block">
        <h2>Fake check <span className="k">INSPECT</span></h2>
        <FakeCheck checklist={s.checklist} />
      </section>

      <section className="block">
        <h2>Set completion <span className="k">{s.figures.length} FIGURES</span></h2>
        <p style={{color:"var(--muted)"}}>Saved progress tracking is part of the <Link href="/pro">Reseller tier</Link>.</p>
      </section>
    </main>
  );
}
