import Link from "next/link";
import Waitlist from "./waitlist";

export const metadata = { title: "Reseller tools | BlindBoxAI" };

export default function Pro() {
  const endpointConfigured = Boolean(String(process.env.NEXT_PUBLIC_WAITLIST_ENDPOINT ?? "").trim());
  return (
    <main>
      <Link className="crumb" href="/">← All series</Link>
      <h1 className="ptitle">Reseller tools</h1>
      <p style={{ maxWidth: "52ch", color: "var(--muted)", marginBottom: "20px" }}>
        For people flipping blind boxes, not chasing them: email price alerts when a
        figure's range moves, bulk valuation of a whole lot, CSV export, and saved
        set-completion tracking. In build now.
      </p>
      <div className="plan">
        <div className="amt mono">
          Coming soon
          <span style={{ fontSize: ".9rem", color: "var(--muted)", marginLeft: "8px" }}>
            planned $9/mo
          </span>
        </div>
        <ul>
          <li>Email price alerts on any figure</li>
          <li>Bulk collection valuation</li>
          <li>CSV export of every range</li>
          <li>Saved set-completion tracking</li>
        </ul>
        {endpointConfigured
          ? <Waitlist />
          : <p className="nodata">Waitlist opening soon — configure NEXT_PUBLIC_WAITLIST_ENDPOINT.</p>}
        <p className="fine" style={{ marginTop: "14px" }}>
          No charge now, and no spam — one email when it launches. This tool helps you
          avoid fakes and overpaying; it will never push you to buy more.
        </p>
      </div>
    </main>
  );
}
