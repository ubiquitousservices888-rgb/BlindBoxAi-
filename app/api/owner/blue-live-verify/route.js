import { del, get, put } from "@vercel/blob";
import { NextResponse } from "next/server";

import { assertOwnerCode } from "../../../../lib/evidence";
import {
  githubOwnerHeaders,
  OWNER_LOGIN,
  OWNER_PRIVATE_HEADERS,
  OWNER_REPOSITORY,
  ownerUnauthorized,
} from "../../../../lib/github-owner.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKFLOW = "owner-blue-live-verify-once.yml";
const LOCK_TTL_MS = 15 * 60 * 1000;

async function tokenOwner(token) {
  const response = await fetch("https://api.github.com/user", {
    headers: githubOwnerHeaders(token),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`github_user_${response.status}`);
  return String(data?.login || "");
}

async function readLock(pathname) {
  try {
    const result = await get(pathname, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return null;
    const body = await new Response(result.stream).json();
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}

function lockIsFresh(lock) {
  const createdAt = Date.parse(String(lock?.createdAt || ""));
  return Number.isFinite(createdAt) && Date.now() - createdAt < LOCK_TTL_MS;
}

async function writeLock(pathname, revision) {
  await put(pathname, JSON.stringify({
    revision,
    owner: OWNER_LOGIN,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + LOCK_TTL_MS).toISOString(),
    purpose: "owner-blue-live-verify",
  }), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: false,
    cacheControlMaxAge: 60,
  });
}

async function cleanupLock(pathname) {
  try {
    await del(pathname);
    return true;
  } catch (error) {
    console.error("owner_blue_lock_cleanup_failed", { message: error instanceof Error ? error.message : "Unknown lock cleanup error" });
    return false;
  }
}

async function acquireLock(pathname, revision) {
  try {
    await writeLock(pathname, revision);
    return { acquired: true, cleanupFailed: false };
  } catch (error) {
    const existing = await readLock(pathname);
    if (!existing) throw error;
    if (lockIsFresh(existing)) return { acquired: false, cleanupFailed: false };

    const cleaned = await cleanupLock(pathname);
    if (!cleaned) return { acquired: false, cleanupFailed: true };

    try {
      await writeLock(pathname, revision);
      return { acquired: true, cleanupFailed: false };
    } catch (retryError) {
      const raced = await readLock(pathname);
      if (raced && lockIsFresh(raced)) return { acquired: false, cleanupFailed: false };
      throw retryError;
    }
  }
}

function cleanupPendingResponse(revision) {
  return NextResponse.json(
    {
      error: "Blue Live Verify could not clear its dispatch lock. Retry after the lock lease expires.",
      revision,
      lockCleanupPending: true,
      retryAfterSeconds: LOCK_TTL_MS / 1000,
    },
    { status: 503, headers: OWNER_PRIVATE_HEADERS },
  );
}

export async function POST(request) {
  const auth = request.headers.get("authorization") || "";
  const ownerCode = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  try {
    assertOwnerCode(ownerCode);
  } catch {
    return ownerUnauthorized();
  }

  if (process.env.VERCEL_ENV !== "production" || process.env.VERCEL_GIT_COMMIT_REF !== "main") {
    return NextResponse.json(
      { error: "Blue Live Verify may only be dispatched from production main." },
      { status: 409, headers: OWNER_PRIVATE_HEADERS },
    );
  }

  const revision = String(process.env.VERCEL_GIT_COMMIT_SHA || "");
  if (!/^[0-9a-f]{40}$/.test(revision)) {
    return NextResponse.json({ error: "Production revision is unavailable." }, { status: 503, headers: OWNER_PRIVATE_HEADERS });
  }

  const token = String(process.env.GITHUB_OWNER_APPROVAL_TOKEN || "").trim();
  if (!token) {
    return NextResponse.json(
      { error: "GitHub owner-control token is not configured." },
      { status: 503, headers: OWNER_PRIVATE_HEADERS },
    );
  }

  let ownerLogin;
  try {
    ownerLogin = await tokenOwner(token);
  } catch (error) {
    console.error("owner_blue_token_check_failed", { message: error instanceof Error ? error.message : "Unknown GitHub token error" });
    return NextResponse.json({ error: "Unable to verify the GitHub owner token." }, { status: 502, headers: OWNER_PRIVATE_HEADERS });
  }
  if (ownerLogin !== OWNER_LOGIN) {
    return NextResponse.json({ error: "GitHub owner-control token is not bound to the repository owner." }, { status: 403, headers: OWNER_PRIVATE_HEADERS });
  }

  const lockPath = `owner/blue-live-verify-lock/${revision}.json`;
  let lockAcquired = false;
  try {
    const lock = await acquireLock(lockPath, revision);
    if (lock.cleanupFailed) return cleanupPendingResponse(revision);
    if (!lock.acquired) {
      return NextResponse.json(
        {
          error: "Blue Live Verify is already requested for this production revision.",
          revision,
          retryAfterSeconds: LOCK_TTL_MS / 1000,
        },
        { status: 409, headers: OWNER_PRIVATE_HEADERS },
      );
    }
    lockAcquired = true;

    const dispatchUrl = `https://api.github.com/repos/${OWNER_REPOSITORY}/actions/workflows/${WORKFLOW}/dispatches`;
    const response = await fetch(dispatchUrl, {
      method: "POST",
      headers: githubOwnerHeaders(token, { contentType: true }),
      body: JSON.stringify({ ref: "main" }),
      cache: "no-store",
    });

    if (response.status !== 204) {
      const cleaned = await cleanupLock(lockPath);
      lockAcquired = false;
      if (!cleaned) return cleanupPendingResponse(revision);
      const body = await response.text().catch(() => "");
      console.error("owner_blue_dispatch_failed", { status: response.status, bodyLength: body.length });
      return NextResponse.json(
        { error: "GitHub rejected the Blue Live Verify dispatch.", status: response.status },
        { status: 502, headers: OWNER_PRIVATE_HEADERS },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        dispatched: true,
        workflow: WORKFLOW,
        repository: OWNER_REPOSITORY,
        revision,
        lockLeaseSeconds: LOCK_TTL_MS / 1000,
        message: "BLUE LIVE VERIFY DISPATCHED",
        published: false,
      },
      { status: 202, headers: OWNER_PRIVATE_HEADERS },
    );
  } catch (error) {
    // A transport exception is indeterminate: GitHub may have accepted the dispatch
    // before the response was lost. Retain the lease so a retry cannot enqueue a
    // duplicate verifier. The bounded lease provides the safe recovery path.
    if (lockAcquired) {
      console.error("owner_blue_dispatch_lock_retained", { revision });
    }
    console.error("owner_blue_dispatch_failed", { message: error instanceof Error ? error.message : "Unknown dispatch error" });
    return NextResponse.json(
      {
        error: "Unable to confirm Blue Live Verify dispatch. The one-shot lease is retained to prevent duplicates.",
        revision,
        dispatchOutcome: "indeterminate",
        retryAfterSeconds: LOCK_TTL_MS / 1000,
      },
      { status: 502, headers: OWNER_PRIVATE_HEADERS },
    );
  }
}
