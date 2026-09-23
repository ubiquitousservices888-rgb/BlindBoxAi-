import Link from "next/link";

import {
  MEW_30TH_CARDS,
  MEW_30TH_CHECKED_AT,
  mew30thOutboundPath,
  mew30thSummary,
} from "../../../lib/mew-30th-comparison.mjs";

export const revalidate = 86400;

export const metadata = {
  title: "Mew ex #152 vs #158 — identify the card before you buy | BlindBoxAI",
  description: "Compare Mew ex 152/128 and 158/128 from Pokémon 30th Celebration using collector numbers, rarity, illustrator, and a dated sample of completed raw sales.",
};

function usd(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function dateLabel(value) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function MewComparisonPage() {
  return (
    <main style={{ width: "min(900px,calc(100% - 32px))", margin: "36px auto 80px" }}>
      <p style={{ fontFamily: "monospace", opacity: .72 }}>MISLABEL WATCH · POKÉMON 30TH CELEBRATION</p>
      <h1>Mew ex #152 vs #158: check the number before you buy</h1>
      <p style={{ fontSize: "1.05rem", lineHeight: 1.65 }}>
        These are two different Mew ex cards from the same set. The safest first check is the collector number printed on the card itself:
        <strong> 152/128</strong> or <strong>158/128</strong>.
      </p>
      <p style={{ padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 10 }}>
        <strong>Prices as of {dateLabel(MEW_30TH_CHECKED_AT)}.</strong> The figures below are a transparent sample of completed raw-card sales, not asking prices and not a promise of future value.
      </p>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 18, marginTop: 24 }}>
        {MEW_30TH_CARDS.map((card) => {
          const summary = mew30thSummary(card);
          return (
            <article key={card.key} style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 18 }}>
              <p style={{ fontFamily: "monospace", margin: 0 }}>MEW EX #{card.key}</p>
              <h2 style={{ marginTop: 8 }}>{card.number}</h2>
              <dl>
                <dt>Rarity</dt><dd><strong>{card.rarity}</strong></dd>
                <dt>Illustrator</dt><dd>{card.illustrator}</dd>
                <dt>Condition sampled</dt><dd>Raw / ungraded</dd>
                <dt>Observed completed sales</dt><dd>{summary.completedSaleCount}</dd>
                <dt>Sample median</dt><dd><strong>{usd(summary.median)}</strong></dd>
                <dt>Observed sample range</dt><dd>{usd(summary.low)} – {usd(summary.high)}</dd>
                <dt>Latest sale in sample</dt><dd>{dateLabel(summary.latestSaleAt)}</dd>
              </dl>
              <details>
                <summary>See the six completed-sale observations</summary>
                <ul>
                  {card.completedSales.map((sale, index) => (
                    <li key={`${sale.soldAt}-${sale.amount}-${index}`}>
                      {dateLabel(sale.soldAt)} — {usd(sale.amount)}
                    </li>
                  ))}
                </ul>
              </details>
              <p>
                <a
                  href={mew30thOutboundPath(card)}
                  target="_blank"
                  rel="sponsored nofollow noopener"
                >
                  Check current eBay listings through BlindBoxAI →
                </a>
              </p>
            </article>
          );
        })}
      </section>

      <section style={{ marginTop: 30 }}>
        <h2>How to tell them apart</h2>
        <ol style={{ lineHeight: 1.7 }}>
          <li><strong>Read the collector number on the card.</strong> Do not rely only on the listing title.</li>
          <li><strong>Check the rarity label.</strong> #152 is a Special Illustration Rare; #158 is a Futuristic Rare.</li>
          <li><strong>Check the illustrator.</strong> #152 credits Kuroimori; #158 credits YOSHIROTTEN.</li>
        </ol>
        <p>
          Some third-party guides disagree on rarity labels. For identification, use the collector number printed on the card first and treat guide labels as secondary.
        </p>
      </section>

      <section style={{ marginTop: 30 }}>
        <h2>Possible listing mismatch</h2>
        <p>
          Titles and item details can disagree. That does not prove deception. It means the listing needs another check before you pay.
          Verify the card number in the photos, ask for clear front and back images if needed, and compare against recent completed sales rather than asking prices.
        </p>
      </section>

      <section style={{ marginTop: 30 }}>
        <h2>What this page does not claim</h2>
        <p>
          This is not a complete census of every sale and it does not combine graded cards with raw cards. Prices can move quickly after a new set releases.
          BlindBoxAI keeps the observation dates visible so an old snapshot is not presented as a current guarantee.
        </p>
      </section>

      <p style={{ marginTop: 30, fontSize: 13, opacity: .78 }}>
        Affiliate disclosure: BlindBoxAI may earn a commission from qualifying eBay purchases, at no extra cost to you.
      </p>
      <p><Link href="/">← Back to BlindBoxAI</Link></p>
    </main>
  );
}
