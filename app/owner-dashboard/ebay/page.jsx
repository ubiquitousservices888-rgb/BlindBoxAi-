import Link from "next/link";
import EbayOwnerClient from "./EbayOwnerClient";

export const metadata = {
  title: "Owner eBay research | BlindBoxAI",
  description: "Private owner-only eBay research connection.",
  robots: { index: false, follow: false },
};

export default function OwnerEbayPage() {
  return (
    <main style={{ width: "min(820px, calc(100% - 32px))", margin: "40px auto 80px" }}>
      <p><Link href="/owner-dashboard">← Owner control room</Link></p>
      <p style={{ fontFamily: "monospace", fontSize: "0.75rem", letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.7 }}>BlindBoxAI owner control</p>
      <h1>eBay research connection</h1>
      <p style={{ lineHeight: 1.7 }}>
        Connect the owner eBay account for read-only seller research. Public market research and EPN affiliate routing remain separate.
      </p>
      <EbayOwnerClient />
    </main>
  );
}
