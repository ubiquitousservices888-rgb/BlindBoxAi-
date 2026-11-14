import { LANDING_BASE_URL, reviewVideoLanding } from "./review-landing.mjs";

// Kept for existing callers: the qualifying affiliate landing page, or the
// general BlindBoxAI landing when the video has none. Publishing separately
// refuses any video whose landing does not qualify (lib/review-caption.mjs).
export function reviewVideoLandingUrl(item) {
  const landing = reviewVideoLanding(item);
  return landing.qualifies ? landing.url : LANDING_BASE_URL;
}
