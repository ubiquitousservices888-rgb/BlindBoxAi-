import { notFound } from 'next/navigation';
import { normalizeCampaignId, normalizeSource } from '../../../../lib/campaign-attribution.mjs';
import {
  allRevenueOffers,
  getRevenueOffer,
  revenueOutboundPath,
} from '../../../../lib/revenue-offers';
import BuyOrPassClient from '../BuyOrPassClient';

export const revalidate = 86400;

export function generateStaticParams() {
  return allRevenueOffers().map((offer) => ({ offerId: offer.id }));
}

export async function generateMetadata({ params }) {
  const { offerId } = await params;
  const offer = getRevenueOffer(offerId);
  if (!offer) return {};
  return {
    title: `${offer.figure} Buy-or-Pass — ${offer.seriesName} | BlindBoxAI`,
    description: `Check an asking price for ${offer.figure} against BlindBoxAI's reviewed ${offer.referenceLow}–${offer.referenceHigh} USD reference range, then compare active listings and sold comps.`,
    alternates: { canonical: `/tools/buy-or-pass/${offer.id}` },
  };
}

export default async function BuyOrPassOfferPage({ params, searchParams }) {
  const { offerId } = await params;
  const query = await searchParams;
  const offer = getRevenueOffer(offerId);
  if (!offer) notFound();

  const attribution = {
    campaignId: normalizeCampaignId(query?.campaign),
    source: normalizeSource(query?.source || 'buy_or_pass'),
  };

  return (
    <BuyOrPassClient
      offer={offer}
      activePath={revenueOutboundPath(offer.id, 'active', attribution)}
      soldPath={revenueOutboundPath(offer.id, 'sold', attribution)}
      campaignId={attribution.campaignId}
      source={attribution.source}
    />
  );
}
