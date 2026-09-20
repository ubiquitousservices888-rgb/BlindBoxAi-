import { notFound } from "next/navigation";

import {
  getOwnerCardListing,
  isEpnGenAiPromotionApproved,
} from "../../../lib/owner-card-listings.mjs";

const disclosure = "As an eBay Partner, BlindBoxAI may be compensated if you make a purchase.";

function cleanParam(value, pattern, max = 80) {
  const text = String(value || "").trim().slice(0, max);
  return pattern.test(text) ? text : "";
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const listing = getOwnerCardListing(id);
  if (!listing) return { title: "Card research | BlindBoxAI" };
  return {
    title: `${listing.identity?.item || listing.researchTargetId} | BlindBoxAI`,
    description: "Collector research page with a reviewed identity and a guarded eBay outbound path.",
  };
}

export default async function OwnerCardPage({ params, searchParams }) {
  const { id } = await params;
  const listing = getOwnerCardListing(id);
  if (!listing) notFound();

  const incoming = await searchParams;
  const campaign = cleanParam(incoming?.campaign, /^[a-z0-9_-]+$/i);
  const source = cleanParam(incoming?.source || incoming?.utm_source, /^[a-z0-9_-]+$/i);

  const outbound = new URLSearchParams({ id: listing.researchTargetId });
  if (campaign) outbound.set("campaign", campaign);
  if (source) outbound.set("source", source);

  const epnEnabled = isEpnGenAiPromotionApproved();
  const identity = listing.identity || {};

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px 72px", lineHeight: 1.55 }}>
      <p style={{ opacity: 0.72, marginBottom: 8 }}>BlindBoxAI sports-card research</p>
      <h1 style={{ fontSize: "clamp(2rem,7vw,3.4rem)", lineHeight: 1.05, margin: "0 0 18px" }}>
        {identity.item || listing.researchTargetId}
      </h1>

      <section style={{ border: "1px solid #2a3547", borderRadius: 18, padding: 20, marginBottom: 20 }}>
        <p><strong>Series:</strong> {identity.series || "Research target"}</p>
        <p><strong>Condition tracked:</strong> {identity.condition || "Not specified"}</p>
        {identity.edition ? <p><strong>Edition:</strong> {identity.edition}</p> : null}
        {identity.identifier ? <p><strong>Identifier:</strong> {identity.identifier}</p> : null}
        <p style={{ opacity: 0.78 }}>
          Asking prices are not treated as verified sold-value evidence. Completed-sale research is handled separately.
        </p>
      </section>

      <section style={{ border: "1px solid #2a3547", borderRadius: 18, padding: 20 }}>
        <p style={{ marginTop: 0 }}><strong>Live listing status:</strong> verified from the seller's eBay listing confirmation.</p>
        <p style={{ fontSize: 14, opacity: 0.78 }}>{disclosure}</p>

        {epnEnabled ? (
          <a
            href={`/api/out/owner-card?${outbound.toString()}`}
            target="_blank"
            rel="sponsored nofollow noopener noreferrer"
            style={{ display: "inline-block", padding: "12px 18px", border: "1px solid currentColor", borderRadius: 10, fontWeight: 700 }}
          >
            View the live card on eBay
          </a>
        ) : (
          <p style={{ fontWeight: 700 }}>
            The tracked eBay button is temporarily held until the required promotional-method approval is recorded.
          </p>
        )}
      </section>
    </main>
  );
}
