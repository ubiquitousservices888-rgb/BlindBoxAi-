import { getAmazonAccessoryOffer } from "./amazon-associates.mjs";
import { classifyProduct } from "./product-classifier.mjs";

const ACCESSORY_OFFER_MAP = Object.freeze([
  { terms: ["display case", "protective case", "dust", "dustproof", "acrylic"], offerId: "acrylic-display-case" },
  { terms: ["stand", "riser"], offerId: "acrylic-display-risers" },
  { terms: ["lighting", "light", "led"], offerId: "mini-display-lighting" },
  { terms: ["storage", "organizer", "cleaning"], offerId: "figure-storage-organizer" },
  { terms: ["turntable", "rotator", "rotate"], offerId: "display-turntable" },
]);

function productText(product = {}) {
  return [product.id, product.name, product.brand, product.category, product.type, product.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function resolveAccessoryOfferId(product) {
  const text = productText(product);
  for (const entry of ACCESSORY_OFFER_MAP) {
    if (entry.terms.some((term) => text.includes(term))) {
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
