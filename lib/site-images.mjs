// Image slots for the public site.
//
// Every slot starts as null, which makes <ImageSlot> draw BlindBoxAI's own
// placeholder art. To use a real illustration, put the file in
// public/illustrations/ and set the slot's value to its public path, e.g.
//   "category-blind-boxes": "/illustrations/category-blind-boxes.webp",
//
// Only original artwork or the owner's own photos belong here: no brand logos,
// no marketplace listing photos, no copyrighted product shots.
export const SITE_IMAGES = {
  hero: null,
  "category-blind-boxes": null,
  "category-cards": null,
  "category-coins": null,
  "guide-fake-check": null,
  "guide-mew-ex": null,
  "tool-buy-or-pass": null,
  "tool-resale-margin": null,
  "accessory/acrylic-display-case": null,
  "accessory/acrylic-display-risers": null,
  "accessory/mini-display-lighting": null,
  "accessory/figure-storage-organizer": null,
  "accessory/display-turntable": null,
};

// Series slots are keyed "series/<slug>" and fall back to the blind-box art.
export function siteImage(slot) {
  const value = SITE_IMAGES[slot];
  return typeof value === "string" && value.startsWith("/illustrations/") ? value : null;
}
