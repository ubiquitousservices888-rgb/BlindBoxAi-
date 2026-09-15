import Link from "next/link";
import BlindVaultHomeStyles from "./_components/BlindVaultHomeStyles";
import PublishedVideoStyles from "./_components/PublishedVideoStyles";
import { allSeries, ebayOutboundPath, seriesPriceVerification } from "../lib/data";
import { evaluateAffiliateEligibility } from "../lib/market-eligibility.mjs";

export const revalidate = 300;

const VIDEO_FEED_URL = "https://lazzdoadoqzrzlarerfx.supabase.co/functions/v1/published-video-feed";

async function getPublishedVideos() {
  try {
    const response = await fetch(VIDEO_FEED_URL, { next: { revalidate: 300 } });
    if (!response.ok) return [];
    const payload = await response.json();
    const items = Array.isArray(payload?.items) ? payload.items : [];
    return items
      .filter((item) => ["sports_cards", "pokemon_tcg"].includes(item?.vertical))
      .slice(0, 6);
  } catch {
    return [];
  }
}

function recordRange(records) {
  if (!records.length) return null;
  const lows = records.map((record) => record.resaleLowUSD);
  const highs = records.map((record) => record.resaleHighUSD);
  return { low: Math.min(...lows), high: Math.max(...highs) };
}

function marketSummary(series) {
  const records = evaluateAffiliateEligibility(series).verifiedMarketRecords;
  const secrets = records.filter((record) => String(record.rarity).toLowerCase().includes("secret"));
  const regular = records.filter((record) => !String(record.rarity).toLowerCase().includes("secret"));
  const regularRange = recordRange(regular);
  const secretRange = recordRange(secrets);
  const format = (range) => range ? `$${range.low}–$${range.high}` : null;

  if (regularRange && secretRange) return `Commons ${format(regularRange)} · Secret ${format(secretRange)}`;
  if (regularRange) return format(regularRange);
  if (secretRange) return `Secret ${format(secretRange)}`;
  return null;
}

function marketplaceLink(series) {
  const firstVerified = evaluateAffiliateEligibility(series).verifiedMarketRecords[0];
  if (!firstVerified?.figure) return null;
  return ebayOutboundPath(series.slug, firstVerified.figure, "active", { source: "page" });
}

export default async function Home() {
  const series = allSeries();
  const publishedVideos = await getPublishedVideos();
  const latestCollectibles = series
    .filter((item) => evaluateAffiliateEligibility(item).verifiedMarketRecordCount > 0)
    .slice(0, 6);

  return (
    <main className="bv-home">
      <BlindVaultHomeStyles />
      <PublishedVideoStyles />
      <style>{PUBLIC_ONLY_CSS}</style>

      <header className="bv-nav">
        <Link className="bv-brand" href="/">BlindBoxAI</Link>
        <nav aria-label="Primary navigation">
          {publishedVideos.length > 0 && <a href="#videos">Latest videos</a>}
          <a href="#collectibles">Collectibles</a>
          <Link href="/ask">Mr. Know It All</Link>
          <a href="#knowledge">Knowledge base</a>
        </nav>
        <Link className="bv-nav-cta" href="/ask">Ask a question</Link>
      </header>

      <section className="bv-hero">
        <div className="bv-hero-copy">
          <p className="bv-kicker">Collectible intelligence</p>
          <h1>Research the collectible before you buy.</h1>
          <p className="bv-lead">
            Compare reviewed sold-price evidence, browse collectible guides, and ask
            Mr. Know It All. Missing evidence stays marked as missing instead of guessed.
          </p>
          <div className="bv-actions">
            <Link className="bv-button bv-button-primary" href="/ask">Ask Mr. Know It All →</Link>
            <a className="bv-button bv-button-secondary" href="#collectibles">Browse verified collectibles</a>
          </div>
          <p className="bv-micro">Verified means at least two documented completed sales.</p>
        </div>

        <div className="bv-vault-visual" aria-label="Illustration of collectible research evidence">
          <div className="bv-vault-grid">
            <div className="bv-mini-card"><span>PRICES</span><strong>Completed sales</strong></div>
            <div className="bv-mini-card"><span>COLLECTIBLES</span><strong>Verified catalog</strong></div>
            <div className="bv-mini-card"><span>ASK</span><strong>Mr. Know It All</strong></div>
            <div className="bv-mini-card"><span>KNOWLEDGE</span><strong>Evidence-backed guides</strong></div>
          </div>
          <div className="bv-safe-door" aria-hidden="true">
            <div className="bv-safe-ring"><div className="bv-safe-hub">AI</div></div>
          </div>
          <div className="bv-evidence-note">
            <span>Public research</span>
            <p>Sold-price observations, series context, and marketplace links stay connected to the item being researched.</p>
          </div>
        </div>
      </section>

      {publishedVideos.length > 0 && (
        <section className="bv-videos" id="videos">
          <div className="bv-section-head">
            <div>
              <p className="bv-kicker">Latest videos</p>
              <h2>Published collectible research.</h2>
            </div>
            <span>{publishedVideos.length} published</span>
          </div>
          <div className="bv-video-grid">
            {publishedVideos.map((video) => (
              <article className="bv-video-card" key={video.research_run_id}>
                <video controls playsInline preload="metadata" src={video.video_url} />
                <div className="bv-video-copy">
                  <span>{video.vertical === "pokemon_tcg" ? "POKÉMON" : "SPORTS CARDS"}</span>
                  <h3>{video.title}</h3>
                  <p>Published collectible research from BlindBoxAI.</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="bv-research" id="collectibles">
        <div className="bv-section-head">
          <div>
            <p className="bv-kicker">Verified collectibles</p>
            <h2>Items with at least two documented completed sales.</h2>
          </div>
          <span>{latestCollectibles.length} featured</span>
        </div>

        <div className="bv-series-grid">
          {latestCollectibles.map((s) => {
            const summary = marketSummary(s);
            const verification = seriesPriceVerification(s);
            const outbound = marketplaceLink(s);
            return (
              <article className="bv-series-card" key={s.slug}>
                <div className="bv-series-top">
                  <div>
                    <Link className="bv-card-title" href={`/series/${s.slug}`}>{s.name}</Link>
                    <span>{s.brand}</span>
                  </div>
                  {summary && <b>{summary}</b>}
                </div>
                <div className="bv-series-meta">
                  <span className={verification.needsResearchCount ? "bv-status bv-status-pending" : "bv-status"}>
                    {verification.verifiedCount} verified price{verification.verifiedCount === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="bv-card-links">
                  <Link href={`/series/${s.slug}`}>Open knowledge →</Link>
                  {outbound && (
                    <a href={outbound} target="_blank" rel="nofollow sponsored noopener noreferrer">
                      Current eBay listings ↗
                    </a>
                  )}
                </div>
                {outbound && <small className="bv-paid-link">Paid link · BlindBoxAI may earn from qualifying purchases.</small>}
              </article>
            );
          })}
        </div>
      </section>

      <section className="bv-workflow" id="mr-know-it-all">
        <div className="bv-section-intro">
          <p className="bv-kicker">Ask Mr. Know It All</p>
          <h2>Ask the public collector assistant.</h2>
          <p>
            Ask about BlindBoxAI's reviewed collectible evidence. Exact sold evidence is returned
            when available; missing evidence is queued for research instead of guessed.
          </p>
        </div>
        <Link className="bv-button bv-button-primary bv-public-ask" href="/ask">Ask Mr. Know It All →</Link>
      </section>

      <section className="bv-research" id="knowledge">
        <div className="bv-section-head">
          <div>
            <p className="bv-kicker">Knowledge base</p>
            <h2>Research already indexed by BlindBoxAI.</h2>
          </div>
          <span>{series.length} series</span>
        </div>

        <div className="bv-series-grid">
          {series.map((s) => {
            const summary = marketSummary(s);
            const verification = seriesPriceVerification(s);
            const secret = s._dataQuality?.pullOdds?.status === "verified" ? s.pullOdds?.secret : null;
            return (
              <Link className="bv-series-card" href={`/series/${s.slug}`} key={s.slug}>
                <div className="bv-series-top">
                  <div>
                    <strong>{s.name}</strong>
                    <span>{s.brand}</span>
                  </div>
                  {summary && <b>{summary}</b>}
                </div>
                <div className="bv-series-meta">
                  {secret && <span className="bv-chip">SECRET {secret}</span>}
                  <span className={verification.needsResearchCount ? "bv-status bv-status-pending" : "bv-status"}>
                    {verification.verifiedCount
                      ? `${verification.verifiedCount} verified price${verification.verifiedCount === 1 ? "" : "s"}`
                      : "No verified prices yet"}
                    {verification.needsResearchCount > 0 && ` · ${verification.needsResearchCount} need research`}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}

const PUBLIC_ONLY_CSS = `
.bv-card-title{font-weight:800;color:#101717;text-decoration:none}
.bv-card-title:hover{text-decoration:underline}
.bv-card-links{display:flex;flex-wrap:wrap;gap:14px;margin-top:16px}
.bv-card-links a{font-size:.78rem;font-weight:750;color:#087e7a;text-decoration:none}
.bv-paid-link{display:block;margin-top:8px;color:#697471;font-size:.65rem;line-height:1.4}
.bv-public-ask{margin-top:24px}
.bv-series-top b{max-width:240px;text-align:right;white-space:normal}
`;
