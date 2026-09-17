import MediaUploadForm from "./MediaUploadForm";

export const metadata = {
  title: "Owner media upload | BlindBoxAI",
  description: "Owner-only upload page for reviewed social-video traction research.",
  robots: { index: false, follow: false },
};

export default function MediaUploadPage() {
  return (
    <main style={{ width: "min(760px, calc(100% - 32px))", margin: "48px auto 80px" }}>
      <p style={{ fontFamily: "monospace", fontSize: "0.75rem", letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.7 }}>
        Owner media control
      </p>
      <h1>Upload social video for traction research</h1>
      <p style={{ lineHeight: 1.7 }}>
        Upload an MP4 from your phone, stage it for owner review, then publish the exact approved video through Buffer. Each upload receives its own research campaign ID, and each social channel gets its own source tag so BlindBoxAI can compare real traffic and affiliate-click traction without inventing results.
      </p>
      <div style={{ margin: "24px 0", padding: 16, border: "1px solid currentColor", borderRadius: 12, lineHeight: 1.6 }}>
        <strong>Safety rule:</strong> upload does not publish by itself. The exact MP4 still has to pass the owner review gate before Buffer receives it.
      </div>
      <MediaUploadForm />
    </main>
  );
}
