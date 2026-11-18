"use client";

import { useEffect, useState, useRef } from "react";
import { calculateResaleMargin } from "../../../lib/resale-unit-economics.mjs";

const fields = [["purchase", "Purchase price"], ["inboundShipping", "Inbound shipping"], ["salesTax", "Purchase tax"], ["salePrice", "Expected resale price"], ["feePercent", "Selling fees (%)"], ["outboundShipping", "Outbound shipping"], ["desiredProfit", "Target profit"]];
const blank = () => Object.fromEntries(fields.map(([key]) => [key, "0"]));
const money = value => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const messages = {
  invalid_credentials: "Sign-in failed. Check your email, password, and account confirmation.",
  invalid_password: "Use a password between 12 and 128 characters.",
  invalid_email: "Enter a valid email address.",
  try_again_later: "Too many attempts. Please wait before trying again.",
  manage_existing_subscription: "A subscription or payment already exists. Use Manage billing to review it.",
  payment_confirmation_pending: "Payment confirmation is pending. Refresh access shortly.",
  billing_review_required: "Billing needs review. You can still manage or cancel your subscription.",
  checkout_conflict: "An earlier checkout needs confirmation. Please use Manage billing or try again later.",
  invalid_scenario: "Check the scenario name, quantity, costs, and fee percentage.",
  scenario_limit: "You have 250 saved scenarios. Edit or delete an existing scenario before adding another.",
  scenario_conflict: "That scenario could not be changed. Refresh your saved scenarios and retry.",
};
const inputStyle = { padding: "10px", border: "1px solid var(--line)", borderRadius: "6px", background: "transparent", color: "inherit", width: "100%", boxSizing: "border-box", fontSize: "16px" };

export default function ProAccount() {
  const [access, setAccess] = useState(null), [unavailable, setUnavailable] = useState(false);
  const [mode, setMode] = useState("login"), [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [rows, setRows] = useState([]), [editing, setEditing] = useState(null);
  const draftId = useRef(null);
  const [name, setName] = useState(""), [quantity, setQuantity] = useState("1"), [inputs, setInputs] = useState(blank);
  const result = calculateResaleMargin(inputs);

  async function api(path, method = "GET", body) {
    const response = await fetch(path, { method, cache: "no-store", redirect: "error", headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(messages[data.error] || "The service is temporarily unavailable. Please try again later."), { status: response.status });
    return data;
  }
  async function refresh() {
    let state;
    try {
      state = await api("/api/pro/access");
    } catch (error) {
      setAccess(error.status === 401 ? { signedIn: false } : null);
      setUnavailable(error.status !== 401); setRows([]);
      return;
    }
    setAccess(state); setUnavailable(false);
    if (!state.allowed) { setRows([]); return; }
    try { setRows((await api("/api/pro/scenarios")).scenarios); }
    catch (error) {
      setRows([]);
      if (error.status === 401) setAccess({ signedIn: false });
      else if (error.status === 402) {
        try { const current = await api("/api/pro/access"); setAccess(current.allowed ? { ...current, allowed: false, reason: "access_confirmation_pending" } : current); }
        catch (error) {
          setAccess(error.status === 401 ? { signedIn: false } : null);
          setUnavailable(error.status !== 401);
        }
      } else setNotice(error.message);
    }
  }
  useEffect(() => {
    const marker = new URLSearchParams(window.location.search).get("auth");
    if (marker === "confirmation_failed") setNotice("This confirmation or recovery link is invalid or expired. Sign in, or request a new recovery email.");
    if (marker === "service_unavailable") setNotice("Account confirmation is temporarily unavailable. Please retry later.");
    if (marker === "retry_later") setNotice(messages.try_again_later);
    refresh();
  }, []);
  async function perform(action) {
    if (busy) return;
    setBusy(true); setNotice("");
    try { await action(); } catch (error) { setNotice(error.message || "Please try again later."); }
    finally { setBusy(false); }
  }
  async function authenticate(event) {
    event.preventDefault();
    await perform(async () => {
      const data = await api("/api/pro/auth", "POST", { action: mode, email, ...(mode === "recover" ? {} : { password }) });
      setPassword(""); setNotice(data.message || "Signed in.");
      if (mode === "login") await refresh();
    });
  }
  const billing = path => perform(async () => { window.location.assign((await api(path, "POST", {})).url); });
  function clearEditor() { draftId.current = null; setEditing(null); setName(""); setQuantity("1"); setInputs(blank()); }
  async function save(event) {
    event.preventDefault();
    await perform(async () => {
      const id = editing || (draftId.current ||= crypto.randomUUID());
      await api("/api/pro/scenarios", "POST", { id, name, quantity: Number(quantity), inputs: Object.fromEntries(fields.map(([key]) => [key, inputs[key] === "" ? null : Number(inputs[key])])) });
      clearEditor(); await refresh(); setNotice("Scenario saved.");
    });
  }
  const exportCsv = () => perform(async () => {
    const response = await fetch("/api/pro/scenarios/export", { cache: "no-store", redirect: "error" });
    if (!response.ok) throw new Error("Export unavailable. Refresh subscription access and retry.");
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "blindboxai-pro-scenarios.csv"; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  return <>
    <div role="status" aria-live="polite">{notice}</div>
    {unavailable ? <section className="plan"><h2>Pro services are being verified</h2><p>Account and subscription services are temporarily unavailable. The <a href="/pro">free calculator and waitlist</a> remain available.</p><button className="cta" disabled={busy} onClick={() => perform(refresh)}>Retry account check</button></section> : null}
    {!access && !unavailable ? <p role="status">Checking your account…</p> : null}
    {access?.signedIn === false ? <section className="plan" style={{ maxWidth: "520px" }}>
      <h2>{mode === "signup" ? "Create your account" : mode === "recover" ? "Recover your account" : "Sign in"}</h2>
      <form onSubmit={authenticate} style={{ display: "grid", gap: "12px" }}>
        <label>Email<input style={inputStyle} type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
        {mode !== "recover" ? <label>Password<input style={inputStyle} type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={12} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} /></label> : null}
        <button className="cta" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "recover" ? "Send recovery email" : "Sign in"}</button>
      </form>
      <p className="fine">Creating an account is free and does not start a subscription. Confirm your email before signing in. Open confirmation and recovery links in this same browser.</p>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>{["login", "signup", "recover"].filter(item => item !== mode).map(item => <button key={item} disabled={busy} onClick={() => { setMode(item); setPassword(""); setNotice(""); }}>{item === "login" ? "Sign in instead" : item === "signup" ? "Create a free account" : "Forgot password?"}</button>)}</div>
      <p className="fine">See our <a href="/cookies">privacy notice</a>.</p>
    </section> : null}
    {access?.signedIn ? <>
      <section className="plan">
        <h2>{access.allowed ? "Pro access verified" : "Your subscription"}</h2>
        {access.allowed ? <p>Access paid through {new Date(access.paidThrough).toLocaleDateString()}.{access.cancelAtPeriodEnd ? " Your subscription ends at the close of this paid period." : " Renews monthly unless canceled."}</p> : <p>{access.reason === "billing_review_required" ? messages.billing_review_required : "Access opens after Stripe confirms a paid subscription. Returning from checkout alone does not activate access."}</p>}
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          {!access.allowed && access.checkoutAvailable && access.reason === "subscription_required" ? <button className="cta" disabled={busy} onClick={() => billing("/api/pro/checkout")}>{access.billingAvailable ? "Start or resume checkout" : "Subscribe for $9.99/month"}</button> : null}
          {access.billingAvailable ? <button className="cta" disabled={busy} onClick={() => billing("/api/pro/portal")}>Manage billing / cancel</button> : null}
          <button disabled={busy} onClick={() => perform(refresh)}>Refresh access</button>
          <button disabled={busy} onClick={() => perform(async () => { await api("/api/pro/auth", "DELETE"); setPassword(""); clearEditor(); await refresh(); })}>Sign out</button>
        </div>
        {access.reason === "billing_unavailable" ? <p>Billing verification is temporarily unavailable. Retry the account check before making another payment attempt.</p> : !access.checkoutAvailable && !access.allowed && access.reason === "subscription_required" ? <p>New subscriptions are not open yet. Your free account does not incur charges.</p> : null}
        <p className="fine">Pro is $9.99 USD per month. Review the total, including any applicable tax, on Stripe before paying. Cancel in Manage billing to stop renewal; access continues through the paid period. Refunds and payment reviews may suspend access.</p>
      </section>
      {access.allowed ? <section className="plan" style={{ marginTop: "24px" }}>
        <h2>Saved resale scenarios</h2>
        <p>Save up to 250 scenarios. Enter costs per item; quantity scales the estimated total. Automated price alerts and market valuations are not included.</p>
        <form onSubmit={save} style={{ display: "grid", gap: "12px" }}>
          <label>Scenario name<input style={inputStyle} required maxLength={120} value={name} onChange={event => setName(event.target.value)} /></label>
          <label>Quantity<input style={inputStyle} type="number" required min="1" max="100000" step="1" value={quantity} onChange={event => setQuantity(event.target.value)} /></label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "12px" }}>{fields.map(([key, label]) => <label key={key}>{label}<input style={inputStyle} type="number" required min="0" max={key === "feePercent" ? "99.99" : "100000000"} step="0.01" value={inputs[key]} onChange={event => setInputs(current => ({ ...current, [key]: event.target.value }))} /></label>)}</div>
          {result.valid ? <p>Estimated profit per item: <strong>{money(result.netProfit)}</strong>. Break-even resale: {money(result.breakEvenSalePrice)}. Maximum buy price for target profit: {result.maxPurchasePrice >= 0 ? money(result.maxPurchasePrice) : "No feasible nonnegative price"}.</p> : <p>{result.reason}</p>}
          <div><button className="cta" disabled={busy}>{editing ? "Update scenario" : "Save scenario"}</button>{editing ? <button type="button" onClick={clearEditor} disabled={busy}>Cancel editing</button> : null}</div>
        </form>
        <button disabled={busy || !rows.length} style={{ marginTop: "20px" }} onClick={exportCsv}>Export CSV</button>
        <p className="fine">Your figures are private saved assumptions, not marketplace quotations, commissions, realized profit, or guaranteed sales. Returns, chargebacks, income tax, and other costs may reduce results.</p>
        {rows.length ? <ul>{rows.map(row => <li key={row.id} style={{ margin: "14px 0" }}><strong>{row.name}</strong> · {row.quantity} items · estimated total profit {money(calculateResaleMargin(row.inputs).netProfit * row.quantity)}<div style={{ display: "flex", gap: "10px", marginTop: "6px" }}><button disabled={busy} aria-label={`Edit ${row.name}`} onClick={() => { setEditing(row.id); setName(row.name); setQuantity(String(row.quantity)); setInputs(Object.fromEntries(fields.map(([key]) => [key, String(row.inputs[key])]))); }}>Edit</button><button disabled={busy} aria-label={`Delete ${row.name}`} onClick={() => perform(async () => { await api("/api/pro/scenarios", "DELETE", { id: row.id }); if (editing === row.id) clearEditor(); await refresh(); })}>Delete</button></div></li>)}</ul> : <p>No saved scenarios yet.</p>}
      </section> : null}
      <details style={{ marginTop: "20px" }}><summary>Update your password</summary><form onSubmit={event => { event.preventDefault(); perform(async () => { await api("/api/pro/auth", "POST", { action: "password", password }); setPassword(""); setNotice("Password updated."); }); }}><label>New password<input style={inputStyle} type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} /></label><button disabled={busy}>Update password</button></form></details>
    </> : null}
  </>;
}
