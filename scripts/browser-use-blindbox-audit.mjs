#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const POLICY_PATH = path.join(ROOT, "agents", "blindbox-agent-memory.json");
const RUNTIME_DIR = path.join(ROOT, "output", "browser-use");
const RUNTIME_PATH = path.join(RUNTIME_DIR, "agent-memory.json");
const LATEST_PATH = path.join(RUNTIME_DIR, "latest.json");
const API_BASE = "https://api.browser-use.com/api/v4";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function maxRoutesFromPolicy(policy) {
  const raw = Number(policy?.auditScope?.maxDiscoveredRoutes ?? 12);
  if (!Number.isInteger(raw) || raw < 1 || raw > 25) {
    throw new Error("auditScope.maxDiscoveredRoutes must be an integer from 1 to 25.");
  }
  return raw;
}

export function timeoutFromEnv(env = process.env) {
  const raw = env.BROWSER_USE_TIMEOUT_MS ?? "180000";
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 30000 || value > 300000) {
    throw new Error("BROWSER_USE_TIMEOUT_MS must be an integer from 30000 to 300000.");
  }
  return value;
}

export function paidRunAllowed(env = process.env) {
  return env.BROWSER_USE_ALLOW_PAID_RUN === "true";
}

function cleanText(value, max = 500) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return fallback;
    throw error;
  }
}

async function atomicWriteJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.tmp-${process.pid}`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await fs.rename(temp, filePath);
}

async function apiRequest(apiKey, pathname, { method = "GET", body } = {}) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    method,
    headers: {
      "X-Browser-Use-API-Key": apiKey,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 500) }; }
  if (!response.ok) {
    throw new Error(`Browser Use API ${method} ${pathname} failed with status ${response.status}`);
  }
  return data;
}

async function stopBrowser(apiKey, browserId) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await apiRequest(apiKey, `/browsers/${browserId}`, { method: "PATCH", body: { action: "stop" } });
      return true;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw new Error(`Browser Use browser stop could not be confirmed: ${lastError?.message ?? "unknown error"}`);
}

export function validatePolicy(policy) {
  if (policy?.site !== "https://www.blindboxai.com") throw new Error("Policy must target canonical https://www.blindboxai.com");
  if (policy?.defaultMode !== "read_only") throw new Error("Policy defaultMode must be read_only");
  if (!Array.isArray(policy?.ownerApprovalRequired) || policy.ownerApprovalRequired.length === 0) throw new Error("ownerApprovalRequired cannot be empty");
  if (!Array.isArray(policy?.neverStore) || policy.neverStore.length === 0) throw new Error("neverStore cannot be empty");
  if (!Array.isArray(policy?.auditScope?.routes) || !policy.auditScope.routes.includes("/ask")) throw new Error("Audit routes must include /ask");
  if (!Array.isArray(policy?.auditScope?.checks) || policy.auditScope.checks.length === 0) throw new Error("Audit checks cannot be empty");
  maxRoutesFromPolicy(policy);
  return true;
}

export function inspectAffiliateUrl(raw, policy) {
  let parsed;
  try { parsed = new URL(raw); } catch { return { url: cleanText(raw), valid: false, reason: "malformed-url" }; }
  const allowedHosts = new Set(policy.affiliateChecks.allowedOutboundHosts.map((x) => x.toLowerCase()));
  const required = policy.affiliateChecks.requiredQueryParameters;
  const preferred = policy.affiliateChecks.preferredTrackingParameters;
  const missingRequired = required.filter((key) => !parsed.searchParams.get(key));
  const missingPreferred = preferred.filter((key) => !parsed.searchParams.get(key));
  const allowedHost = parsed.protocol === "https:" && allowedHosts.has(parsed.hostname.toLowerCase());
  return {
    url: parsed.toString(),
    valid: allowedHost && missingRequired.length === 0,
    allowedHost,
    missingRequired,
    missingPreferred,
  };
}

function routeIsDiscoverable(url, policy) {
  const parsed = new URL(url);
  if (parsed.origin !== new URL(policy.site).origin) return false;
  return policy.auditScope.discoverPrefixes.some((prefix) => parsed.pathname.startsWith(prefix));
}

async function auditPage(page, url, policy) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  const status = response?.status() ?? null;
  const title = cleanText(await page.title(), 220);
  const links = await page.locator("a[href]").evaluateAll((nodes) => nodes.map((node) => node.href));
  const sameOrigin = [];
  const affiliates = [];
  for (const href of links) {
    let parsed;
    try { parsed = new URL(href); } catch { continue; }
    if (parsed.origin === new URL(policy.site).origin) sameOrigin.push(parsed.toString());
    if (policy.affiliateChecks.allowedOutboundHosts.includes(parsed.hostname.toLowerCase())) {
      affiliates.push(inspectAffiliateUrl(parsed.toString(), policy));
    }
  }
  return {
    url,
    status,
    ok: status !== null && status >= 200 && status < 400,
    title,
    sameOriginLinks: [...new Set(sameOrigin)],
    affiliateLinks: affiliates,
  };
}

export async function runReadOnlyAudit({ env = process.env } = {}) {
  const policy = await readJson(POLICY_PATH);
  if (!policy) throw new Error(`Missing policy memory: ${POLICY_PATH}`);
  validatePolicy(policy);

  if (!paidRunAllowed(env)) {
    throw new Error("Live Browser Use audit is usage-billed. Set BROWSER_USE_ALLOW_PAID_RUN=true only after explicit owner approval.");
  }
  const apiKey = env.BROWSER_USE_API_KEY;
  if (!apiKey) throw new Error("BROWSER_USE_API_KEY is required. Do not paste it into source or chat.");

  const timeoutMs = timeoutFromEnv(env);
  const deadline = Date.now() + timeoutMs;
  let browserId = null;
  let browser = null;
  let stopError = null;

  try {
    const created = await apiRequest(apiKey, "/browsers", {
      method: "POST",
      body: { proxyCountryCode: "us", enableRecording: false, solveCaptchas: false },
    });
    browserId = created.id;
    if (!browserId || !created.cdpUrl) throw new Error("Browser Use did not return a browser id and CDP URL.");

    browser = await chromium.connectOverCDP(created.cdpUrl);
    const context = browser.contexts()[0] ?? await browser.newContext();
    let blockedWriteRequests = 0;
    await context.route("**/*", async (route) => {
      if (!SAFE_METHODS.has(route.request().method().toUpperCase())) {
        blockedWriteRequests += 1;
        await route.abort("blockedbyclient");
        return;
      }
      await route.continue();
    });

    const page = context.pages()[0] ?? await context.newPage();
    const queue = policy.auditScope.routes.map((route) => new URL(route, policy.site).toString());
    const seen = new Set();
    const pages = [];
    const maxRoutes = maxRoutesFromPolicy(policy);

    while (queue.length && pages.length < maxRoutes) {
      if (Date.now() >= deadline) throw new Error("Read-only browser audit exceeded its timeout.");
      const url = queue.shift();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const result = await auditPage(page, url, policy);
      pages.push(result);
      for (const href of result.sameOriginLinks) {
        if (routeIsDiscoverable(href, policy) && !seen.has(href) && queue.length + pages.length < maxRoutes * 2) queue.push(href);
      }
    }

    const affiliateLinks = pages.flatMap((item) => item.affiliateLinks);
    const report = {
      schemaVersion: 2,
      project: policy.project,
      target: policy.site,
      mode: "enforced-read-only-browser",
      completedAt: new Date().toISOString(),
      browserId,
      pages: pages.map(({ sameOriginLinks, ...item }) => item),
      affiliateLinks,
      blockedWriteRequests,
      summary: {
        pagesVisited: pages.length,
        failedPages: pages.filter((item) => !item.ok).length,
        affiliateLinksCheckedWithoutOpening: affiliateLinks.length,
        invalidAffiliateLinks: affiliateLinks.filter((item) => !item.valid).length,
      },
    };

    await atomicWriteJson(LATEST_PATH, report);
    await atomicWriteJson(RUNTIME_PATH, {
      schemaVersion: 2,
      project: policy.project,
      target: policy.site,
      updatedAt: report.completedAt,
      lastBrowserId: browserId,
      lastStatus: report.summary.failedPages === 0 && report.summary.invalidAffiliateLinks === 0 ? "passed" : "issues-found",
      lastSummary: report.summary,
    });
    return report;
  } finally {
    try { await browser?.close(); } catch {}
    if (browserId) {
      try { await stopBrowser(apiKey, browserId); } catch (error) { stopError = error; }
    }
    if (stopError) throw stopError;
  }
}

async function main() {
  const policy = await readJson(POLICY_PATH);
  if (!policy) throw new Error(`Missing policy memory: ${POLICY_PATH}`);
  validatePolicy(policy);

  if (!process.argv.includes("--run")) {
    console.log("DRY RUN ONLY — no Browser Use browser was created.");
    console.log(`Target: ${policy.site}`);
    console.log(`Mode: ${policy.defaultMode}`);
    console.log(`Routes: ${policy.auditScope.routes.join(", ")}`);
    console.log(`Owner gates: ${policy.ownerApprovalRequired.join(", ")}`);
    console.log(`Never store: ${policy.neverStore.join(", ")}`);
    return;
  }

  const report = await runReadOnlyAudit();
  console.log(`Pages visited: ${report.summary.pagesVisited}`);
  console.log(`Failed pages: ${report.summary.failedPages}`);
  console.log(`Affiliate links checked without opening: ${report.summary.affiliateLinksCheckedWithoutOpening}`);
  console.log(`Invalid affiliate links: ${report.summary.invalidAffiliateLinks}`);
  console.log(`Blocked write requests: ${report.blockedWriteRequests}`);
  if (report.summary.failedPages > 0 || report.summary.invalidAffiliateLinks > 0) process.exitCode = 1;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
