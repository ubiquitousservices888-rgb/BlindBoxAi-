import ContributeForm from "./ContributeForm";

export const metadata = {
  title: "Submit collector photos | BlindBoxAI",
  description:
    "Submit rights-cleared collectible photographs for human review.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ContributePage() {
  return (
    <main
      style={{
        width: "min(760px, calc(100% - 32px))",
        margin: "48px auto 80px",
      }}
    >
      <p
        style={{
          fontFamily: "monospace",
          fontSize: "0.75rem",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          opacity: 0.7,
        }}
      >
        Collector evidence intake
      </p>

      <h1>Submit original comparison photos</h1>

      <p style={{ lineHeight: 1.7 }}>
        Submit only photographs you took, own, have written
        permission to use, or that carry a verified reuse license.
        Marketplace listing photos and screenshots are not accepted
        unless you separately hold documented permission.
      </p>

      <div
        style={{
          margin: "24px 0",
          padding: "16px",
          border: "1px solid currentColor",
          borderRadius: "12px",
          lineHeight: 1.6,
        }}
      >
        <strong>Important:</strong> visual differences are warning
        signs, not automatic proof that an item is counterfeit. Every
        submission remains private until a human reviews the rights,
        privacy, provenance, and proposed classification.
      </div>

      <ContributeForm />
    </main>
  );
}
