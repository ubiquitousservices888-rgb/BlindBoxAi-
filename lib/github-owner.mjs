import { NextResponse } from "next/server";

export const OWNER_REPOSITORY = "ubiquitousservices888-rgb/BlindBoxAi-";
export const OWNER_LOGIN = "ubiquitousservices888-rgb";
export const OWNER_PRIVATE_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization",
});

export function ownerUnauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: OWNER_PRIVATE_HEADERS });
}

export function githubOwnerHeaders(token, { contentType = false } = {}) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    ...(contentType ? { "Content-Type": "application/json" } : {}),
    "User-Agent": "BlindBoxAI-owner-control/1.0",
  };
}
