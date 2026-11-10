// BlindBoxAI mark: a forward-facing box in sunglasses holding a coin and a card.
// Drawn in-house; swap for the final logo file when it is exported.
export default function BrandMark({ size = 34, title = "BlindBoxAI" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title}>
      <rect x="2" y="2" width="60" height="60" rx="14" fill="#0B9794" />
      <path d="M18 22 L32 15 L46 22 L46 44 L32 51 L18 44 Z" fill="#F4FBF9" stroke="#0A2423" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M18 22 L32 29 L46 22 M32 29 L32 51" fill="none" stroke="#0A2423" strokeWidth="2" strokeLinejoin="round" />
      <path d="M21 33 h9 a1 1 0 0 1 1 1 v2 a4 4 0 0 1 -4 4 h-2 a4 4 0 0 1 -4 -4 Z" fill="#0A2423" />
      <path d="M33 33 h9 a1 1 0 0 1 1 1 v2 a4 4 0 0 1 -4 4 h-2 a4 4 0 0 1 -4 -4 Z" fill="#0A2423" />
      <path d="M30 34 h3" stroke="#0A2423" strokeWidth="2" />
      <circle cx="11" cy="42" r="6" fill="#F2B544" stroke="#0A2423" strokeWidth="2" />
      <rect x="48" y="35" width="9" height="13" rx="2" transform="rotate(12 52 41)" fill="#B9A7FF" stroke="#0A2423" strokeWidth="2" />
    </svg>
  );
}
