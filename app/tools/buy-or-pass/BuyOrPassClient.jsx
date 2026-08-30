'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import LiveEbayListings from '../../_components/LiveEbayListings';
import { evaluateOfferPrice } from '../../../lib/buy-or-pass-core.mjs';

function money(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

export default function BuyOrPassClient({ offer, activePath, soldPath, campaignId = '', source = 'buy_or_pass' }) {
  const [price, setPrice] = useState('');
  const result = useMemo(() => {
    if (!price.trim()) return null;
    return evaluateOfferPrice(offer, price);
  }, [offer, price]);

  return (
    <main>
      <Link className="crumb" href="/tools/buy-or-pass">← All Buy-or-Pass checks</Link>

      <section className="hero">
        <p className="eyebrow">Free buyer-intent utility · reviewed evidence only</p>
        <h1>{offer.figure}<br />Buy-or-Pass</h1>
        <p>
          {offer.brand} · {offer.seriesName}. Enter the total price you would actually pay and BlindBoxAI
          compares it with the reviewed reference range. No account and no paid tool required.
        </p>
      </section>

      <section className="tw-tool" aria-labelledby="deal-check-title">
        <div className="tw-tool-head">
          <div>
            <p className="tw-label">Collectible</p>
            <h2 id="deal-check-title">{offer.figure}</h2>
            <p className="tw-muted">Use the all-in price including shipping and seller fees when possible.</p>
          </div>
          <span className="chip">{offer.currency}</span>
        </div>

        <label className="tw-label" htmlFor="deal-price">Total asking price</label>
        <div className="tw-input-wrap">
          <span aria-hidden="true">$</span>
          <input
            id="deal-price"
            inputMode="decimal"
            autoComplete="off"
            placeholder={String(offer.referenceCurrent.toFixed(2))}
            value={price}
            onChange={(event) => setPrice(event.target.value.replace(/[^0-9.]/g, ''))}
            aria-describedby="deal-price-help"
          />
        </div>
        <p id="deal-price-help" className="tw-muted">Enter one all-in purchase price, not a bid range.</p>

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
              <div><dt>Reference midpoint</dt><dd>{money(offer.referenceCurrent)}</dd></div>
              <div><dt>Reviewed range</dt><dd>{money(offer.referenceLow)}–{money(offer.referenceHigh)}</dd></div>
            </dl>
            <p className="tw-delta">
              {result.deltaFromCurrent === 0
                ? 'Exactly at the reference midpoint.'
                : `${money(Math.abs(result.deltaFromCurrent))} ${result.deltaFromCurrent < 0 ? 'below' : 'above'} the reference midpoint (${Math.abs(result.deltaPctFromCurrent)}%).`}
            </p>
          </div>
        )}
      </section>

      <section className="block">
        <h2>Compare the market <span className="k">BUYER OPTIONS</span></h2>
        <p className="affiliate-disclosure">
          Disclosure: As an eBay Partner, BlindBoxAI may earn a commission from qualifying purchases.
        </p>
        <div className="market-actions">
          <a className="cta" href={activePath} target="_blank" rel="sponsored nofollow noopener noreferrer">
            Compare active listings ↗
          </a>
          <a className="market-secondary" href={soldPath} target="_blank" rel="sponsored nofollow noopener noreferrer">
            Review sold comps ↗
          </a>
        </div>
        <p className="tw-muted">
          These BlindBoxAI links open the corresponding eBay market view with affiliate attribution preserved.
        </p>
      </section>

      <LiveEbayListings
        offerId={offer.id}
        campaignId={campaignId}
        source={source}
        heading={`Live ${offer.figure} listings`}
      />

      <section className="block">
        <h2>Evidence <span className="k">REVIEWED</span></h2>
        <div className="evidence-card">
          <div><span>Reviewed range</span><strong>{money(offer.referenceLow)}–{money(offer.referenceHigh)}</strong></div>
          <div><span>Reference midpoint</span><strong>{money(offer.referenceCurrent)}</strong></div>
          <div><span>Rarity</span><strong>{offer.rarity}</strong></div>
        </div>
        <p className="tw-muted evidence-copy">{offer.evidence}</p>
        {offer.checkedAt && <p className="tw-muted">Reference checked: {offer.checkedAt}</p>}
        <div className="source-links">
          {offer.sourceUrl && <a href={offer.sourceUrl} target="_blank" rel="noreferrer">Evidence source ↗</a>}
          {offer.officialUrl && <a href={offer.officialUrl} target="_blank" rel="noreferrer">Official product source ↗</a>}
          {offer.seriesSlug && <Link href={`/series/${offer.seriesSlug}`}>BlindBoxAI series reference →</Link>}
        </div>
      </section>

      <section className="block">
        <h2>Important</h2>
        <p>
          This is a price-comparison aid, not an appraisal or authenticity guarantee. Condition, packaging,
          provenance, seller reputation, taxes, and shipping can materially change value. An unusually low price
          is a reason to verify more carefully, not proof of a bargain.
        </p>
      </section>

      <style jsx>{`
        .tw-tool{margin-top:28px;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px}
        .tw-tool-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:20px}
        .tw-tool-head h2{font-size:1.45rem;margin-top:3px}
        .tw-label{font-family:"Spline Sans Mono",ui-monospace,monospace;font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
        .tw-muted{color:var(--muted);font-size:.86rem;margin-top:7px}
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
        .affiliate-disclosure{margin:10px 0 0;font-size:.82rem;line-height:1.5;opacity:.86}
        .market-actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
        .market-secondary{display:inline-flex;align-items:center;margin-top:20px;border:1.4px solid var(--verify);border-radius:999px;padding:10px 18px;text-decoration:none;font-weight:600}
        .evidence-card{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px}
        .evidence-card div{display:grid;gap:4px}.evidence-card span{font-size:.74rem;color:var(--muted)}.evidence-card strong{font-family:"Spline Sans Mono",ui-monospace,monospace}
        .evidence-copy{margin-top:12px}.source-links{display:flex;flex-wrap:wrap;gap:14px;margin-top:12px;font-size:.84rem}
        @media(max-width:560px){.tw-stats,.evidence-card{grid-template-columns:1fr}.tw-tool-head{align-items:flex-start}}
      `}</style>
    </main>
  );
}