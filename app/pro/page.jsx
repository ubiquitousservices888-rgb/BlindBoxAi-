import Link from "next/link";
import Waitlist from "./waitlist";
import ResaleCalculator from "./ResaleCalculator";

export const metadata = {
  title: "Collector & reseller alpha | BlindBoxAI",
  description: "Calculate a collectible resale margin with your own assumptions. Join free early access for BlindBoxAI reseller tools built around evidence, costs, and reasons to pass.",
};

export default function Pro() {
  return (
    <main>
      <Link className="crumb" href="/">← All series</Link>
      <h1 className="ptitle">Collector & reseller alpha</h1>
      <p style={{ maxWidth: "70ch", color: "var(--muted)", lineHeight: 1.65 }}>
        Before you pay a premium, know what has actually sold, what the fees cost,
        and when walking away is the better decision. BlindBoxAI keeps reviewed
        sold-price evidence separate from asking prices and marks missing research.
      </p>
      <div className="plan">
        <p className="fine">EARLY ACCESS · NO CHARGE · NO GUARANTEED INVITE</p>
        <h2>Help shape the next reseller tools</h2>
        <p style={{ lineHeight: 1.65 }}>
          We are recruiting early users who buy, trade, or resell blind boxes and
          collectible cards. The margin calculator below works now. Price alerts,
          bulk valuation, CSV export, and saved collections are proposed features,
          not live paid services.
        </p>
        <ul>
          <li><strong>Actual sales over hype:</strong> reviewed completed sales and visible freshness matter more than optimistic listings.</li>
          <li><strong>Real margin over sticker price:</strong> account for buy cost, inbound tax and shipping, selling fees, and fulfillment.</li>
          <li><strong>A reason to pass:</strong> research should make it easier to avoid bad purchases, not pressure you into them.</li>
        </ul>
        <Waitlist />
        <p className="fine" style={{ marginTop: "12px" }}>
          Opt in to hear about reseller tool availability. We will not charge or
          enroll you automatically. Explore today's <Link href="/ask">public research assistant</Link> while the alpha develops.
        </p>
      </div>
      <ResaleCalculator />
      <section className="plan" style={{ marginTop: "24px" }}>
        <h2>What could become paid</h2>
        <p style={{ lineHeight: 1.65 }}>
          Planned $9/month reseller tools: price-change alerts, collection-level
          tracking, batch valuation, and CSV export. This is a product hypothesis,
          not an active subscription. We will validate usefulness before charging.
        </p>
      </section>
    </main>
  );
}
