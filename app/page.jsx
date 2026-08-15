import Link from "next/link";
import { allSeries, seriesVerified, priceSpan } from "../lib/data";

function Guilloche() {
  const lines = [];
  for (let i = 0; i < 6; i++) {
    const y = 18 + i * 14;
    lines.push(<path key={i} d={`M0 ${y} C 120 ${y-16}, 240 ${y+16}, 360 ${y} S 600 ${y-16}, 760 ${y}`}
      fill="none" stroke="#0E7C66" strokeWidth="1"/>);
  }
  return <svg className="guilloche" viewBox="0 0 760 110" preserveAspectRatio="none" aria-hidden="true">{lines}</svg>;
}

export default function Home() {
  const series = allSeries();
  return (
    <main>
      <section className="hero">
        <Guilloche />
        <p className="eyebrow">Independent collector intelligence</p>
        <h1>Know the odds.<br/>Spot the fakes.</h1>
        <p>Ask about blind-box brands and series across the collectible category, then check
          reviewed US-sold observations and counterfeit warning signs. No account needed.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Link className="cta" href="/ask">Ask Mr. Know It All →</Link>
          <Link className="cta" href="/pro">Reseller tools →</Link>
        </div>
      </section>

      <div className="shead">
        <h2>Series</h2>
        <span className="count">{series.length} tracked</span>
      </div>

      <div className="slist">
        {series.map(s => {
          const span = priceSpan(s);
          const ok = seriesVerified(s);
          const secret = s.pullOdds?.secret;
          return (
            <Link className="srow" href={`/series/${s.slug}`} key={s.slug}>
              <div className="srow-top">
                <span><span className="srow-name">{s.name}</span><span className="srow-brand">{s.brand}</span></span>
                {span && <span className="price">${span.low}–${span.high}</span>}
              </div>
              <div className="srow-meta">
                {secret && <span className="chip secret">SECRET {secret}</span>}
                <span className={`verify ${ok ? "" : "pending"}`}>
                  <span className="dot"></span>{ok ? "US-sold verified" : "verifying"}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
