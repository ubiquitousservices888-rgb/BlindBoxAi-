"use client";

import { track } from "@vercel/analytics";
import Link from "next/link";
import { useState } from "react";

const SUGGESTIONS = [
  "Pokemon 30th Celebration Charizard",
  "2026 Topps baseball rookie card",
  "Magic the Gathering Black Lotus",
  "Labubu Macaron",
];

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function saleDate(value) {
  if (!value) return "sale date unavailable";
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return "sale date unavailable";
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function freshnessLabel(match) {
  if (match?.freshnessStatus === "fresh") return `within ${match.freshnessWindowDays ?? 30} days`;
  if (match?.freshnessStatus === "dated") return `dated · older than ${match.freshnessWindowDays ?? 30} days`;
  return "freshness unknown";
}

export default function AskPage() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rawOffer, setRawOffer] = useState("");
  const [gradedOffer, setGradedOffer] = useState("");
  const [gradeAssumption, setGradeAssumption] = useState("PSA 10");
  const [researchStatus, setResearchStatus] = useState("");

  async function submit(event) {
    event.preventDefault();
    const clean = question.trim();
    if (clean.length < 2 || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    setResearchStatus("");
    try {
      const response = await fetch("/api/mr-know-it-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: clean }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "The lookup could not be completed.");
      setResult(body);
      track("agent_question", {
        mode: "deterministic",
        result_count: Array.isArray(body?.matches) ? body.matches.length : 0,
      });
    } catch (requestError) {
      setError(requestError.message || "Verified comp lookup is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }

  function confirmSuggestedMatch() {
    if (!result?.suggestedMatch?.figure) return;
    setQuestion(result.suggestedMatch.figure);
    setResult(null);
    setError("");
    setResearchStatus("");
  }

  async function submitAudienceResearch(event) {
    event.preventDefault();
    setResearchStatus("Saving…");
    const response = await fetch("/api/research/audience-valuation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: question.trim(),
        rawOffer: rawOffer || null,
        gradedOffer: gradedOffer || null,
        gradeAssumption,
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setResearchStatus(body?.error || "Could not save the research response.");
      return;
    }
    setResearchStatus("Saved as audience research only — not sold-price evidence.");
    setRawOffer("");
    setGradedOffer("");
    track("audience_value_research", { has_raw: Boolean(rawOffer), has_graded: Boolean(gradedOffer) });
  }

  return (
    <main className="ask-main">
      <Link className="crumb" href="/">← All series</Link>
      <section className="ask-intro">
        <p className="eyebrow">Collectible intelligence · sold evidence first</p>
        <h1>Mr. Know It All</h1>
        <p>Ask about collectible cards or toys. Verified evidence requires at least two completed sales, and price freshness is shown separately. Missing evidence stays missing instead of being guessed.</p>
      </section>

      <form className="ask-form" onSubmit={submit}>
        <label htmlFor="question">Ask about any collectible</label>
        <input
          id="question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={120}
          placeholder="Try: What is this Pokemon card worth raw and graded?"
          aria-describedby="question-note"
          required
        />
        <div className="ask-controls">
          <span id="question-note">{question.length}/120 · completed sales only for verified evidence</span>
          <button type="submit" disabled={loading || question.trim().length < 2}>
            {loading ? "Researching…" : "Ask Mr. Know It All"}
          </button>
        </div>
      </form>

      <div className="suggestions" aria-label="Suggested searches">
        {SUGGESTIONS.map((suggestion) => (
          <button key={suggestion} type="button" onClick={() => setQuestion(suggestion)}>{suggestion}</button>
        ))}
      </div>

      {error && <p className="ask-error" role="alert">{error}</p>}

      {result && (
        <article className="answer" aria-live="polite">
          <div className="answer-head"><h2>Research result</h2><span>{result.mode || "deterministic"}</span></div>
          <p className="answer-copy">{result.answer}</p>

          {result.suggestedMatch && result.matches?.length === 0 && (
            <section className="nearest-match">
              <h3>Possible match — confirmation required</h3>
              <p><strong>{result.suggestedMatch.figure}</strong><br />{result.suggestedMatch.brand} · {result.suggestedMatch.series}</p>
              <button type="button" onClick={confirmSuggestedMatch}>Use this exact item</button>
              <small>This only fills the exact item name. Press “Ask Mr. Know It All” again to confirm before any price evidence is shown.</small>
            </section>
          )}

          {result.matches?.length > 0 && (
            <section>
              <h3>Verified completed-sale evidence</h3>
              <div className="matches">
                {result.matches.map((match) => (
                  <div className="match" key={`${match.seriesSlug}:${match.figure}`}>
                    <div><strong>{match.figure}</strong><span>{match.brand} · {match.series} · {match.rarity}</span></div>
                    <b>{money(match.observedLowUSD)}{match.observedHighUSD !== match.observedLowUSD ? `–${money(match.observedHighUSD)}` : ""}</b>
                    <div className={`evidence-meta ${match.freshnessStatus || "unknown"}`}>
                      <span>{match.completedSaleCount ?? "?"} completed sales</span>
                      <span>Latest: {saleDate(match.latestSaleAt)}</span>
                      <span>{freshnessLabel(match)}</span>
                    </div>
                    {match.evidence && <p>{match.evidence}</p>}
                    <Link href={`/series/${match.seriesSlug}`}>Open series page →</Link>
                  </div>
                ))}
              </div>
            </section>
          )}

          {result.matches?.length === 0 && !result.suggestedMatch && (
            <section className="audience-research">
              <h3>No exact verified sold comps yet</h3>
              <p>Help measure collector demand while Mr. Know It All queues this item for deeper research. Your answer is never treated as a sale or verified market value.</p>
              <form onSubmit={submitAudienceResearch}>
                <label htmlFor="raw-offer">What would you pay raw?</label>
                <input id="raw-offer" type="number" min="0.01" step="0.01" value={rawOffer} onChange={(e) => setRawOffer(e.target.value)} placeholder="0.00" />
                <label htmlFor="graded-offer">What would you pay graded?</label>
                <input id="graded-offer" type="number" min="0.01" step="0.01" value={gradedOffer} onChange={(e) => setGradedOffer(e.target.value)} placeholder="0.00" />
                <label htmlFor="grade-assumption">Grade assumption</label>
                <input id="grade-assumption" value={gradeAssumption} maxLength={80} onChange={(e) => setGradeAssumption(e.target.value)} placeholder="PSA 10" />
                <button type="submit" disabled={!rawOffer && !gradedOffer}>Save research response</button>
              </form>
              {researchStatus && <p className="research-status">{researchStatus}</p>}
            </section>
          )}

          {result.safetyNotes?.length > 0 && (
            <section className="answer-notes"><h3>Important limits</h3><ul>{result.safetyNotes.map((note) => <li key={note}>{note}</li>)}</ul></section>
          )}
        </article>
      )}

      <p className="privacy-note">Questions are stored only in redacted research form so repeated gaps can be prioritized. Audience raw/graded answers are research signals only. Verified evidence remains completed sold-price evidence only.</p>

      <style jsx>{`
        .ask-main{max-width:760px;margin:0 auto;padding:28px 0 72px}.ask-intro{padding:20px 0 22px}.ask-intro h1{font-size:clamp(2.1rem,8vw,3.1rem);margin:.3em 0 .25em}.ask-intro p:last-child{max-width:62ch;color:var(--muted)}
        .ask-form,.answer{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px}.ask-form label,.audience-research label{display:block;font-weight:600;margin:10px 0 8px}input{display:block;width:100%;border:1.5px solid var(--line-strong);border-radius:10px;background:#fff;color:var(--ink);padding:13px;font:16px/1.5 Inter,system-ui,sans-serif}input:focus{border-color:var(--verify);outline:2px solid #CBE9DF;outline-offset:1px}
        .ask-controls{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:12px}.ask-controls span{color:var(--muted);font-size:.76rem}.ask-controls button,.audience-research button,.nearest-match button{border:0;border-radius:999px;background:var(--verify);color:#fff;font-weight:600;padding:11px 18px;cursor:pointer;margin-top:12px}.ask-controls button:disabled,.audience-research button:disabled{opacity:.55;cursor:not-allowed}
        .suggestions{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 24px}.suggestions button{border:1px solid var(--line-strong);border-radius:999px;background:transparent;color:var(--ink);padding:7px 11px;font-size:.78rem;cursor:pointer;text-align:left}.ask-error{border:1px solid #E1A56F;background:#FFF4E8;color:#7B3705;border-radius:12px;padding:14px;margin-top:20px}
        .answer{padding:20px;margin-top:24px}.answer-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line);padding-bottom:10px;margin-bottom:14px}.answer-head h2{font-size:1.35rem}.answer-head span{font-family:"Spline Sans Mono",monospace;font-size:.68rem;text-transform:uppercase;color:var(--verify-ink)}.answer section{margin-top:20px}.answer h3{font-size:1rem;margin-bottom:9px}
        .matches{display:grid;gap:10px}.match{border:1px solid var(--line);border-radius:10px;padding:13px;background:#fff}.match div{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}.match span{display:block;color:var(--muted);font-size:.78rem}.match b{display:block;font-family:"Spline Sans Mono",monospace;margin-top:7px}.match p,.audience-research p,.nearest-match p{color:var(--muted);font-size:.84rem;margin:7px 0}.match a{font-size:.8rem;font-weight:600}.evidence-meta{margin-top:9px;padding:8px 10px;border-radius:8px;background:#eef5f2;font-size:.74rem}.evidence-meta.fresh{background:#eaf6f1}.evidence-meta.dated{background:#fff3df}.evidence-meta.unknown{background:#f1f2f2}.evidence-meta span:last-child{font-weight:700}.nearest-match{border-top:1px solid var(--line);padding-top:14px}.nearest-match small{display:block;margin-top:9px;color:var(--muted);font-size:.72rem;line-height:1.45}.audience-research{border-top:1px solid var(--line);padding-top:14px}.research-status{font-weight:600}.answer-notes{border-top:1px solid var(--line);padding-top:14px;color:var(--muted);font-size:.88rem}.answer-notes ul{padding-left:20px}.privacy-note{margin-top:28px;color:var(--muted);font-size:.78rem}
        @media(max-width:560px){.ask-controls{align-items:flex-start;flex-direction:column}.ask-controls button{width:100%}.answer-head{align-items:flex-start;flex-direction:column}.evidence-meta{align-items:flex-start;flex-direction:column}}
      `}</style>
    </main>
  );
}
