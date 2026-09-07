import RevenueSummaryClient from "../RevenueSummaryClient";

export const metadata = {
  title: "Owner earnings | BlindBoxAI",
  description: "Private daily eBay and Amazon affiliate earnings dashboard.",
  robots: { index: false, follow: false },
};

export default function OwnerRevenuePage() {
  return (
    <main style={{ width: "min(980px, calc(100% - 32px))", margin: "40px auto 80px" }}>
      <p style={{ fontFamily: "monospace", fontSize: "0.75rem", letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.7 }}>
        BlindBoxAI owner earnings
      </p>
      <h1>Daily earnings & payout view</h1>
      <p style={{ lineHeight: 1.7 }}>
        Network-reported eBay and Amazon clicks, orders, confirmed earnings, daily totals, and payout timing. Local click events are diagnostic; confirmed earnings come from the affiliate networks.
      </p>
      <RevenueSummaryClient />
    </main>
  );
}
