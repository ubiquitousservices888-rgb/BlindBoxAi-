import MediaUploadForm from "./MediaUploadForm";

export const metadata = {
  title: "Owner media upload | BlindBoxAI",
  description: "Owner-only upload page for approved social video media.",
  robots: { index: false, follow: false },
};

export default function MediaUploadPage() {
  return (
    <main style={{ width: "min(760px, calc(100% - 32px))", margin: "48px auto 80px" }}>
      <p style={{ fontFamily: "monospace", fontSize: "0.75rem", letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.7 }}>
        Owner media control
      </p>
      <h1>Upload approved social video</h1>
      <p style={{ lineHeight: 1.7 }}>
        Upload an approved MP4 directly from your phone to the public BlindBoxAI Vercel Blob store. Uploading does not publish the video. The normal approval, URL verification, duplicate prevention, and Buffer publishing gates still apply.
      </p>
      <div style={{ margin: "24px 0", padding: 16, border: "1px solid currentColor", borderRadius: 12, lineHeight: 1.6 }}>
        <strong>Best-practice rule:</strong> use this stable public Blob URL for Buffer/TikTok. Do not use temporary preview, local, authenticated, or expiring media URLs.
      </div>
      <MediaUploadForm />
    </main>
  );
}
