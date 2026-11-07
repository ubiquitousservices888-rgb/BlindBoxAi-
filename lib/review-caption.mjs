import { DISCLOSURE, videoCaptionForService } from "./video-pipeline.mjs";
import { buildTrackedSocialCta } from "./social-attribution.mjs";
import { reviewVideoLandingUrl } from "./review-landing-url.mjs";
import { resolvePublicVideoTitle } from "./public-video-title.mjs";

// Single source of truth for the caption a review-queue video posts with.
// The publisher and the owner approval card both call this, so the preview
// the owner approves cannot drift from what is sent to Buffer.
export const REVIEW_CAPTION_CHANNELS = Object.freeze(["youtube", "tiktok"]);

export function reviewPublicTitle(item) {
  return resolvePublicVideoTitle(item?.title, {
    vertical: item?.vertical,
    researchRunId: item?.research_run_id,
    maxLength: 100,
  });
}

export function buildReviewCaption(item, channel, publicTitle = reviewPublicTitle(item)) {
  const trackedCta = buildTrackedSocialCta(reviewVideoLandingUrl(item), {
    runId: item?.research_run_id,
    service: channel,
  });
  const trackedUrl = new URL(trackedCta);
  const campaignId = trackedUrl.searchParams.get("campaign");
  const source = trackedUrl.searchParams.get("source");
  if (!campaignId || !source) {
    throw new Error(`${channel}: tracked CTA is missing campaign or source`);
  }
  const script = {
    title: publicTitle,
    facts: [item?.vertical === "pokemon_tcg" ? "Pokémon collectible research." : "Owner-reviewed BlindBoxAI collectible research."],
    productUrl: trackedCta,
  };
  const caption = videoCaptionForService(script, channel);
  if (!caption.includes(trackedCta) || !caption.includes(DISCLOSURE)) {
    throw new Error(`${channel}: tracked CTA and affiliate disclosure are required`);
  }
  return { channel, title: publicTitle, trackedCta, campaignId, source, caption };
}

// Owner-facing preview. Never throws: a channel that cannot be built safely is
// returned with ok:false so the card can block approval and say why.
export function reviewCaptionPreview(item, channels = REVIEW_CAPTION_CHANNELS) {
  return channels.map((channel) => {
    try {
      const built = buildReviewCaption(item, channel);
      return { channel, ok: true, title: built.title, link: built.trackedCta, caption: built.caption };
    } catch {
      return { channel, ok: false, error: "This caption could not be built safely, so this video cannot publish until it is fixed." };
    }
  });
}
