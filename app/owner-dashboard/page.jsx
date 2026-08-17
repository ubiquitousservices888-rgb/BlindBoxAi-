import DashboardClient from "./DashboardClient";

export const metadata = {
  title: "Owner control room | BlindBoxAI",
  description: "Private owner dashboard for verified funnel activity and provider-confirmed commercial outcomes.",
  robots: { index: false, follow: false },
};

export default function OwnerDashboardPage() {
  return (
    <main style={{ width: "min(920px, calc(100% - 32px))", margin: "40px auto 80px" }}>
      <p style={{ fontFamily: "monospace", fontSize: "0.75rem", letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.7 }}>
        BlindBoxAI owner control room
      </p>
      <h1>Verified funnel & owner operations</h1>
      <p style={{ lineHeight: 1.7 }}>
        Private production dashboard for page views, landing sources, collector questions, confirmed signups, EPN outbound clicks, and provider-confirmed conversion evidence. Use your dedicated owner dashboard access code.
      </p>
      <DashboardClient />
    </main>
  );
}
