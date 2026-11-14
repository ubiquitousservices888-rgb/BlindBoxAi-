// The public waitlist request cannot designate itself as an owner-only test.
// Keep existing trusted historical owner_test events excluded in reporting,
// but never allow a browser to suppress a newly stored signup via that label.
export function safeWaitlistAttributionSource(cleanedSource) {
  return cleanedSource === "owner_test" ? "direct" : cleanedSource || "direct";
}

const UTM_KEYS = ["utmSource", "utmMedium", "utmCampaign", "utmContent"];

// Event metadata for server-side waitlist events: the four submitted UTM
// dimensions (cleaned by the route's own cleaner) plus any route metadata.
// Route metadata wins on a key clash. Nothing else from the body is copied,
// so the email address can never reach analytics through this path.
export function waitlistEventMetadata(body, metadata, clean) {
  const combined = {};
  for (const key of UTM_KEYS) {
    const value = clean(body?.[key]);
    if (value) combined[key] = value;
  }
  Object.assign(combined, metadata || {});
  return Object.keys(combined).length ? combined : undefined;
}
