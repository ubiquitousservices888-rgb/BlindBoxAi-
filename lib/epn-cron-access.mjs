import crypto from "node:crypto";

// Single pure permission decision used by the deployed handler and unit tests.
// No environment secrets or headers are ever logged here.
export function epnCronAccessDecision({ authorization = "", secret = "", enabled = "" } = {}) {
  const password = String(secret || "");
  const expected = Buffer.from(`Bearer ${password}`, "utf8");
  const got = Buffer.from(String(authorization || ""), "utf8");
  if (password.length < 16 || got.length !== expected.length ||
      !crypto.timingSafeEqual(got, expected)) return "unauthorized";
  return enabled === "true" ? "allowed" : "disabled";
}
