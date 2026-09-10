import { getAmazonAccessoryOffer } from "./amazon-associates.mjs";
import { ACCESSORY_OFFER_MAP, classifyProduct, hasProductToken, productClassifierText } from "./product-classifier.mjs";


export function resolveAccessoryOfferId(product) {
  const text = productClassifierText(product);
  for (const entry of ACCESSORY_OFFER_MAP) {
    if (entry.terms.some((term) => hasProductToken(text, term))) {
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
