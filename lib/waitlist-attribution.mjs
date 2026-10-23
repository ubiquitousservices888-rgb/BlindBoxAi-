// The public waitlist request cannot designate itself as an owner-only test.
// Keep existing trusted historical owner_test events excluded in reporting,
// but never allow a browser to suppress a newly stored signup via that label.
export function safeWaitlistAttributionSource(cleanedSource) {
  return cleanedSource === "owner_test" ? "direct" : cleanedSource || "direct";
}
