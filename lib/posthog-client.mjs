const CONSENT_STORAGE_KEY = "blindboxai_consent_v2";

const EVENT_FIELDS = Object.freeze({
  "$pageview": ["path", "source", "campaign", "utmSource", "utmMedium", "utmCampaign", "utmContent"],
  landing_session_source: ["path", "source", "campaign", "utmSource", "utmMedium", "utmCampaign", "utmContent"],
  commerce_intent_click: ["destination", "path", "vertical", "source", "campaign", "utmSource", "utmMedium", "utmCampaign", "utmContent"],
  agent_question_started: ["mode", "path", "source", "campaign", "utmSource", "utmMedium", "utmCampaign", "utmContent"],
  agent_question: [
    "mode",
    "source",
    "campaign",
    "utmSource",
    "utmMedium",
    "utmCampaign",
    "utmContent",
    "result_count",
    "verified_match_count",
    "fresh_match_count",
    "dated_match_count",
    "unknown_freshness_count",
    "completed_sale_count",
  ],
  agent_question_failed: ["mode", "failure_type", "source", "campaign", "utmSource", "utmMedium", "utmCampaign", "utmContent"],
  audience_value_research: ["has_raw", "has_graded", "source", "campaign", "utmSource", "utmMedium", "utmCampaign", "utmContent"],
  waitlist_signup: ["path", "source", "campaign", "utmSource", "utmMedium", "utmCampaign", "utmContent"],
});

const SAFE_LABEL = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const PATH_ONLY_EVENTS = new Set(["$pageview", "landing_session_source", "commerce_intent_click", "agent_question_started"]);
const URL_PROPERTIES = ["$current_url", "$initial_current_url"];
const REFERRER_PROPERTIES = ["$referrer", "$initial_referrer"];
const UNSAFE_UTM_PROPERTIES = [
  "$utm_term", "utm_term",
  "$initial_utm_source", "$initial_utm_medium", "$initial_utm_campaign", "$initial_utm_content", "$initial_utm_term",
  "$entry_utm_source", "$entry_utm_medium", "$entry_utm_campaign", "$entry_utm_content", "$entry_utm_term",
  "initial_utm_source", "initial_utm_medium", "initial_utm_campaign", "initial_utm_content", "initial_utm_term",
  "entry_utm_source", "entry_utm_medium", "entry_utm_campaign", "entry_utm_content", "entry_utm_term",
];

let runtimeConsent = null;
let posthogPromise = null;
let posthogInstance = null;

function storedConsent() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw)?.analytics === true;
  } catch {
    return null;
  }
}

export function isAnalyticsConsentGranted() {
  if (runtimeConsent !== null) return runtimeConsent;
  const stored = storedConsent();
  return stored === true;
}

function projectConfig() {
  const token = String(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN || "").trim();
  const host = String(process.env.NEXT_PUBLIC_POSTHOG_HOST || "").trim().replace(/\/$/, "");
  if (!token || !["https://us.i.posthog.com", "https://eu.i.posthog.com"].includes(host)) return null;
  return { token, host };
}

function safePath(value) {
  try {
    const parsed = new URL(String(value || "/"), window.location.origin);
    return parsed.pathname.slice(0, 160) || "/";
  } catch {
    return "/";
  }
}

function safeLabel(value) {
  const candidate = String(value ?? "").trim().toLowerCase();
  return SAFE_LABEL.test(candidate) ? candidate : "";
}

function safeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100000, Math.floor(number))) : 0;
}

function currentAttribution() {
  const empty = { source: "direct", campaign: "" };
  if (typeof window === "undefined") return empty;
  try {
    const sourceCandidate = safeLabel(sessionStorage.getItem("bbai_campaign_source")) ||
      safeLabel(sessionStorage.getItem("bbai_landing_source_v1"));
    const source = sourceCandidate && sourceCandidate !== "none" ? sourceCandidate : "direct";
    const campaign = safeLabel(sessionStorage.getItem("bbai_campaign")) ||
      safeLabel(sessionStorage.getItem("bbai_utm_campaign"));
    const utmSource = safeLabel(sessionStorage.getItem("bbai_utm_source"));
    const utmMedium = safeLabel(sessionStorage.getItem("bbai_utm_medium"));
    const utmCampaign = safeLabel(sessionStorage.getItem("bbai_utm_campaign"));
    const utmContent = safeLabel(sessionStorage.getItem("bbai_utm_content"));
    return {
      source,
      campaign,
      ...(utmSource ? { utmSource } : {}),
      ...(utmMedium ? { utmMedium } : {}),
      ...(utmCampaign ? { utmCampaign } : {}),
      ...(utmContent ? { utmContent } : {}),
    };
  } catch {
    return empty;
  }
}

function safeReferrerOrigin(value) {
  try {
    const parsed = new URL(String(value));
    return parsed.origin;
  } catch {
    return "";
  }
}

function sanitizeBeforeSend(event) {
  if (!event || !event.properties) return event;
  const properties = { ...event.properties };
  for (const key of URL_PROPERTIES) {
    if (properties[key]) properties[key] = `${window.location.origin}${safePath(properties[key])}`;
  }
  for (const key of REFERRER_PROPERTIES) {
    if (properties[key]) {
      const origin = safeReferrerOrigin(properties[key]);
      if (origin) properties[key] = origin;
      else delete properties[key];
    }
  }
  for (const key of UNSAFE_UTM_PROPERTIES) delete properties[key];
  for (const [name, key] of [
    ["source", "$utm_source"],
    ["medium", "$utm_medium"],
    ["campaign", "$utm_campaign"],
    ["content", "$utm_content"],
  ]) {
    const label = safeLabel(properties[key] ?? properties[`utm_${name}`]);
    delete properties[`utm_${name}`];
    if (label) properties[key] = label;
    else delete properties[key];
  }
  delete properties.$search_keyword;
  delete properties.$search_terms;

  const sanitized = { ...event, properties };
  for (const collection of ["$set", "$set_once"]) {
    if (!sanitized[collection]) continue;
    const clean = { ...sanitized[collection] };
    for (const key of Object.keys(clean)) {
      if (
        URL_PROPERTIES.includes(key) ||
        REFERRER_PROPERTIES.includes(key) ||
        UNSAFE_UTM_PROPERTIES.includes(key) ||
        /^\$?utm_(source|medium|campaign|content|term)$/.test(key)
      ) delete clean[key];
    }
    delete clean.$search_keyword;
    delete clean.$search_terms;
    sanitized[collection] = clean;
  }
  return sanitized;
}

async function enabledClient() {
  if (typeof window === "undefined" || !isAnalyticsConsentGranted()) return null;
  const config = projectConfig();
  if (!config) return null;

  if (!posthogPromise) {
    posthogPromise = import("posthog-js").then(({ default: posthog }) => {
      return posthog;
    }).catch(() => null);
  }

  const posthog = await posthogPromise;
  if (!posthog || !isAnalyticsConsentGranted()) return null;
  posthogInstance = posthog;
  if (!posthog.__loaded) {
    posthog.init(config.token, {
      api_host: config.host,
      defaults: "2026-08-30",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_performance: false,
      capture_dead_clicks: false,
      capture_exceptions: false,
      capture_console_errors: false,
      rageclick: false,
      disable_session_recording: true,
      disable_surveys: true,
      person_profiles: "never",
      opt_out_capturing_by_default: true,
      opt_out_capturing_persistence_type: "localStorage",
      before_send: sanitizeBeforeSend,
    });
  }
  if (!isAnalyticsConsentGranted()) return null;
  posthog.opt_in_capturing({ captureEventName: false });
  return posthog;
}

export async function setPostHogConsent(analytics) {
  runtimeConsent = analytics === true;
  if (runtimeConsent) {
    try {
      await enabledClient();
    } catch {
      // Analytics availability never blocks the site or the visitor's choice.
    }
    return;
  }
  if (posthogInstance?.__loaded) {
    try {
      posthogInstance.opt_out_capturing();
      posthogInstance.reset();
    } catch {
      // Consent checks still fail closed in every capture call.
    }
  }
}

function sanitizeProperties(eventName, properties = {}) {
  const fields = EVENT_FIELDS[eventName];
  if (!fields) return null;
  const result = {};
  for (const key of fields) {
    const value = properties?.[key];
    if (value === undefined || value === null) continue;
    if (key === "path") {
      result.path = safePath(value);
    } else if (key === "utmSource") {
      const label = safeLabel(value);
      if (label) result.$utm_source = label;
    } else if (key === "utmMedium") {
      const label = safeLabel(value);
      if (label) result.$utm_medium = label;
    } else if (key === "utmCampaign") {
      const label = safeLabel(value);
      if (label) result.$utm_campaign = label;
    } else if (key === "utmContent") {
      const label = safeLabel(value);
      if (label) result.$utm_content = label;
    } else if (["has_raw", "has_graded"].includes(key)) {
      result[key] = value === true;
    } else if (["result_count", "verified_match_count", "fresh_match_count", "dated_match_count", "unknown_freshness_count", "completed_sale_count"].includes(key)) {
      result[key] = safeInteger(value);
    } else if (["destination", "vertical", "source", "campaign"].includes(key)) {
      const label = safeLabel(value);
      if (label) result[key] = label;
    } else if (key === "mode") {
      if (value === "deterministic") result.mode = value;
    } else if (key === "failure_type") {
      if (["service_unavailable", "request_rejected", "network_error"].includes(value)) result.failure_type = value;
    }
  }

  if (eventName === "$pageview") {
    const path = result.path || safePath(window.location.pathname);
    result.$pathname = path;
    result.$current_url = `${window.location.origin}${path}`;
  } else if (PATH_ONLY_EVENTS.has(eventName) && !result.path) {
    result.path = safePath(window.location.pathname);
  }
  return result;
}

export async function capturePostHogEvent(eventName, properties = {}) {
  if (!isAnalyticsConsentGranted()) return false;
  const attributedProperties = { ...currentAttribution(), ...properties };
  const safeProperties = sanitizeProperties(eventName, attributedProperties);
  if (!safeProperties) return false;
  try {
    const posthog = await enabledClient();
    if (!posthog || !isAnalyticsConsentGranted()) return false;
    posthog.capture(eventName, safeProperties);
    return true;
  } catch {
    return false;
  }
}

export async function capturePostHogPageView(path, attribution = {}) {
  return capturePostHogEvent("$pageview", { ...attribution, path });
}
