// Generic blind-box figure silhouette (owned artwork, no third-party photos).
// Left = genuine (clean). Right = suspect (numbered problem pins matching tells).
function Figure({ suspect = false, pins = [] }) {
  return (
    <svg viewBox="0 0 160 200" role="img"
      aria-label={suspect ? "Suspect figure with flagged inspection points" : "Genuine reference figure"}
      style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <linearGradient id={suspect ? "gsus" : "ggen"} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={suspect ? "#F6E4D6" : "#DBEFE8"} />
          <stop offset="1" stopColor={suspect ? "#EFD2BE" : "#BFE3D6"} />
        </linearGradient>
      </defs>
      {/* head */}
      <ellipse cx="80" cy="58" rx="46" ry="44" fill={`url(#${suspect ? "gsus" : "ggen"})`} stroke="#16181C" strokeWidth="2.5"/>
      {/* body */}
      <path d="M44 96 Q80 88 116 96 L110 168 Q80 182 50 168 Z"
        fill={`url(#${suspect ? "gsus" : "ggen"})`} stroke="#16181C" strokeWidth="2.5"/>
      {/* seam line */}
      <line x1="80" y1="14" x2="80" y2="176" stroke="#16181C" strokeWidth="1"
        strokeDasharray={suspect ? "3 4" : "0"} opacity={suspect ? 0.8 : 0.35}/>
      {/* eyes */}
      <circle cx="66" cy="60" r="3.4" fill="#16181C"/>
      <circle cx="94" cy="60" r="3.4" fill="#16181C"/>
      {/* base stamp */}
      <rect x="62" y="170" width="36" height="8" rx="2" fill="none" stroke="#16181C" strokeWidth="1.4" opacity={suspect ? 0.9 : 0.5}/>
      {/* numbered pins on suspect */}
      {suspect && pins.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="11" fill="#B4560A" stroke="#fff" strokeWidth="2"/>
          <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">{i + 1}</text>
        </g>
      ))}
    </svg>
  );
}

// Fixed anatomical anchor zones; tells map to them in order.
const ZONES = [
  { x: 118, y: 58 },  // head paint / print
  { x: 80,  y: 120 }, // body seam
  { x: 96,  y: 174 }, // base stamp / QR
  { x: 42,  y: 96 },  // shoulder / join
  { x: 80,  y: 40 },  // crown
];

export default function FakeCheck({ checklist = [] }) {
  const pins = checklist.slice(0, ZONES.length).map((_, i) => ZONES[i]);
  return (
    <div className="fc">
      <div className="fc-diagram">
        <figure className="fc-panel">
          <Figure />
          <figcaption><span className="tag tag-real">Genuine</span> reference</figcaption>
        </figure>
        <figure className="fc-panel">
          <Figure suspect pins={pins} />
          <figcaption><span className="tag tag-fake">Inspect</span> flagged points</figcaption>
        </figure>
      </div>
      <ol className="fc-tells">
        {checklist.map((t, i) => (
          <li key={i}><span className="fc-num">{i + 1}</span>{t}</li>
        ))}
      </ol>
      <p className="fc-note">Diagrams are illustrative reference art, not photos of specific listings. Always compare against the maker's official images before buying.</p>
    </div>
  );
}
