"use client";
import { track } from "@vercel/analytics";
import { useState } from "react";

export default function Waitlist({ endpoint }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");

  async function submit(e) {
    e.preventDefault();
    if (!email) return;
    setStatus("sending");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email, source: "blindboxai-pro-waitlist" }),
      });
      if (res.ok) {
        track("waitlist_signup", { source: "blindboxai-pro-waitlist" });
        setStatus("done");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return <p className="nodata">You're on the list — we'll email you once alerts go live.</p>;
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
      <input
        type="email"
        required
        aria-label="Email address"
        placeholder="you@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ flex: "1 1 200px", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--line, #ccc)", background: "transparent", color: "inherit" }}
      />
      <button className="cta" type="submit" disabled={status === "sending"}>
        {status === "sending" ? "Joining…" : "Join the waitlist →"}
      </button>
      {status === "error" && (
        <p className="fine" style={{ color: "crimson", flexBasis: "100%" }}>
          Something went wrong — please try again.
        </p>
      )}
    </form>
  );
}
