"use client";

import { track } from "@vercel/analytics";
import Link from "next/link";
import { useState } from "react";

const SUGGESTIONS = [
  "Hirono Mist-Walker",
  "The Tempered Aegis",
  "Labubu Macaron",
];

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export default function AskPage() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const clean = question.trim();
    if (clean.length < 2 || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
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

  return (
    <main className="ask-main">
      <Link className="crumb" href="/">← All series</Link>
      <section className="ask-intro">
        <p className="eyebrow">Deterministic verified-comp lookup</p>
        <h1>Mr. Know It All</h1>
        <p>Search BlindBoxAI's reviewed historical comp records. This tool does not call an LLM,
          does not browse the web, and will not invent missing prices.</p>
      </section>

      <form className="ask-form" onSubmit={submit}>
        <label htmlFor="question">Character or series</label>
        <input
          id="question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={120}
          placeholder="Try: The Tempered Aegis"
          aria-describedby="question-note"
          required
        />
        <div className="ask-controls">
          <span id="question-note">{question.length}/120 · reviewed records only</span>
          <button type="submit" disabled={loading || question.trim().length < 2}>
            {loading ? "Searching…" : "Find verified comps"}
          </button>
        </div>
      </form>

      <div className="suggestions" aria-label="Suggested searches">
        {SUGGESTIONS.map((suggestion) => (
          <button key={suggestion} type="button" onClick={() => setQuestion(suggestion)}>
            {suggestion}
          </button>
        ))}
      </div>

      {error && <p className="ask-error" role="alert">{error}</p>}

      {result && (
        <article className="answer" aria-live="polite">
          <div className="answer-head">
            <h2>Verified result</h2>
            <span>deterministic</span>
          </div>
          <p className="answer-copy">{result.answer}</p>

          {result.matches?.length > 0 && (
            <section>
              <h3>Reviewed historical comps</h3>
              <div className="matches">
                {result.matches.map((match) => (
                  <div className="match" key={`${match.seriesSlug}:${match.figure}`}>
                    <div>
                      <strong>{match.figure}</strong>
                      <span>{match.brand} · {match.series} · {match.rarity}</span>
                    </div>
                    <b>{money(match.observedLowUSD)}{match.observedHighUSD !== match.observedLowUSD ? `–${money(match.observedHighUSD)}` : ""}</b>
                    {match.evidence && <p>{match.evidence}</p>}
                    <Link href={`/series/${match.seriesSlug}`}>Open series page →</Link>
                  </div>
                ))}
              </div>
            </section>
          )}

          {result.safetyNotes?.length > 0 && (
            <section className="answer-notes">
              <h3>Important limits</h3>
              <ul>{result.safetyNotes.map((note) => <li key={note}>{note}</li>)}</ul>
            </section>
          )}
        </article>
      )}

      <p className="privacy-note">Search text is not stored as visitor PII. Analytics record only the event name,
        deterministic mode, and result count. Historical observations are not offers, guarantees, or financial advice.</p>

      <style jsx>{`
        .ask-main{max-width:760px;margin:0 auto;padding:28px 0 72px}
        .ask-intro{padding:20px 0 22px}
        .ask-intro h1{font-size:clamp(2.1rem,8vw,3.1rem);margin:.3em 0 .25em}
        .ask-intro p:last-child{max-width:62ch;color:var(--muted)}
        .ask-form{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px}
        .ask-form label{display:block;font-weight:600;margin-bottom:8px}
        input{display:block;width:100%;border:1.5px solid var(--line-strong);border-radius:10px;background:#fff;color:var(--ink);padding:13px;font:16px/1.5 Inter,system-ui,sans-serif}
        input:focus{border-color:var(--verify);outline:2px solid #CBE9DF;outline-offset:1px}
        .ask-controls{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:12px}
        .ask-controls span{color:var(--muted);font-size:.76rem}
        .ask-controls button{border:0;border-radius:999px;background:var(--verify);color:#fff;font-weight:600;padding:11px 18px;cursor:pointer;white-space:nowrap}
        .ask-controls button:disabled{cursor:wait;opacity:.55}
        .suggestions{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 24px}
        .suggestions button{border:1px solid var(--line-strong);border-radius:999px;background:transparent;color:var(--ink);padding:7px 11px;font-size:.78rem;cursor:pointer;text-align:left}
        .ask-error{border:1px solid #E1A56F;background:#FFF4E8;color:#7B3705;border-radius:12px;padding:14px;margin-top:20px}
        .answer{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px;margin-top:24px}
        .answer-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line);padding-bottom:10px;margin-bottom:14px}
        .answer-head h2{font-size:1.35rem}
        .answer-head span{font-family:"Spline Sans Mono",monospace;font-size:.68rem;text-transform:uppercase;color:var(--verify-ink)}
        .answer section{margin-top:20px}.answer h3{font-size:1rem;margin-bottom:9px}
        .matches{display:grid;gap:10px}.match{border:1px solid var(--line);border-radius:10px;padding:13px;background:#fff}.match div{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}.match span{display:block;color:var(--muted);font-size:.78rem}.match b{display:block;font-family:"Spline Sans Mono",monospace;margin-top:7px}.match p{color:var(--muted);font-size:.8rem;margin:7px 0}.match a{font-size:.8rem;font-weight:600}
        .answer-notes{border-top:1px solid var(--line);padding-top:14px;color:var(--muted);font-size:.88rem}.answer-notes ul{padding-left:20px}
        .privacy-note{margin-top:28px;color:var(--muted);font-size:.78rem}
        @media(max-width:560px){.ask-controls{align-items:flex-start;flex-direction:column}.ask-controls button{width:100%}.answer-head{align-items:flex-start;flex-direction:column}}
      `}</style>
    </main>
  );
}
