"use client";

import Link from "next/link";
import { useState } from "react";

const SUGGESTIONS = [
  "What should I verify before buying a POP MART blind box?",
  "How is a sold transaction different from an asking price?",
  "What are common counterfeit warning signs for designer toys?",
];

export default function AskPage() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const clean = question.trim();
    if (clean.length < 3 || loading) return;
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
      if (!response.ok) throw new Error(body?.error || "The answer could not be completed.");
      setResult(body);
    } catch (requestError) {
      setError(requestError.message || "Mr. Know It All is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="ask-main">
      <Link className="crumb" href="/">← All series</Link>
      <section className="ask-intro">
        <p className="eyebrow">BlindBoxAI agent</p>
        <h1>Ask Mr. Know It All</h1>
        <p>Evidence-first answers across blind boxes, POP MART, designer toys, brands, series,
          observed prices, pull odds, releases, and counterfeit warning signs.</p>
      </section>

      <form className="ask-form" onSubmit={submit}>
        <label htmlFor="question">Your collector question</label>
        <textarea
          id="question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={600}
          rows={5}
          placeholder="Ask about a brand, series, release, price observation, or fake-check step…"
          aria-describedby="question-note"
          required
        />
        <div className="ask-controls">
          <span id="question-note">{question.length}/600 · No buying or payment permissions</span>
          <button type="submit" disabled={loading || question.trim().length < 3}>
            {loading ? "Checking sources…" : "Ask securely"}
          </button>
        </div>
      </form>

      <div className="suggestions" aria-label="Suggested questions">
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
            <h2>Mr. Know It All</h2>
            <span>{result.confidence} confidence</span>
          </div>
          <p className="answer-copy">{result.answer}</p>
          {result.citations?.length > 0 && (
            <section>
              <h3>Sources</h3>
              <ul>
                {result.citations.map((citation) => (
                  <li key={citation.url}>
                    <a href={citation.url} target="_blank" rel="noreferrer">{citation.title}</a>
                    {citation.supports && <span>{citation.supports}</span>}
                  </li>
                ))}
              </ul>
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

      <p className="privacy-note">The public Q&amp;A cannot buy, bid, pay, enroll, contact, or publish.
        Questions are privacy-redacted, encrypted, and used only for owner-level aggregate knowledge-base,
        video, and affiliate planning. No visitor identity profile is stored. Do not include personal or payment data.</p>

      <style jsx>{`
        .ask-main{max-width:760px;margin:0 auto;padding:28px 0 72px}
        .ask-intro{padding:20px 0 22px}
        .ask-intro h1{font-size:clamp(2.1rem,8vw,3.1rem);margin:.3em 0 .25em}
        .ask-intro p:last-child{max-width:58ch;color:var(--muted)}
        .ask-form{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px}
        .ask-form label{display:block;font-weight:600;margin-bottom:8px}
        textarea{display:block;width:100%;resize:vertical;min-height:128px;border:1.5px solid var(--line-strong);border-radius:10px;background:#fff;color:var(--ink);padding:13px;font:16px/1.5 Inter,system-ui,sans-serif}
        textarea:focus{border-color:var(--verify);outline:2px solid #CBE9DF;outline-offset:1px}
        .ask-controls{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:12px}
        .ask-controls span{color:var(--muted);font-size:.76rem}
        .ask-controls button{border:0;border-radius:999px;background:var(--verify);color:#fff;font-weight:600;padding:11px 18px;cursor:pointer;white-space:nowrap}
        .ask-controls button:disabled{cursor:wait;opacity:.55}
        .suggestions{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 24px}
        .suggestions button{border:1px solid var(--line-strong);border-radius:999px;background:transparent;color:var(--ink);padding:7px 11px;font-size:.78rem;cursor:pointer;text-align:left}
        .suggestions button:hover{border-color:var(--verify);color:var(--verify-ink)}
        .ask-error{border:1px solid #E1A56F;background:#FFF4E8;color:#7B3705;border-radius:12px;padding:14px;margin-top:20px}
        .answer{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px;margin-top:24px}
        .answer-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line);padding-bottom:10px;margin-bottom:14px}
        .answer-head h2{font-size:1.35rem}
        .answer-head span{font-family:"Spline Sans Mono",monospace;font-size:.68rem;text-transform:uppercase;color:var(--verify-ink)}
        .answer-copy{white-space:pre-wrap}
        .answer section{margin-top:20px}
        .answer h3{font-size:1rem;margin-bottom:7px}
        .answer ul{padding-left:20px}
        .answer li{margin:7px 0}
        .answer li span{display:block;color:var(--muted);font-size:.82rem}
        .answer-notes{border-top:1px solid var(--line);padding-top:14px;color:var(--muted);font-size:.88rem}
        .privacy-note{margin-top:28px;color:var(--muted);font-size:.78rem}
        @media(max-width:560px){.ask-controls{align-items:flex-start;flex-direction:column}.ask-controls button{width:100%}.answer-head{align-items:flex-start;flex-direction:column}}
      `}</style>
    </main>
  );
}
