import { timingSafeEqual } from "node:crypto";

export function assertOwnerDashboardCode(value) {
  const expected = String(process.env.OWNER_DASHBOARD_CODE ?? "");
  const supplied = String(value ?? "");

  if (!expected) {
    throw new Error("Owner dashboard access is not configured.");
  }

  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);

  if (
    expectedBuffer.length !== suppliedBuffer.length ||
    !timingSafeEqual(expectedBuffer, suppliedBuffer)
  ) {
    throw new Error("Invalid owner dashboard access code.");
  }

  return true;
}
