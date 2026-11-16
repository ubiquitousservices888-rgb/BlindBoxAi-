import Link from "next/link";
import EpnLiveCheck from "./EpnLiveCheck";

export const metadata = {
  title: "Verify eBay affiliate reporting | BlindBoxAI Owner",
  description: "Owner-only live eBay reporting verification, independent of the earnings dashboard.",
  robots: { index: false, follow: false },
};

export default function OwnerEpnCheckPage() {
  return (
    <main style={{ width: "min(720px, calc(100% - 32px))", margin: "32px auto 80px" }}>
      <p><Link href="/owner-dashboard">Owner control room</Link></p>
      <h1>eBay affiliate connection check</h1>
      <EpnLiveCheck />
      <p><Link href="/owner-dashboard/revenue">Open earnings dashboard</Link></p>
    </main>
  );
}
