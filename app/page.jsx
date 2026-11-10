import Link from "next/link";
import BlindVaultHomeStyles from "./_components/BlindVaultHomeStyles";
import PublishedVideoStyles from "./_components/PublishedVideoStyles";
import FeaturedAccessoryGrid from "./_components/FeaturedAccessoryGrid";
import SiteHomeStyles from "./_components/SiteHomeStyles";
import ImageSlot from "./_components/ImageSlot";
import { FAKE_CHECK_GUIDE } from "../lib/site-links.mjs";
import { allSeries, ebayOutboundPath, seriesPriceVerification } from "../lib/data";
import { evaluateAffiliateEligibility, PUBLIC_PRICE_FRESHNESS_DAYS } from "../lib/market-eligibility.mjs";
import { isPublicVideo, publicVideoStatusLabel, summarizePublicVideos } from "../lib/public-video-status.mjs";

export const revalidate = 300;

const VIDEO_FEED_URL = "https://lazzdoadoqzrzlarerfx.supabase.co/functions/v1/published-video-feed";

function videoVerticalLabel(vertical) {
  const key = String(vertical ?? "").trim().toLowerCase();
  if (key === "pokemon_tcg") return "POKÉMON";
  if (key === "sports_cards") return "SPORTS CARDS";
  if (["blind_box", "blind_boxes", "designer_toys", "labubu", "pop_mart"].includes(key)) return "BLIND BOXES";
  return "COLLECTIBLES";
}

async function getPublishedVideos() {
  try {
    const response = await fetch(VIDEO_FEED_URL, { next: { revalidate: 300 } });
    if (!response.ok) return [];
    const payload = await response.json();
    const items = Array.isArray(payload?.items) ? payload.items : [];
    return items.filter(isPublicVideo).slice(0, 6);
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

function displayDate(value) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : null;
}

function marketSummary(series, now) {
  const records = evaluateAffiliateEligibility(series, { now }).verifiedMarketRecords;
  if (!records.length) return null;
  const secrets = records.filter((record) => String(record.rarity).toLowerCase().includes("secret"));
  const regular = records.filter((record) => !String(record.rarity).toLowerCase().includes("secret"));
  const regularRange = recordRange(regular);
  const secretRange = recordRange(secrets);
  const format = (range) => range ? `$${range.low}–$${range.high}` : null;
  const rangeText = regularRange && secretRange
    ? `Commons ${format(regularRange)} · Secret ${format(secretRange)}`
    : regularRange
      ? format(regularRange)
      : `Secret ${format(secretRange)}`;
  const dated = records.some((record) => record.freshnessStatus !== "fresh");
  const latestSaleAt = records.map((record) => record.latestSaleAt).filter(Boolean).sort().at(-1) ?? null;
  const completedSales = records.reduce((total, record) => total + (Number(record.completedSaleCount) || 0), 0);
  const latestText = displayDate(latestSaleAt);
  return {
    text: `${dated ? "Historical evidence" : "Recent evidence"} · ${rangeText}`,
    freshnessStatus: dated ? "dated" : "fresh",
    freshnessLabel: `${completedSales} documented sales · ${latestText ? `latest ${latestText}` : "sale date unavailable"}${dated ? " · includes dated evidence" : ` · within ${PUBLIC_PRICE_FRESHNESS_DAYS} days`}`,
  };
}

function marketplaceLink(series) {
  const firstVerified = evaluateAffiliateEligibility(series).verifiedMarketRecords[0];
  if (!firstVerified?.figure) return null;
  return ebayOutboundPath(series.slug, firstVerified.figure, "active", { source: "page" });
}

export default async function Home() {
  const series = allSeries();
  const publishedVideos = await getPublishedVideos();
  const now = new Date();
  const latestCollectibles = series
    .filter((item) => evaluateAffiliateEligibility(item, { now }).verifiedMarketRecordCount > 0)
    .slice(0, 6);
  const documentedSales = series.reduce((total, item) => total + evaluateAffiliateEligibility(item, { now }).verifiedMarketRecords
    .reduce((sum, record) => sum + (Number(record.completedSaleCount) || 0), 0), 0);
  const verifiedPrices = series.reduce((total, item) => total + seriesPriceVerification(item).verifiedCount, 0);

  return (
    <main className="bv-home">
      <BlindVaultHomeStyles />
      <PublishedVideoStyles />
      <SiteHomeStyles />
      <style>{PUBLIC_ONLY_CSS}</style>

      <section className="hx-hero">
        <div className="hx-hero-in">
          <div className="hx-hero-copy">
            <p className="bv-kicker">Collectible intelligence</p>
            <h1>Research the collectible before you buy.</h1>
            <p className="bv-lead">
              Compare reviewed sold-price evidence, browse collectible guides, and ask
              Mr. Know It All. Missing evidence stays marked as missing instead of guessed.
            </p>
            <div className="bv-actions">
              <Link className="bv-button bv-button-primary" href="/ask">Ask Mr. Know It All →</Link>
              <a className="bv-button hx-button-ghost" href="#collectibles">Browse verified collectibles</a>
            </div>
            <Link className="hx-hero-tool" href="/tools/resale-margin?utm_source=site&utm_medium=home&utm_campaign=alpha_launch_202610">Free margin tool + join the alpha list →</Link>
            <p className="bv-micro">Verified means at least two documented completed sales. Freshness is shown separately using a {PUBLIC_PRICE_FRESHNESS_DAYS}-day window.</p>
          </div>
          <div className="hx-hero-art">
            <ImageSlot slot="hero" kind="box" tone="dark" alt="BlindBoxAI collectible research illustration" priority className="hx-hero-slot" />
            <div className="hx-hero-badge hx-hero-badge-1"><span>Sold, not asked</span><strong>Completed sales only</strong></div>
            <div className="hx-hero-badge hx-hero-badge-2"><span>Rule</span><strong>2+ sales to verify</strong></div>
          </div>
        </div>
      </section>

      <section className="hx-stats" aria-label="What BlindBoxAI covers">
        <div><strong>{series.length}</strong><span>series indexed</span></div>
        <div><strong>{verifiedPrices}</strong><span>verified prices</span></div>
        <div><strong>{documentedSales}</strong><span>documented completed sales</span></div>
        <div><strong>{PUBLIC_PRICE_FRESHNESS_DAYS} days</strong><span>freshness window</span></div>
      </section>

      <nav className="hx-jump" aria-label="On this page">
        <a href="#categories">Categories</a>
        <a href="#collectibles">Verified prices</a>
        <a href="#collector-essentials">Shop accessories</a>
        {publishedVideos.length > 0 && <a href="#videos">Latest videos</a>}
        <a href="#guides">Guides &amp; tools</a>
        <a href="#knowledge">Knowledge base</a>
      </nav>

      <section className="hx-section" id="categories">
        <div className="bv-section-head">
          <div>
            <p className="bv-kicker">Browse by category</p>
            <h2>What we research.</h2>
          </div>
        </div>
        <div className="hx-cat-grid">
          <Link className="hx-cat" href="#knowledge">
            <ImageSlot slot="category-blind-boxes" kind="box" alt="Blind boxes illustration" />
            <div className="hx-cat-copy">
              <h3>Blind boxes &amp; designer toys</h3>
              <p>Pop Mart series, secret figures and plush pendants: sold ranges, rarity and fake checks.</p>
              <span>{series.length} series →</span>
            </div>
          </Link>
          <Link className="hx-cat" href="/guides/mew-ex-152-vs-158">
            <ImageSlot slot="category-cards" kind="card" tone="violet" alt="Trading cards illustration" />
            <div className="hx-cat-copy">
              <h3>Trading cards</h3>
              <p>Pokémon and sports cards: identify the exact card, then compare completed raw sales.</p>
              <span>Start with Mew ex #152 vs #158 →</span>
            </div>
          </Link>
          <div className="hx-cat hx-cat-soon" aria-label="Coins, coming soon">
            <ImageSlot slot="category-coins" kind="coin" tone="amber" alt="Coins illustration" />
            <div className="hx-cat-copy">
              <h3>Coins <em>Coming soon</em></h3>
              <p>Coin research will follow the same rule: completed sales first, nothing guessed.</p>
              <span>In research</span>
            </div>
          </div>
        </div>
      </section>

      <section className="hx-section hx-tint" id="collectibles">
        <div className="bv-section-head">
          <div>
            <p className="bv-kicker">Verified sale evidence</p>
            <h2>Items with at least two documented completed sales.</h2>
          </div>
          <span>{latestCollectibles.length} featured</span>
        </div>

        <div className="hx-product-grid">
          {latestCollectibles.map((s) => {
            const summary = marketSummary(s, now);
            const verification = seriesPriceVerification(s);
            const outbound = marketplaceLink(s);
            return (
              <article className="hx-product" key={s.slug}>
                <Link href={`/series/${s.slug}`} tabIndex={-1} aria-hidden="true">
                  <ImageSlot slot={`series/${s.slug}`} fallbackSlot={/plush/i.test(s.name) ? "series-default-plush" : "series-default-figure"} kind="box" alt="" />
                </Link>
                <div className="hx-product-body">
                  <span className="hx-product-brand">{s.brand}</span>
                  <Link className="bv-card-title" href={`/series/${s.slug}`}>{s.name}</Link>
                  {summary?.text && <b className="hx-product-price">{summary.text}</b>}
                  <div className="bv-series-meta">
                    <span className={verification.needsResearchCount ? "bv-status bv-status-pending" : "bv-status"}>
                      {verification.verifiedCount} verified price{verification.verifiedCount === 1 ? "" : "s"}
                    </span>
                    {summary?.freshnessLabel && <span className={summary.freshnessStatus === "fresh" ? "bv-status" : "bv-status bv-status-pending"}>{summary.freshnessLabel}</span>}
                  </div>
                  <div className="bv-card-links">
                    <Link href={`/series/${s.slug}`}>Open knowledge →</Link>
                    {outbound && (
                      <a href={outbound} target="_blank" rel="sponsored nofollow noopener">
                        Current eBay listings ↗
                      </a>
                    )}
                  </div>
                  {outbound && <small className="bv-paid-link">Paid link · BlindBoxAI may earn from qualifying purchases.</small>}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <FeaturedAccessoryGrid />

      {publishedVideos.length > 0 && (
        <section className="bv-videos" id="videos">
          <div className="bv-section-head">
            <div>
              <p className="bv-kicker">Latest videos</p>
              <h2>Recent collectible research videos.</h2>
            </div>
            <span>{summarizePublicVideos(publishedVideos)}</span>
          </div>
          <div className="bv-video-grid">
            {publishedVideos.map((video) => (
              <article className="bv-video-card" key={video.research_run_id ?? video.video_url}>
                <video controls playsInline preload="metadata" src={video.video_url} />
                <div className="bv-video-copy">
                  <span>{videoVerticalLabel(video.vertical)}</span>
                  <h3>{video.title}</h3>
                  <p>{publicVideoStatusLabel(video.status)} · {video.status === "partial" ? "Not all channels confirmed." : "Collector research from BlindBoxAI."}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="hx-section" id="guides">
        <div className="bv-section-head">
          <div>
            <p className="bv-kicker">Guides &amp; tools</p>
            <h2>Check it before you pay.</h2>
          </div>
        </div>
        <div className="hx-guide-feature">
          <ImageSlot slot="guide-fake-check" kind="guide" tone="amber" alt="Fake-Check Field Guide illustration" />
          <div className="hx-guide-copy">
            <span className="hx-pill">Field guide · {FAKE_CHECK_GUIDE.format}</span>
            <h3>{FAKE_CHECK_GUIDE.name}</h3>
            <p>{FAKE_CHECK_GUIDE.summary} Covers Pop Mart box, code and figure checks, Labubu tells, Pokémon card checks, and what to do if it&apos;s fake.</p>
            <div className="hx-guide-buy">
              <a className="bv-button bv-button-primary" href={FAKE_CHECK_GUIDE.url} target="_blank" rel="noopener">Get the guide · {FAKE_CHECK_GUIDE.price} ↗</a>
              <small>Sold by BlindBoxAI on Gumroad. Educational only, not an authentication certificate.</small>
            </div>
          </div>
        </div>
        <div className="hx-guide-grid">
          <Link className="hx-guide" href="/guides/mew-ex-152-vs-158">
            <ImageSlot slot="guide-mew-ex" kind="card" tone="violet" alt="" />
            <span className="hx-pill">Free guide</span>
            <h3>Mew ex #152 vs #158</h3>
            <p>Two different cards, often mislabeled. Check the number, then the sold prices.</p>
          </Link>
          <Link className="hx-guide" href="/tools/buy-or-pass">
            <ImageSlot slot="tool-buy-or-pass" kind="tool" alt="" />
            <span className="hx-pill">Free tool</span>
            <h3>Buy or pass</h3>
            <p>Enter an asking price and compare it with reviewed reference ranges.</p>
          </Link>
          <Link className="hx-guide" href="/tools/resale-margin?utm_source=site&utm_medium=home&utm_campaign=alpha_launch_202610">
            <ImageSlot slot="tool-resale-margin" kind="coin" tone="amber" alt="" />
            <span className="hx-pill">Free tool</span>
            <h3>Resale margin</h3>
            <p>Work out fees and profit before you list.</p>
          </Link>
        </div>
      </section>

      <section className="hx-ask" id="mr-know-it-all">
        <div className="hx-ask-in">
          <div className="bv-section-intro">
            <p className="bv-kicker">Ask Mr. Know It All</p>
            <h2>Ask the public collector assistant.</h2>
            <p>
              Ask about BlindBoxAI's reviewed collectible evidence. Exact sold evidence is returned
              when available; missing evidence is queued for research instead of guessed.
            </p>
          </div>
          <Link className="bv-button bv-button-primary bv-public-ask" href="/ask">Ask Mr. Know It All →</Link>
        </div>
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
            const summary = marketSummary(s, now);
            const verification = seriesPriceVerification(s);
            const secret = s._dataQuality?.pullOdds?.status === "verified" ? s.pullOdds?.secret : null;
            return (
              <Link className="bv-series-card" href={`/series/${s.slug}`} key={s.slug}>
                <div className="bv-series-top">
                  <div>
                    <strong>{s.name}</strong>
                    <span>{s.brand}</span>
                  </div>
                  {summary?.text && <b>{summary.text}</b>}
                </div>
                <div className="bv-series-meta">
                  {secret && <span className="bv-chip">SECRET {secret}</span>}
                  <span className={verification.needsResearchCount ? "bv-status bv-status-pending" : "bv-status"}>
                    {verification.verifiedCount
                      ? `${verification.verifiedCount} verified price${verification.verifiedCount === 1 ? "" : "s"}`
                      : "No verified prices yet"}
                    {verification.needsResearchCount > 0 && ` · ${verification.needsResearchCount} need research`}
                  </span>
                  {summary?.freshnessLabel && <span className={summary.freshnessStatus === "fresh" ? "bv-status" : "bv-status bv-status-pending"}>{summary.freshnessLabel}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="hx-section hx-about" id="about">
        <div className="bv-section-head">
          <div>
            <p className="bv-kicker">How we verify</p>
            <h2>Evidence first. Nothing guessed.</h2>
          </div>
        </div>
        <div className="hx-trust-grid">
          <div className="hx-trust"><span>01</span><h3>Completed sales, not asking prices</h3><p>Prices come from items that actually sold. Listings that are only asking a price don&apos;t count.</p></div>
          <div className="hx-trust"><span>02</span><h3>Two or more sales to verify</h3><p>A price is marked verified only with at least two documented completed sales. Lots and bundles are kept separate.</p></div>
          <div className="hx-trust"><span>03</span><h3>Dated, with freshness shown</h3><p>Every range shows when it was checked. Evidence older than {PUBLIC_PRICE_FRESHNESS_DAYS} days is labeled as dated.</p></div>
          <div className="hx-trust"><span>04</span><h3>Independent and disclosed</h3><p>BlindBoxAI isn&apos;t affiliated with any brand named here. Paid links are labeled, and our pictures are original drawings.</p></div>
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
.bv-series-top b{max-width:260px;text-align:right;white-space:normal}
`;