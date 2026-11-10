// Image slots for the public site.
//
// A slot set to null makes <ImageSlot> draw BlindBoxAI's own placeholder art.
// Illustrations: BlindBoxAI product illustration set v1 (original, drawn in code). To use a real illustration, put the file in
// public/illustrations/ and set the slot's value to its public path, e.g.
//   "category-blind-boxes": "/illustrations/category-blind-boxes.webp",
//
// Only original artwork or the owner's own photos belong here: no brand logos,
// no marketplace listing photos, no copyrighted product shots.
export const SITE_IMAGES = {
  hero: "/illustrations/blind-box-set.svg",
  "category-blind-boxes": "/illustrations/blind-box.svg",
  "category-cards": "/illustrations/trading-card.svg",
  "category-coins": "/illustrations/coins.svg",
  "guide-fake-check": "/illustrations/plush-figure.svg",
  "guide-mew-ex": "/illustrations/booster-pack.svg",
  "tool-buy-or-pass": null,
  "tool-resale-margin": null,
  "accessory/acrylic-display-case": "/illustrations/display-case.svg",
  "accessory/acrylic-display-risers": "/illustrations/display-risers.svg",
  "accessory/mini-display-lighting": "/illustrations/display-lighting.svg",
  "accessory/figure-storage-organizer": "/illustrations/storage-organizer.svg",
  "accessory/display-turntable": "/illustrations/display-turntable.svg",
  // Fallbacks for series pages that have no picture of their own.
  "series-default-plush": "/illustrations/plush-figure.svg",
  "series-default-figure": "/illustrations/vinyl-figure.svg",
};

// Series slots are keyed "series/<slug>"; a caller can pass a fallback slot.
export function siteImage(slot, fallbackSlot) {
  for (const key of [slot, fallbackSlot]) {
    const value = key ? SITE_IMAGES[key] : null;
    if (typeof value === "string" && value.startsWith("/illustrations/")) return value;
  }
  return null;
}
