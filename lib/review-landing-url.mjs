// Only the exact owner-reviewed Hair Salon media points to its product guide.
// Unrecognized/changed media stays on the existing general BlindBoxAI landing.
const BASE_URL = "https://www.blindboxai.com";
const HAIR_SALON_TITLE = "THE MONSTERS Hair Salon Series — Vinyl Plush Pendant Blind Box";
const HAIR_SALON_MEDIA_URL = "https://lazzdoadoqzrzlarerfx.supabase.co/storage/v1/object/public/blindboxai-review-videos/media/review/sha256-7097fc885956f8b28cd38d942099ba8cb153f8b8adb68ce134cf311e14f996d0.mp4";
const HAIR_SALON_GUIDE = `${BASE_URL}/series/labubu-the-monsters-hair-salon`;

export function reviewVideoLandingUrl(item) {
  if (item?.title === HAIR_SALON_TITLE && item?.video_url === HAIR_SALON_MEDIA_URL) {
    return HAIR_SALON_GUIDE;
  }
  return BASE_URL;
}
