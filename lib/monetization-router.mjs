import { getAmazonAccessoryOffer } from "./amazon-associates.mjs";
import { classifyProduct, productClassifierText } from "./product-classifier.mjs";

const ACCESSORY_OFFER_MAP = Object.freeze([
  { terms: ["display case", "protective case", "dust", "dustproof", "acrylic"], offerId: "acrylic-display-case" },
  { terms: ["stand", "riser"], offerId: "acrylic-display-risers" },
  { terms: ["lighting", "light", "led"], offerId: "mini-display-lighting" },
  { terms: ["storage", "organizer", "cleaning"], offerId: "figure-storage-organizer" },
  { terms: ["turntable", "rotator", "rotate"], offerId: "display-turntable" },
]);

function hasToken(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(text);
}

export function resolveAccessoryOfferId(product) {
  const text = productClassifierText(product);
  for (const entry of ACCESSORY_OFFER_MAP) {
    if (entry.terms.some((term) => hasToken(text, term))) {
      if (!getAmazonAccessoryOffer(entry.offerId)) {
        throw new Error(`Amazon accessory allowlist does not contain ${entry.offerId}`);
      }
      return entry.offerId;
    }
  }
  return "";
}

export function routeProductToAffiliate(product) {
  const classification = classifyProduct(product);

  if (classification.type === "figure") {
    return { path: "ebay", reason: classification.reason };
  }

  if (classification.type === "accessory") {
    const offerId = resolveAccessoryOfferId(product);
    if (!offerId) {
      throw new Error("Accessory product could not be matched to an approved Amazon accessory offer");
    }
    return { path: "amazon", reason: `${classification.reason} -> allowlist offer: ${offerId}` };
  }

  return { path: "none", reason: classification.reason };
}
