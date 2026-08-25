'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { evaluateStrongBreadPrice, TWINKLE_STRONG_BREAD_REFERENCE } from '../../../lib/twinkle-buy-or-pass.mjs';

function money(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

export default function TwinkleBuyOrPassClient() {
  const [price, setPrice] = useState('');
  const result = useMemo(() => {
    if (!price.trim()) return null;
    return evaluateStrongBreadPrice(price);
  }, [price]);

  const ref = TWINKLE_STRONG_BREAD_REFERENCE;

  return (
    <main>
      <Link className="crumb" href="/">← BlindBoxAI</Link>

      <section className="hero">
        <p className="eyebrow">Free collector utility · verified-data MVP</p>
        <h1>Twinkle Twinkle<br />Buy-or-Pass</h1>
        <p>
          Enter the total price you would actually pay for <strong>Strong Bread</strong> from POP MART's
          Twinkle Twinkle Savor the Moment Series. We compare it with a dated market snapshot — no account,
          paid service, or AI guessing required.
        </p>
      </section>

      <section className="tw-tool" aria-labelledby="price-check-title">
        <div className="tw-tool-head">
          <div>
            <p className="tw-label">Figure</p>
            <h2 id="price-check-title">Strong Bread</h2>
            <p className="tw-muted">Use the all-in price including shipping and seller fees when possible.</p>
          </div>
          <span className="chip">USD</span>
        </div>

        <label className="tw-label" htmlFor="tw-price">Total asking price</label>
        <div className="tw-input-wrap">
          <span aria-hidden="true">$</span>
          <input
            id="tw-price"
            inputMode="decimal"
            autoComplete="off"
            placeholder="49.00"
            value={price}
            onChange={(event) => setPrice(event.target.value.replace(/[^0-9.]/g, ''))}
            aria-describedby="tw-price-help"
          />
        </div>
        <p id="tw-price-help" className="tw-muted">Example: if the figure is $44 plus $5 shipping, enter 49.</p>

        {result && !result.ok && (
          <div className="tw-result tw-result-warning" role="status">
            <strong>Check the price</strong>
            <p>{result.message}</p>
          </div>
        )}

        {result?.ok && (
          <div className={`tw-result tw-result-${result.verdict.tone}`} role="status" aria-live="polite">
            <p className="tw-result-kicker">BlindBoxAI result</p>
            <h3>{result.verdict.label}</h3>
            <p>{result.verdict.summary}</p>
            <dl className="tw-stats">
              <div><dt>Your price</dt><dd>{money(result.price)}</dd></div>
              <div><dt>Reference current</dt><dd>{money(ref.market.current)}</dd></div>
              <div><dt>Recent range</dt><dd>{money(ref.market.low)}–{money(ref.market.high)}</dd></div>
            </dl>
            <p className="tw-delta">
              {result.deltaFromCurrent === 0
                ? 'Exactly at the reference current price.'
                : `${money(Math.abs(result.deltaFromCurrent))} ${result.deltaFromCurrent < 0 ? 'below' : 'above'} the reference current price (${Math.abs(result.deltaPctFromCurrent)}%).`}
            </p>
            <div className="tw-actions">
              <Link className="cta" href="/ask">Ask about authenticity or condition →</Link>
            </div>
          </div>
        )}
      </section>

      <section className="block">
        <h2>Reference snapshot <span className="k">DATED DATA</span></h2>
        <div className="tw-reference">
          <div>
            <span>Observed market range</span>
            <strong>{money(ref.market.low)}–{money(ref.market.high)}</strong>
          </div>
          <div>
            <span>Observed current</span>
            <strong>{money(ref.market.current)}</strong>
          </div>
          <div>
            <span>Official blind-box retail</span>
            <strong>{money(ref.officialBlindBoxRetail)}</strong>
          </div>
        </div>
        <p className="tw-muted tw-source-note">
          Market price history observation date: {ref.market.observedAt}. Sources were rechecked by BlindBoxAI on {ref.market.checkedAt}.
          Retail price is context for an unopened random blind box; it is not the same product condition as a confirmed individual Strong Bread figure.
        </p>
        <div className="tw-source-links">
          <a href={ref.sources.official} target="_blank" rel="noreferrer">POP MART official series page ↗</a>
          <a href={ref.sources.market} target="_blank" rel="noreferrer">Market price-history source ↗</a>
        </div>
      </section>

      <section className="block">
        <h2>What this result means</h2>
        <p>
          This is a price-comparison aid, not an appraisal or authenticity guarantee. Condition, packaging,
          provenance, seller reputation, shipping, taxes, and whether the item is opened can materially change value.
          An unusually low price should trigger more verification, not automatic confidence.
        </p>
      </section>

      <style jsx>{`
        .tw-tool{margin-top:28px;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px}
        .tw-tool-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:20px}
        .tw-tool-head h2{font-size:1.45rem;margin-top:3px}
        .tw-label{font-family:"Spline Sans Mono",ui-monospace,monospace;font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
        .tw-muted{color:var(--muted);font-size:.86rem;margin-top:5px}
        .tw-input-wrap{display:flex;align-items:center;gap:8px;background:#fff;border:1.5px solid var(--line-strong);border-radius:12px;padding:10px 14px;margin-top:7px;font-family:"Spline Sans Mono",ui-monospace,monospace;font-size:1.15rem}
        .tw-input-wrap:focus-within{border-color:var(--verify);box-shadow:0 0 0 3px rgba(14,124,102,.12)}
        .tw-input-wrap input{width:100%;border:0;outline:0;background:transparent;font:inherit;color:var(--ink)}
        .tw-result{margin-top:20px;border-radius:14px;padding:18px;border:1.5px solid var(--line-strong);background:#fff}
        .tw-result-good{border-color:var(--verify)}
        .tw-result-warning{border-color:var(--fake)}
        .tw-result-high{border-color:#9A3B3B}
        .tw-result-neutral{border-color:var(--rare)}
        .tw-result-kicker{font-family:"Spline Sans Mono",ui-monospace,monospace;font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
        .tw-result h3{font-size:1.55rem;margin:4px 0 8px}
        .tw-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:16px}
        .tw-stats div{border-top:1px solid var(--line);padding-top:8px}
        .tw-stats dt{font-size:.72rem;color:var(--muted)}
        .tw-stats dd{font-family:"Spline Sans Mono",ui-monospace,monospace;font-weight:600;margin:2px 0 0}
        .tw-delta{font-size:.84rem;color:var(--muted);margin-top:12px}
        .tw-actions{margin-top:4px}
        .tw-reference{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px}
        .tw-reference div{display:grid;gap:4px}
        .tw-reference span{font-size:.74rem;color:var(--muted)}
        .tw-reference strong{font-family:"Spline Sans Mono",ui-monospace,monospace}
        .tw-source-note{margin-top:12px}
        .tw-source-links{display:flex;flex-wrap:wrap;gap:14px;margin-top:12px;font-size:.84rem}
        @media(max-width:560px){.tw-stats,.tw-reference{grid-template-columns:1fr}.tw-tool-head{align-items:flex-start}}
      `}</style>
    </main>
  );
}
