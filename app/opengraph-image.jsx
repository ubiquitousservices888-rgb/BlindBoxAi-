import { ImageResponse } from "next/og";

// Default share preview for every page that does not set its own.
export const alt = "BlindBoxAI — sold-price evidence and fake checks for collectibles";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "linear-gradient(135deg,#0C1A19 0%,#123331 60%,#0B9794 140%)", color: "#fff", padding: "72px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <svg width="84" height="84" viewBox="0 0 64 64">
              <rect x="2" y="2" width="60" height="60" rx="14" fill="#0B9794" />
              <path d="M18 22 L32 15 L46 22 L46 44 L32 51 L18 44 Z" fill="#F4FBF9" stroke="#0A2423" strokeWidth="2.4" />
              <path d="M18 22 L32 29 L46 22 M32 29 L32 51" fill="none" stroke="#0A2423" strokeWidth="2" />
              <path d="M21 33 h9 v3 a4 4 0 0 1 -4 4 h-1 a4 4 0 0 1 -4 -4 Z" fill="#0A2423" />
              <path d="M33 33 h9 v3 a4 4 0 0 1 -4 4 h-1 a4 4 0 0 1 -4 -4 Z" fill="#0A2423" />
              <circle cx="11" cy="42" r="6" fill="#F2B544" stroke="#0A2423" strokeWidth="2" />
              <rect x="48" y="35" width="9" height="13" rx="2" fill="#B9A7FF" stroke="#0A2423" strokeWidth="2" />
            </svg>
            <div style={{ display: "flex", fontSize: 44, fontWeight: 800 }}>
              BlindBox<span style={{ color: "#5FD7CE" }}>AI</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05, maxWidth: 900 }}>
              Research the collectible before you buy.
            </div>
            <div style={{ fontSize: 30, color: "#BFE3DE", marginTop: 22 }}>
              Completed-sale prices · fake checks · blind boxes &amp; trading cards
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
