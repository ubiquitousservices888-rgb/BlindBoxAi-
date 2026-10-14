import Link from "next/link";
import ResaleCalculator from "../../pro/ResaleCalculator";

export const metadata = {
  title: "Collectible resale profit calculator — fees and shipping | BlindBoxAI",
  description: "Free collectible and trading-card resale profit calculator. Estimate net proceeds and break-even sale price using your purchase price, tax, shipping, and platform fees. No account required.",
};

export default function ResaleMarginTool() {
  return (
    <main>
      <Link className="crumb" href="/">← BlindBoxAI research</Link>
      <h1 className="ptitle">Collectible resale profit calculator</h1>
      <p style={{ maxWidth: "70ch", lineHeight: 1.65 }}>
        Before buying a blind box or trading card to resell, ask two different
        questions: <strong>What has a comparable item actually sold for?</strong> and
        <strong> What remains after the entire transaction?</strong> A listing price
        is not proof of a sale, and a profitable-looking spread can disappear
        after shipping, taxes, fees, and risk.
      </p>
      <ResaleCalculator />
      <section className="plan" style={{ marginTop: "24px" }}>
        <h2>Three checks beyond the math</h2>
        <ol>
          <li>Compare completed sales for the same variant and condition. Asking prices are not completed transactions.</li>
          <li>Check whether the evidence is recent and credible. One sale does not establish a stable market price.</li>
          <li>Think about authenticity, returns, handling time, and liquidity; the calculator cannot predict an actual buyer.</li>
        </ol>
        <p>
          For research with missing data clearly labeled, <Link href="/ask">ask Mr. Know It All</Link>.
          To influence which collector tools are built next, <Link href="/pro?utm_source=site&utm_medium=tool&utm_campaign=alpha_launch_202610">join the free reseller alpha list</Link>.
        </p>
      </section>
    </main>
  );
}
