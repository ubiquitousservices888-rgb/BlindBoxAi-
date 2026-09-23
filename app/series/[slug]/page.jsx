import Link from "next/link";
import { allSeries, getSeries, ebayOutboundPath } from "../../../lib/data";
import { evaluateAffiliateEligibility, PUBLIC_PRICE_FRESHNESS_DAYS } from "../../../lib/market-eligibility.mjs";
import { normalizeCampaignId, normalizeSource } from "../../../lib/campaign-attribution.mjs";
import FakeCheck from "../../_components/FakeCheck";
import LiveEbayListings from "../../_components/LiveEbayListings";

export const revalidate = 86400;
export function generateStaticParams() { return allSeries().map(s => ({ slug: s.slug })); }

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

function latestEvidenceDate(series) {
  const timestamps = [];
  for (const figure of series?.figures ?? []) {
    const evidence = String(figure?.evidence ?? "");
    for (const value of evidence.match(/\b20\d{2}-\d{2}-\d{2}\b/g) ?? []) {
      const time = Date.parse(`${value}T00:00:00Z`);
      if (Number.isFinite(time)) timestamps.push(time);
    }
    const year = evidence.match(/\b(20\d{2})\b/)?.[1];
    if (year) {
      for (const match of evidence.matchAll(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\b/g)) {
        const month = MONTHS.indexOf(match[1]);
        const day = Number(match[2]);
        if (month >= 0 && day >= 1 && day <= 31) timestamps.push(Date.UTC(Number(year), month, day));
      }
    }
  }
  return timestamps.length ? new Date(Math.max(...timestamps)) : null;
}

function displaySaleDate(value) {
  if (!value) return "date unavailable";
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : "date unavailable";
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const s = getSeries(slug);
  if (!s) return {};
  const eligibility = evaluateAffiliateEligibility(s);
  const oddsVerified = s._dataQuality?.pullOdds?.status === "verified" && Boolean(s.pullOdds?.secret);
  return {
    title: `${s.name} — ${oddsVerified ? "prices, pull odds & fake check" : "sold prices & fake check"} | BlindBoxAI`,
    description: `${s.name} (${s.brand}): reviewed US-sold observations, evidence status, and counterfeit warning signs.`,
    robots: eligibility.verifiedMarketRecordCount > 0
      ? { index: true, follow: true }
      : { index: false, follow: true },
  };
}

export default async function SeriesPage({ params, searchParams }) {
  const { slug } = await params;
  const query = await searchParams;
  const campaignId = normalizeCampaignId(query?.campaign);
  const source = normalizeSource(query?.source || query?.utm_source);
  const attribution = { campaignId, source };
  const s = getSeries(slug);
  if (!s) return <main><h1>Series not found</h1><p><Link href="/">← All series</Link></p></main>;

  const retailVerified = s._dataQuality?.retailUSD?.status === "verified";
  const oddsVerified = s._dataQuality?.pullOdds?.status === "verified";
  const now = new Date();
  const eligibility = evaluateAffiliateEligibility(s, { now });
  const verifiedByFigure = new Map(eligibility.verifiedMarketRecords.map((record) => [record.figure, record]));
  const checkedAt = latestEvidenceDate(s);
  const ageDays = checkedAt ? Math.floor((now.getTime() - checkedAt.getTime()) / 86400000) : null;
  const stale = ageDays != null && ageDays > PUBLIC_PRICE_FRESHNESS_DAYS;
  const checklist = Array.isArray(s.checklist) ? s.checklist.filter(Boolean) : [];

  return (
    <main>
      <Link className="crumb" href="/">← All series</Link>
      <h1 className="ptitle"><span className="brand">{s.brand} · </span>{s.name}</h1>
      <div className="sub">
        {retailVerified && s.retailUSD != null
          ? <span className="mono">Verified retail ${s.retailUSD}</span>
          : <span className="nodata">Retail price needs verification</span>}
        {oddsVerified && s.pullOdds?.secret
          ? <span className="chip secret">VERIFIED SECRET ODDS {s.pullOdds.secret} · {s.pullOdds.source}</span>
          : <span className="nodata">Pull odds not verified</span>}
      </div>

      <section className="block">
        <h2>Resale prices <span className="k">US-SOLD</span></h2>
        <p style={{ margin: "10px 0", fontSize: "0.78rem", color: stale ? "var(--fake)" : "var(--muted)" }}>
          {checkedAt
            ? `Prices last checked: ${checkedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}${stale ? ` · dated — older than ${PUBLIC_PRICE_FRESHNESS_DAYS} days` : ""}`
            : "Price-check date unavailable — treat values as needing freshness review."}
        </p>
        <p style={{ margin: "12px 0", fontSize: "0.82rem", lineHeight: 1.5, opacity: 0.82 }}>
          Verified evidence means at least two documented completed sales. Fresh pricing means the latest documented sale is within {PUBLIC_PRICE_FRESHNESS_DAYS} days.
        </p>
        <p style={{ margin: "12px 0", fontSize: "0.82rem", lineHeight: 1.5, opacity: 0.82 }}>
          Disclosure: As an eBay Partner, BlindBoxAI may earn a commission from qualifying purchases.
        </p>
        <table className="ptable">
          <thead><tr><th>Figure</th><th>Rarity</th><th>Range</th><th>Market</th></tr></thead>
          <tbody>
            {s.figures.map(f => {
              const marketRecord = verifiedByFigure.get(f.name);
              const verified = Boolean(marketRecord);
              const freshnessText = marketRecord?.freshnessStatus === "fresh"
                ? `fresh · latest ${displaySaleDate(marketRecord.latestSaleAt)}`
                : marketRecord?.freshnessStatus === "dated"
                  ? `dated · latest ${displaySaleDate(marketRecord.latestSaleAt)}`
                  : verified
                    ? "freshness unknown · sale date unavailable"
                    : "unverified";
              return <tr key={f.name}>
                <td>{f.name}</td>
                <td><span className={`rar ${String(f.rarity).toLowerCase().includes("secret") ? "secret" : ""}`}>{f.rarity}</span></td>
                <td className="rng">
                  {verified
                    ? (f.resaleLow === f.resaleHigh ? `$${f.resaleLow}` : `$${f.resaleLow}–$${f.resaleHigh}`)
                    : <span className="nodata">needs research</span>}
                  <div className={`verify ${verified ? "" : "pending"}`} style={{ marginTop: 6, color: marketRecord?.freshnessStatus === "dated" ? "#8a5100" : undefined }}>
                    <span className="dot"></span>{verified ? `${marketRecord.completedSaleCount} completed sales · ${freshnessText}` : "unverified"}
                  </div>
                  {f.evidence && (
                    <details style={{ marginTop: 6, maxWidth: 360 }}>
                      <summary style={{ cursor: "pointer", fontSize: "0.76rem" }}>Evidence note</summary>
                      <p style={{ whiteSpace: "normal", fontWeight: 400, lineHeight: 1.45 }}>{f.evidence}</p>
                    </details>
                  )}
                </td>
                <td>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <a className="ebay" href={ebayOutboundPath(s.slug, f.name, "sold", attribution)} target="_blank" rel="sponsored nofollow noopener">
                      View sold comps on eBay ↗
                    </a>
                    <a className="ebay" href={ebayOutboundPath(s.slug, f.name, "active", attribution)} target="_blank" rel="sponsored nofollow noopener">
                      View active listings on eBay ↗
                    </a>
                  </div>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </section>

      <LiveEbayListings seriesSlug={s.slug} campaignId={campaignId} source={source} />

      {checklist.length > 0 && (
        <section className="block">
          <h2>Fake check <span className="k">INSPECT</span></h2>
          <FakeCheck checklist={checklist} />
        </section>
      )}

      <section className="block">
        <h2>Set completion <span className="k">{s.figures.length} FIGURES</span></h2>
        <p style={{color:"var(--muted)"}}>Saved progress tracking is part of the <Link href="/pro">Reseller tier</Link>.</p>
      </section>
    </main>
  );
}
