import Link from "next/link";
import DashboardClient from "./DashboardClient";

export const metadata = {
  title: "Owner control room | BlindBoxAI",
  description: "Private owner dashboard for publish status, affiliate activity, and earnings.",
  robots: { index: false, follow: false },
};

export default function OwnerDashboardPage() {
  return (
    <main style={{ width: "min(920px, calc(100% - 32px))", margin: "40px auto 80px" }}>
      <p style={{ fontFamily: "monospace", fontSize: "0.75rem", letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.7 }}>
        BlindBoxAI owner control room
      </p>
      <h1>Notifications & affiliate activity</h1>
      <p style={{ lineHeight: 1.7 }}>
        Private dashboard for finished media uploads and tracked eBay Partner Network outbound clicks.
      </p>
      <section style={{ border: "2px solid currentColor", borderRadius: 12, padding: 16, margin: "18px 0" }}>
        <strong>Video upload</strong>
        <p style={{ lineHeight: 1.6 }}>
          Use the signed-storage uploader below; the video returns here for the same WATCH and owner APPROVE gate.
        </p>
        <Link href="/media-upload" style={{ display: "inline-block", padding: "13px 16px", borderRadius: 10, background: "#facc15", color: "#111827", fontWeight: 800, textDecoration: "none" }}>
          UPLOAD NEW REVIEW VIDEO
        </Link>
      </section>
      <p><Link href="/owner-dashboard/revenue">Open the daily earnings & payout dashboard →</Link></p>
      <p><Link href="/owner-dashboard/ebay">Connect eBay for owner-only research →</Link></p>
      <DashboardClient />
    </main>
  );
}
