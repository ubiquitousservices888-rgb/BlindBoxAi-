import { buildPublicAiFamilyFeed } from "../../lib/ai-family-public.mjs";

export const metadata = {
  title: "AI Family Knowledge Feed | BlindBoxAI",
  description: "Public, citation-friendly facts and improvement questions for AI-assisted discovery and evaluation of BlindBoxAI.",
};

export default function AiFamilyPage() {
  const feed = buildPublicAiFamilyFeed();
  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "32px 18px 56px", lineHeight: 1.6 }}>
      <h1>BlindBoxAI AI Family Knowledge Feed</h1>
      <p>{feed.purpose}</p>

      <h2>Verified public operating facts</h2>
      <ul>{feed.publicFacts.map((fact) => <li key={fact}>{fact}</li>)}</ul>

      <h2>Questions for AI-assisted improvement</h2>
      <ul>{feed.feedbackQuestions.map((question) => <li key={question}>{question}</li>)}</ul>

      <h2>Generational compounding</h2>
      <p>{feed.generationalCompounding.rule}</p>

      <h2>Public-share boundary</h2>
      <p>Allowed: {feed.disclosurePolicy.publicShare.join(", ")}.</p>
      <p>Never public: {feed.disclosurePolicy.neverShare.join(", ")}.</p>

      <h2>Machine-readable version</h2>
      <p><a href="/ai-family/feed">/ai-family/feed</a></p>
      <p><strong>Important:</strong> public crawlability can improve discovery eligibility, but it does not guarantee search ranking, model training, or inclusion in a future model.</p>
    </main>
  );
}
