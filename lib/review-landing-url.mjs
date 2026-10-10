import { HAIR_SALON_MEDIA_URL, HAIR_SALON_TITLE } from "./hair-salon-asset.mjs";

// Only the exact owner-reviewed Hair Salon media points to its product guide.
// Unrecognized/changed media retains the general BlindBoxAI landing.
const BASE_URL = "https://www.blindboxai.com";
const HAIR_SALON_GUIDE = `${BASE_URL}/series/labubu-the-monsters-hair-salon`;

export function reviewVideoLandingUrl(item) {
  if (item?.title === HAIR_SALON_TITLE && item?.video_url === HAIR_SALON_MEDIA_URL) {
    return HAIR_SALON_GUIDE;
  }
  return BASE_URL;
}
