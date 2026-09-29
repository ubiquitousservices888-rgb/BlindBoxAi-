import Link from "next/link";
import RevenueSummaryClient from "../RevenueSummaryClient";

export const metadata = {
  title: "Affiliate earnings & payouts | BlindBoxAI",
  description: "Private owner-only dashboard for network-reported affiliate earnings and payout status.",
  robots: { index: false, follow: false },
};

export default function OwnerRevenuePage() {
  return (
    <main style={{ width: "min(920px, calc(100% - 32px))", margin: "40px auto 80px" }}>
      <p><Link href="/owner-dashboard">← Owner control room</Link></p>
      <p style={{ fontFamily: "monospace", fontSize: "0.75rem", letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.7 }}>
        BlindBoxAI owner control
      </p>
      <h1>Affiliate earnings & payouts</h1>
      <p style={{ lineHeight: 1.7 }}>
        Private dashboard for network-reported eBay Partner Network and Amazon Associates performance. Missing reporting stays unavailable rather than being treated as zero revenue.
      </p>
      <RevenueSummaryClient />
    </main>
  );
}
