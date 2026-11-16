import Link from "next/link";
import ProAccount from "./ProAccount";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { proOrigin } from "../../../lib/pro-config.mjs";

export const metadata = { title: "Your Pro account | BlindBoxAI", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ProAccountPage() {
  const origin = proOrigin();
  const host = (await headers()).get("host");
  if (["blindboxai.com", "www.blindboxai.com"].includes(host) && host !== new URL(origin).host) redirect(`${origin}/pro/account`);
  return <main>
    <Link className="crumb" href="/pro">← Reseller tools</Link>
    <h1 className="ptitle">Your BlindBoxAI Pro account</h1>
    <p>Save resale cost scenarios, compare your assumptions, and export your collection to CSV. These estimates are separate from verified sales and cash revenue.</p>
    <ProAccount />
  </main>;
}
