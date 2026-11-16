import Link from "next/link";
import { Suspense } from "react";
import Waitlist from "./waitlist";
import ResaleCalculator from "./ResaleCalculator";
import { proCheckoutAvailable } from "../../lib/pro-stripe.mjs";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Collector & reseller alpha | BlindBoxAI",
  description: "Calculate a collectible resale margin with your own assumptions. Join free early access for BlindBoxAI reseller tools built around evidence, costs, and reasons to pass.",
};

async function ProEnrollment() {
  const subscriptionsOpen = await proCheckoutAvailable();
  return subscriptionsOpen ? <><p><strong>$9.99 USD/month</strong>. Review applicable tax at checkout. Cancel renewal through your account.</p><Link className="cta" href="/pro/account">Open your Pro account</Link></> : <p>New subscriptions are not open yet. The free calculator and waitlist below remain available.</p>;
}

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
      <section className="plan" style={{ marginBottom: "24px" }}>
        <h2>BlindBoxAI Pro</h2>
        <p>Save up to 250 resale cost scenarios, compare your own assumptions, and export your saved scenarios to CSV. Automated price alerts and market valuations are not included.</p>
        <Suspense fallback={<p>Checking Pro enrollment availability…</p>}><ProEnrollment /></Suspense>
      </section>
      <div className="plan">
        <p className="fine">EARLY ACCESS · NO CHARGE · NO GUARANTEED INVITE</p>
        <h2>Help shape the next reseller tools</h2>
        <p style={{ lineHeight: 1.65 }}>
          We are recruiting early users who buy, trade, or resell blind boxes and
          collectible cards. The margin calculator below works now. Price alerts
          and automated market valuations are still proposed features,
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
        <h2>What is still in development</h2>
        <p style={{ lineHeight: 1.65 }}>
          Automated price alerts and market valuations are still in development.
          Pro covers saved cost scenarios and CSV export when subscriptions open.
          Joining the free waitlist does not start a subscription.
        </p>
      </section>
    </main>
  );
}
