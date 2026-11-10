import { siteImage } from "../../lib/site-images.mjs";

// One frame for every picture on the public site. If the slot has a file in
// lib/site-images.mjs it shows that image; otherwise it draws BlindBoxAI's own
// placeholder art for the kind of item, so the layout never shows a gap.
export default function ImageSlot({ slot, fallbackSlot, kind = "box", alt = "", tone = "teal", className = "", priority = false }) {
  const src = slot ? siteImage(slot, fallbackSlot) : null;
  return (
    <div className={`ui-slot ui-slot-${tone}${src ? " ui-slot-has-image" : ""} ${className}`} data-image-slot={slot || undefined}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading={priority ? "eager" : "lazy"} decoding="async" />
      ) : (
        <PlaceholderArt kind={kind} />
      )}
    </div>
  );
}

export function PlaceholderArt({ kind = "box" }) {
  const Art = ART[kind] || ART.box;
  return (
    <svg viewBox="0 0 240 180" aria-hidden="true" focusable="false" className="ui-art">
      <circle cx="198" cy="34" r="44" className="ui-art-glow" />
      <circle cx="36" cy="160" r="52" className="ui-art-glow ui-art-glow-2" />
      <Art />
    </svg>
  );
}

const ART = {
  box: () => (
    <g className="ui-art-ink">
      <path d="M84 70 L120 52 L156 70 L156 128 L120 146 L84 128 Z" className="ui-art-fill" />
      <path d="M84 70 L120 88 L156 70 M120 88 L120 146" />
      <path d="M102 61 L138 79" className="ui-art-thin" />
      <text x="120" y="123" textAnchor="middle" className="ui-art-q">?</text>
      <circle cx="176" cy="58" r="4" className="ui-art-dot" />
      <circle cx="64" cy="98" r="3" className="ui-art-dot" />
    </g>
  ),
  card: () => (
    <g className="ui-art-ink">
      <rect x="96" y="38" width="64" height="94" rx="7" transform="rotate(10 128 85)" className="ui-art-fill-2" />
      <rect x="80" y="44" width="64" height="94" rx="7" transform="rotate(-6 112 91)" className="ui-art-fill" />
      <rect x="89" y="55" width="46" height="36" rx="3" transform="rotate(-6 112 73)" className="ui-art-thin" />
      <path d="M90 104 L132 100 M91 114 L124 111" transform="rotate(-6 112 108)" className="ui-art-thin" />
    </g>
  ),
  coin: () => (
    <g className="ui-art-ink">
      <ellipse cx="120" cy="102" rx="46" ry="12" className="ui-art-fill-2" />
      <circle cx="120" cy="84" r="40" className="ui-art-fill" />
      <circle cx="120" cy="84" r="30" className="ui-art-thin" />
      <path d="M108 84 L118 94 L134 72" />
      <circle cx="176" cy="60" r="4" className="ui-art-dot" />
    </g>
  ),
  case: () => (
    <g className="ui-art-ink">
      <rect x="78" y="44" width="84" height="96" rx="6" className="ui-art-fill" />
      <path d="M78 122 L162 122" />
      <path d="M90 56 L104 56 M90 64 L98 64" className="ui-art-thin" />
      <path d="M106 116 L106 92 Q120 78 134 92 L134 116 Z" className="ui-art-fill-2" />
      <rect x="70" y="140" width="100" height="8" rx="3" className="ui-art-fill-2" />
    </g>
  ),
  guide: () => (
    <g className="ui-art-ink">
      <path d="M72 50 L120 58 L168 50 L168 132 L120 140 L72 132 Z" className="ui-art-fill" />
      <path d="M120 58 L120 140" />
      <path d="M84 72 L108 76 M84 84 L108 88 M84 96 L102 99" className="ui-art-thin" />
      <circle cx="144" cy="90" r="14" className="ui-art-fill-2" />
      <path d="M154 100 L164 110" />
      <path d="M138 90 L143 95 L151 85" className="ui-art-thin" />
    </g>
  ),
  tool: () => (
    <g className="ui-art-ink">
      <rect x="82" y="40" width="76" height="104" rx="10" className="ui-art-fill" />
      <rect x="92" y="52" width="56" height="22" rx="4" className="ui-art-fill-2" />
      <path d="M100 63 L140 63" className="ui-art-thin" />
      <circle cx="102" cy="92" r="5" /><circle cx="120" cy="92" r="5" /><circle cx="138" cy="92" r="5" />
      <circle cx="102" cy="112" r="5" /><circle cx="120" cy="112" r="5" />
      <rect x="133" y="107" width="10" height="24" rx="4" className="ui-art-fill-2" />
    </g>
  ),
};
