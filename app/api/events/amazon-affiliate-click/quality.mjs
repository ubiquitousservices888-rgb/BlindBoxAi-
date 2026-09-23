import { classifyAffiliateRequest } from "../../../../lib/click-quality.mjs";

export function classifyAmazonBeaconRequest(request, classifier = classifyAffiliateRequest) {
  try {
    const result = classifier(request);
    if (
      !result ||
      typeof result.clientClass !== "string" ||
      typeof result.qualityReason !== "string" ||
      !result.clientClass ||
      !result.qualityReason
    ) {
      throw new Error("Invalid affiliate click classification");
    }
    return result;
  } catch {
    return { clientClass: "unclassified", qualityReason: "classifier_error" };
  }
}
