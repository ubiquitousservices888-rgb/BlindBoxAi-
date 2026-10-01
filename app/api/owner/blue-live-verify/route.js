import { del, get, put } from "@vercel/blob";
import { NextResponse } from "next/server";

import { assertOwnerCode } from "../../../../lib/evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPOSITORY = "ubiquitousservices888-rgb/BlindBoxAi-";
const OWNER_LOGIN = "ubiquitousservices888-rgb";
const WORKFLOW = "owner-blue-live-verify-once.yml";
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization",
};

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE_HEADERS });
}

function githubHeaders(token, contentType = false) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    ...(contentType ? { "Content-Type": "application/json" } : {}),
    "User-Agent": "BlindBoxAI-owner-control/1.0",
  };
}

async function tokenOwner(token) {
  const response = await fetch("https://api.github.com/user", {
    headers: githubHeaders(token),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`github_user_${response.status}`);
  return String(data?.login || "");
}

async function lockExists(pathname) {
  try {
    const result = await get(pathname, { access: "private", useCache: false });
    return result?.statusCode === 200;
  } catch {
    return false;
  }
}

export async function POST(request) {
  const auth = request.headers.get("authorization") || "";
  const ownerCode = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  try {
    assertOwnerCode(ownerCode);
  } catch {
    return unauthorized();
  }

  if (process.env.VERCEL_ENV !== "production" || process.env.VERCEL_GIT_COMMIT_REF !== "main") {
    return NextResponse.json(
      { error: "Blue Live Verify may only be dispatched from production main." },
      { status: 409, headers: PRIVATE_HEADERS },
    );
  }

  const revision = String(process.env.VERCEL_GIT_COMMIT_SHA || "");
  if (!/^[0-9a-f]{40}$/.test(revision)) {
    return NextResponse.json({ error: "Production revision is unavailable." }, { status: 503, headers: PRIVATE_HEADERS });
  }

  const token = String(process.env.GITHUB_OWNER_APPROVAL_TOKEN || "").trim();
  if (!token) {
    return NextResponse.json(
      { error: "GitHub owner-control token is not configured." },
      { status: 503, headers: PRIVATE_HEADERS },
    );
  }

  let ownerLogin;
  try {
    ownerLogin = await tokenOwner(token);
  } catch (error) {
    console.error("owner_blue_token_check_failed", { message: error instanceof Error ? error.message : "Unknown GitHub token error" });
    return NextResponse.json({ error: "Unable to verify the GitHub owner token." }, { status: 502, headers: PRIVATE_HEADERS });
  }
  if (ownerLogin !== OWNER_LOGIN) {
    return NextResponse.json({ error: "GitHub owner-control token is not bound to the repository owner." }, { status: 403, headers: PRIVATE_HEADERS });
  }

  const lockPath = `owner/blue-live-verify-lock/${revision}.json`;
  let lockAcquired = false;
  try {
    await put(lockPath, JSON.stringify({
      revision,
      owner: OWNER_LOGIN,
      createdAt: new Date().toISOString(),
      purpose: "owner-blue-live-verify",
    }), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: 60,
    });
    lockAcquired = true;
  } catch (error) {
    if (await lockExists(lockPath)) {
      return NextResponse.json(
        { error: "Blue Live Verify is already requested for this production revision.", revision },
        { status: 409, headers: PRIVATE_HEADERS },
      );
    }
    console.error("owner_blue_lock_failed", { message: error instanceof Error ? error.message : "Unknown lock error" });
    return NextResponse.json({ error: "Unable to acquire the Blue Live Verify one-shot lock." }, { status: 502, headers: PRIVATE_HEADERS });
  }

  try {
    const dispatchUrl = `https://api.github.com/repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/dispatches`;
    const response = await fetch(dispatchUrl, {
      method: "POST",
      headers: githubHeaders(token, true),
      body: JSON.stringify({ ref: "main" }),
      cache: "no-store",
    });

    if (response.status !== 204) {
      await del(lockPath).catch(() => {});
      lockAcquired = false;
      const body = await response.text().catch(() => "");
      console.error("owner_blue_dispatch_failed", { status: response.status, bodyLength: body.length });
      return NextResponse.json(
        { error: "GitHub rejected the Blue Live Verify dispatch.", status: response.status },
        { status: 502, headers: PRIVATE_HEADERS },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        dispatched: true,
        workflow: WORKFLOW,
        repository: REPOSITORY,
        revision,
        message: "BLUE LIVE VERIFY DISPATCHED",
        published: false,
      },
      { status: 202, headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    if (lockAcquired) await del(lockPath).catch(() => {});
    console.error("owner_blue_dispatch_failed", { message: error instanceof Error ? error.message : "Unknown dispatch error" });
    return NextResponse.json({ error: "Unable to dispatch Blue Live Verify." }, { status: 502, headers: PRIVATE_HEADERS });
  }
}
