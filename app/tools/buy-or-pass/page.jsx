import Link from 'next/link';
import { allRevenueOffers } from '../../../lib/revenue-offers';

export const metadata = {
  title: 'Free Blind Box Buy-or-Pass Checks | BlindBoxAI',
  description: 'Enter an asking price for a reviewed blind-box collectible and compare it with BlindBoxAI reference ranges before you buy.',
  alternates: { canonical: '/tools/buy-or-pass' },
};

export default function BuyOrPassIndexPage() {
  const offers = allRevenueOffers();

  return (
    <main>
      <Link className="crumb" href="/">← BlindBoxAI</Link>
      <section className="hero">
        <p className="eyebrow">Free buyer tools · reviewed evidence only</p>
        <h1>Buy-or-Pass<br />deal checks</h1>
        <p>
          Pick a collectible, enter the total asking price, and compare it against a reviewed BlindBoxAI reference range.
          Listings are not automatically endorsed; unusually low prices trigger a verification warning.
        </p>
      </section>

      <div className="shead">
        <h2>Available checks</h2>
        <span className="count">{offers.length} verified offers</span>
      </div>

      <div className="slist">
        {offers.map((offer) => (
          <Link className="srow" href={`/tools/buy-or-pass/${offer.id}`} key={offer.id}>
            <div className="srow-top">
              <span>
                <span className="srow-name">{offer.figure}</span>
                <span className="srow-brand">{offer.seriesName}</span>
              </span>
              <span className="price">${offer.referenceLow}–${offer.referenceHigh}</span>
            </div>
            <div className="srow-meta">
              {offer.id.startsWith('twinkle-') && <span className="chip secret">TWINKLE FIRST</span>}
              <span className="verify"><span className="dot"></span>reviewed price evidence</span>
            </div>
          </Link>
        ))}
      </div>

      <section className="block">
        <h2>How it earns without changing the answer</h2>
        <p>
          The price result is calculated from the reviewed reference data before any marketplace link is shown.
          If you choose to compare listings afterward, BlindBoxAI may earn an affiliate commission from a qualifying purchase.
          The commission does not change the Buy-or-Pass result.
        </p>
      </section>
    </main>
  );
}
