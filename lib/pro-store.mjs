import { createHmac } from "node:crypto";
import { assertBlindBoxSupabaseOrigin } from "./blindbox-supabase-boundary.mjs";
import { ProError } from "./pro-config.mjs";

export function createProStore({ env = process.env, fetchImpl = fetch } = {}) {
  const origin = assertBlindBoxSupabaseOrigin(env.SUPABASE_URL, { allowTestLoopback: true });
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new ProError("configuration_unavailable");
  async function request(path, { method = "GET", body, prefer } = {}) {
    let response;
    try {
      response = await fetchImpl(`${origin}/rest/v1/${path}`, {
        method, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          const detail = await response.json().catch(() => ({}));
          const rules = { scenario_limit: ["scenario_limit", 409], scenario_conflict: ["scenario_conflict", 409], account_required: ["account_required", 409], checkout_conflict: ["checkout_conflict", 409], customer_conflict: ["checkout_conflict", 409], invalid_checkout: ["checkout_conflict", 409], invalid_customer: ["checkout_conflict", 409] };
          const rule = Object.prototype.hasOwnProperty.call(rules, detail?.message) ? rules[detail.message] : null;
          if (rule) throw new ProError(...rule);
        }
        throw new Error("storage");
      }
      if (response.status === 204) return null;
      return await response.json();
    } catch (error) { if (error instanceof ProError) throw error; throw new ProError("storage_unavailable"); }
  }
  const rpc = (name, body) => request(`rpc/${name}`, { method: "POST", body });
  const filter = value => encodeURIComponent(value);
  return {
    async version() { if (await rpc("pro_schema_version", {}) !== 1) throw new ProError("storage_unavailable"); },
    async account(userId, live) { return (await request(`pro_accounts?user_id=eq.${filter(userId)}&livemode=eq.${live}&limit=1`))?.[0] || null; },
    async customer(customerId, live) { return (await request(`pro_accounts?stripe_customer_id=eq.${filter(customerId)}&livemode=eq.${live}&limit=1`))?.[0] || null; },
    claimCheckout(userId, live) { return rpc("pro_claim_checkout", { p_user_id: userId, p_livemode: live }); },
    bindCustomer(userId, live, customerId) { return rpc("pro_bind_customer", { p_user_id: userId, p_livemode: live, p_customer_id: customerId }); },
    saveCheckout(userId, live, attemptId, session) { return rpc("pro_save_checkout", { p_user_id: userId, p_livemode: live, p_attempt_id: attemptId, p_session_id: session.id, p_expires_at: new Date(session.expires_at * 1000).toISOString() }); },
    subscriptions(userId, live) { return request(`pro_subscriptions?user_id=eq.${filter(userId)}&livemode=eq.${live}&status=not.in.(canceled,incomplete_expired)&limit=9`); },
    applyEvent(event, account, subscription, riskHold = false, clearCheckout = false) {
      return rpc("pro_apply_stripe_event", {
        p_event_id: event.id, p_event_type: event.type, p_event_created: event.created, p_livemode: event.livemode,
        p_user_id: account.user_id, p_customer_id: account.stripe_customer_id,
        p_subscription: subscription || null, p_risk_hold: riskHold, p_clear_checkout: clearCheckout,
      });
    },
    scenarios(userId) { return request(`pro_scenarios?user_id=eq.${filter(userId)}&order=created_at.desc&limit=250`); },
    saveScenario(userId, scenario) { return rpc("pro_save_scenario", { p_user_id: userId, p_id: scenario.id, p_name: scenario.name, p_inputs: scenario.inputs, p_quantity: scenario.quantity }); },
    deleteScenario(userId, id) { return request(`pro_scenarios?user_id=eq.${filter(userId)}&id=eq.${filter(id)}`, { method: "DELETE" }); },
    async rateLimit(principal, action, limit = 12, seconds = 60) {
      const digest = createHmac("sha256", key).update(`${action}:${principal}`).digest("hex");
      if (await rpc("pro_take_rate_limit", { p_key: digest, p_limit: limit, p_seconds: seconds }) !== true) throw new ProError("try_again_later", 429);
    },
  };
}
