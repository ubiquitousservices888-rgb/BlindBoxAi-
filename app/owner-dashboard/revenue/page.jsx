import Link from "next/link";
import RevenueSummaryClient from "../RevenueSummaryClient";

export const metadata = {
  title: "Revenue & payouts | BlindBoxAI",
  description: "Private owner dashboard for confirmed affiliate earnings, reports, and payout status.",
  robots: { index: false, follow: false },
};

export default function OwnerRevenuePage() {
  return (
    <main style={{ width: "min(980px, calc(100% - 32px))", margin: "40px auto 80px" }}>
      <p>
        <Link href="/owner-dashboard">← Owner control room</Link>
      </p>
      <p
        style={{
          fontFamily: "monospace",
          fontSize: "0.75rem",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          opacity: 0.7,
        }}
      >
        BlindBoxAI owner control
      </p>
      <h1>Revenue & payout dashboard</h1>
      <p style={{ lineHeight: 1.7 }}>
        Confirmed network-reported earnings, daily totals, report imports, and payout status. Missing reporting data is shown as unavailable rather than estimated.
      </p>
      <RevenueSummaryClient />
    </main>
  );
}
