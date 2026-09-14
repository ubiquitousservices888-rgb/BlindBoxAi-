import Link from "next/link";
import BlindVaultHomeStyles from "./_components/BlindVaultHomeStyles";
import PublishedVideoStyles from "./_components/PublishedVideoStyles";
import { allSeries, priceSpan, seriesPriceVerification } from "../lib/data";

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

export default async function Home() {
  const series = allSeries();
  const publishedVideos = await getPublishedVideos();

  return (
    <main className="bv-home">
      <BlindVaultHomeStyles />
      <PublishedVideoStyles />
      <header className="bv-nav">
        <Link className="bv-brand" href="/">BlindBoxAI</Link>
        <nav aria-label="Primary navigation">
          <a href="#videos">Videos</a>
          <a href="#how-it-works">How it works</a>
          <a href="#research">Research</a>
          <Link href="/pro">Reseller tools</Link>
          <a href="#about">About</a>
        </nav>
        <Link className="bv-nav-cta" href="/tools/buy-or-pass">Start researching</Link>
      </header>

      <section className="bv-hero">
        <div className="bv-hero-copy">
          <p className="bv-kicker">Verified collectible intelligence</p>
          <h1>Know the market before you open the box.</h1>
          <p className="bv-lead">
            Research reviewed sold-price observations, compare collectible values, inspect
            authenticity warning signs, and keep missing evidence clearly marked instead of guessed.
          </p>
          <div className="bv-actions">
            <Link className="bv-button bv-button-primary" href="/tools/buy-or-pass">Start researching →</Link>
            <a className="bv-button bv-button-secondary" href="#videos">Watch published research</a>
          </div>
          <p className="bv-micro">Start free. Evidence stays attached to the decision.</p>
        </div>

        <div className="bv-vault-visual" aria-label="Illustration of collectible research evidence">
          <div className="bv-vault-grid">
            <div className="bv-mini-card"><span>PRICE</span><strong>Verified comps</strong></div>
            <div className="bv-mini-card"><span>AUTHENTICITY</span><strong>Warning signs</strong></div>
            <div className="bv-mini-card"><span>RARITY</span><strong>Published odds</strong></div>
            <div className="bv-mini-card"><span>STATUS</span><strong>Missing stays missing</strong></div>
          </div>
          <div className="bv-safe-door" aria-hidden="true">
            <div className="bv-safe-ring"><div className="bv-safe-hub">AI</div></div>
          </div>
          <div className="bv-evidence-note">
            <span>Evidence first</span>
            <p>Historical observations stay connected to their source and context.</p>
          </div>
        </div>
      </section>

      <section className="bv-videos" id="videos">
        <div className="bv-section-head">
          <div>
            <p className="bv-kicker">Published research videos</p>
            <h2>Sports cards and Pokémon 30th — linked after owner approval.</h2>
          </div>
          <span>{publishedVideos.length ? `${publishedVideos.length} live` : "Publishing feed ready"}</span>
        </div>
        {publishedVideos.length ? (
          <div className="bv-video-grid">
            {publishedVideos.map((video) => (
              <article className="bv-video-card" key={video.research_run_id}>
                <video controls playsInline preload="metadata" src={video.video_url} />
                <div className="bv-video-copy">
                  <span>{video.vertical === "pokemon_tcg" ? "POKÉMON 30TH" : "SPORTS CARDS"}</span>
                  <h3>{video.title}</h3>
                  <p>Owner-reviewed, published through the approved social workflow, and linked back to BlindBoxAI.</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="bv-video-empty">
            <strong>The publishing feed is connected.</strong>
            <p>Approved sports-card and Pokémon 30th videos will appear here automatically after Buffer publishing succeeds.</p>
            <Link className="bv-text-link" href="/media-upload">Upload the next video →</Link>
          </div>
        )}
      </section>

      <section className="bv-standard" id="about">
        <div>
          <p className="bv-kicker">The BlindBoxAI standard</p>
          <h2>Trust is a product decision.</h2>
        </div>
        <div className="bv-standard-item">
          <strong>No invented values</strong>
          <p>Missing evidence is shown as missing — not filled with a guess.</p>
        </div>
        <div className="bv-standard-item">
          <strong>Traceable comps</strong>
          <p>Reviewed pricing keeps the details needed to assess relevance.</p>
        </div>
        <div className="bv-standard-item">
          <strong>Clear incentives</strong>
          <p>Affiliate relationships are disclosed where paid links appear.</p>
        </div>
      </section>

      <section className="bv-workflow" id="how-it-works">
        <div className="bv-section-intro">
          <p className="bv-kicker">Research workflow</p>
          <h2>From mystery listing to informed decision.</h2>
          <p>BlindBoxAI organizes the evidence collectors usually piece together across listings, guides, and marketplace research.</p>
        </div>
        <div className="bv-steps">
          <article className="bv-step">
            <span className="bv-step-no">01</span>
            <div><h3>Deterministic comp lookups</h3><p>Compare reviewed historical observations without opaque AI estimates.</p></div>
          </article>
          <article className="bv-step">
            <span className="bv-step-no">02</span>
            <div><h3>Authenticity context</h3><p>Check counterfeit warning signs and source-backed series guidance before committing.</p></div>
          </article>
          <article className="bv-step">
            <span className="bv-step-no">03</span>
            <div><h3>Ask Mr. Know It All</h3><p>Use the evidence-first collector assistant when you need a broader research path.</p></div>
          </article>
        </div>
        <Link className="bv-text-link" href="/ask">Open Mr. Know It All →</Link>
      </section>

      <section className="bv-research" id="research">
        <div className="bv-section-head">
          <div>
            <p className="bv-kicker">Live research library</p>
            <h2>Series intelligence already in BlindBoxAI.</h2>
          </div>
          <span>{series.length} tracked</span>
        </div>

        <div className="bv-series-grid">
          {series.map((s) => {
            const span = priceSpan(s);
            const verification = seriesPriceVerification(s);
            const secret = s._dataQuality?.pullOdds?.status === "verified" ? s.pullOdds?.secret : null;
            return (
              <Link className="bv-series-card" href={`/series/${s.slug}`} key={s.slug}>
                <div className="bv-series-top">
                  <div>
                    <strong>{s.name}</strong>
                    <span>{s.brand}</span>
                  </div>
                  {span && <b>${span.low}–${span.high}</b>}
                </div>
                <div className="bv-series-meta">
                  {secret && <span className="bv-chip">SECRET {secret}</span>}
                  <span className={verification.needsResearchCount ? "bv-status bv-status-pending" : "bv-status"}>
                    {verification.verifiedCount
                      ? `${verification.verifiedCount} verified price${verification.verifiedCount === 1 ? "" : "s"}`
                      : "No verified prices"}
                    {verification.needsResearchCount > 0 && ` · ${verification.needsResearchCount} need research`}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="bv-depth">
        <div className="bv-section-intro">
          <p className="bv-kicker">Research depth</p>
          <h2>Use the free tools now. Add deeper workflow later.</h2>
          <p>The public research experience stays useful without an account. Reseller tools remain separate until they are ready.</p>
        </div>
        <div className="bv-plan-grid">
          <article className="bv-plan-card">
            <span>EXPLORER</span>
            <h3>$0</h3>
            <p>For individual purchase checks and market discovery.</p>
            <ul>
              <li>Buy-or-Pass research</li>
              <li>Series guides</li>
              <li>Authenticity resources</li>
              <li>Clearly disclosed paid links</li>
            </ul>
            <Link className="bv-button bv-button-secondary" href="/tools/buy-or-pass">Research free</Link>
          </article>
          <article className="bv-plan-card bv-plan-featured">
            <span>RESELLER TOOLS <em>In build</em></span>
            <h3>Planned $9<span>/month</span></h3>
            <p>For collectors and resellers who need repeat monitoring and export tools.</p>
            <ul>
              <li>Email price alerts</li>
              <li>Bulk collection valuation</li>
              <li>CSV export</li>
              <li>Saved set-completion tracking</li>
            </ul>
            <Link className="bv-button bv-button-primary" href="/pro">See reseller tools</Link>
          </article>
        </div>
      </section>

      <section className="bv-faq">
        <p className="bv-kicker">Clear answers</p>
        <h2>Before you trust a comp</h2>
        <div className="bv-faq-list">
          <details><summary>Does BlindBoxAI generate collectible prices?</summary><p>No. Reviewed market observations are kept separate from missing or unverified values.</p></details>
          <details><summary>What makes a comp useful?</summary><p>Source, condition, timing, edition, and listing context matter. A number without context is weak evidence.</p></details>
          <details><summary>Are affiliate relationships disclosed?</summary><p>Yes. Paid-link relationships are disclosed where affiliate links are used.</p></details>
          <details><summary>Can BlindBoxAI guarantee authenticity?</summary><p>No. The site surfaces warning signs and evidence; final authentication still requires appropriate inspection and expert judgment.</p></details>
        </div>
      </section>

      <section className="bv-final-cta">
        <p className="bv-kicker">Collect with evidence</p>
        <h2>Make your next collectible decision less blind.</h2>
        <p>Put reviewed pricing, series context, and authenticity guidance behind the decision.</p>
        <Link className="bv-button bv-button-light" href="/tools/buy-or-pass">Open BlindBoxAI →</Link>
      </section>
    </main>
  );
}
