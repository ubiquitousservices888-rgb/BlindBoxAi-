export default function SiteHomeStyles() {
  return <style>{CSS}</style>;
}

const CSS = `
.bv-home{background:#F6F9F8}
.bv-home .bv-button-primary{background:#0B9794;color:#04201F}
.bv-home .bv-button-primary:hover{background:#2BB3AE}

/* hero */
.hx-hero{background:radial-gradient(circle at 85% 20%,rgba(11,151,148,.35),transparent 45%),linear-gradient(160deg,#0C1A19 0%,#102624 55%,#0E2E2C 100%);color:#fff}
.hx-hero-in{max-width:1180px;margin:0 auto;padding:72px 18px 84px;display:grid;grid-template-columns:minmax(0,1fr) minmax(340px,.95fr);gap:56px;align-items:center}
.hx-hero h1{color:#fff!important;font-size:clamp(2.6rem,5.6vw,4.8rem);line-height:.98;max-width:11ch;margin-bottom:22px}
.hx-hero .bv-kicker{color:#5FD7CE!important}
.hx-hero .bv-lead{color:#C4D9D6!important;font-size:1.06rem;line-height:1.7;max-width:54ch}
.hx-hero .bv-micro{color:#8FAAA6!important}
.hx-button-ghost{border:1px solid #3A5754;color:#E3F1EF;background:transparent}
.hx-button-ghost:hover{border-color:#5FD7CE}
.hx-hero-tool{display:inline-block;margin-top:18px;color:#F2C46A;font-weight:700;font-size:.9rem;text-decoration:none}
.hx-hero-tool:hover{text-decoration:underline}
.hx-hero-art{position:relative}
.hx-hero-slot{aspect-ratio:5/4;border-radius:24px;border:1px solid #24423F;box-shadow:0 30px 70px rgba(0,0,0,.35)}
.hx-hero-badge{position:absolute;background:#fff;color:#0C1A19;border-radius:12px;padding:12px 14px;box-shadow:0 14px 30px rgba(0,0,0,.28);display:flex;flex-direction:column;gap:2px}
.hx-hero-badge span{font-size:.6rem;letter-spacing:.14em;text-transform:uppercase;color:#087E7A;font-weight:800}
.hx-hero-badge strong{font-size:.86rem}
.hx-hero-badge-1{left:-18px;bottom:28px}
.hx-hero-badge-2{right:-12px;top:26px}


/* jump bar */
.hx-jump{max-width:1180px;margin:26px auto 0;padding:0 18px;display:flex;gap:8px;overflow-x:auto;scrollbar-width:none}
.hx-jump::-webkit-scrollbar{display:none}
.hx-jump a{flex:none;font-size:.8rem;font-weight:600;color:#1B2B2A;text-decoration:none;border:1px solid #D3DFDC;background:#fff;border-radius:999px;padding:8px 14px}
.hx-jump a:hover{border-color:#0B9794;color:#087E7A}

/* sections */
.hx-section{max-width:1180px;margin:0 auto;padding:68px 18px;scroll-margin-top:80px}
.hx-tint{max-width:none;background:#EDF5F3;padding-left:max(18px,calc((100vw - 1180px)/2));padding-right:max(18px,calc((100vw - 1180px)/2))}
.bv-home section{scroll-margin-top:80px}

/* categories */
.hx-cat-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
.hx-cat{display:flex;flex-direction:column;background:#fff;border:1px solid #DCE5E3;border-radius:18px;padding:12px;text-decoration:none;color:inherit;transition:transform .15s,border-color .15s,box-shadow .15s}
a.hx-cat:hover{transform:translateY(-3px);border-color:#0B9794;box-shadow:0 16px 34px rgba(12,26,25,.08)}
.hx-cat-copy{padding:16px 8px 8px;display:flex;flex-direction:column;flex:1}
.hx-cat h3{font-size:1.2rem;margin-bottom:8px}
.hx-cat h3 em{font-style:normal;font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;background:#FBF0DA;color:#8A5A0B;border-radius:999px;padding:4px 8px;margin-left:6px;vertical-align:middle}
.hx-cat p{font-size:.88rem;line-height:1.55}
.hx-cat-copy>span{margin-top:auto;padding-top:14px;font-weight:700;font-size:.84rem;color:#087E7A}
.hx-cat-soon .hx-cat-copy>span{color:#8A5A0B}

/* product grid */
.hx-product-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.hx-product{background:#fff;border:1px solid #DCE5E3;border-radius:18px;overflow:hidden;display:flex;flex-direction:column}
.hx-product .ui-slot{border-radius:0;aspect-ratio:16/10}
.hx-product-body{padding:16px 18px 18px;display:flex;flex-direction:column;gap:6px}
.hx-product-brand{font-size:.66rem;letter-spacing:.14em;text-transform:uppercase;color:#5D6A68;font-weight:700}
.hx-product .bv-card-title{font-size:1.05rem;line-height:1.25}
.hx-product-price{font-size:.9rem;color:#0C1A19}
.hx-product .bv-series-meta{margin-top:6px}

/* guides */
.hx-guide-feature{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:28px;align-items:center;background:#0C1A19;color:#fff;border-radius:22px;padding:22px}
.hx-guide-feature .ui-slot{border-radius:16px}
.hx-guide-copy h3{font-size:clamp(1.5rem,3vw,2.2rem);color:#fff!important;margin:10px 0 12px}
.hx-guide-copy p{color:#C4D9D6!important;line-height:1.65;max-width:58ch}
.hx-guide-buy{display:flex;flex-direction:column;align-items:flex-start;gap:10px;margin-top:20px}
.hx-guide-buy small{font-size:.72rem;color:#8FAAA6}
.hx-pill{display:inline-block;font-size:.64rem;letter-spacing:.12em;text-transform:uppercase;font-weight:800;color:#087E7A;background:#DDF2EE;border-radius:999px;padding:5px 10px;align-self:flex-start}
.hx-guide-feature .hx-pill{background:#1E3A37;color:#7FD6CF}
.hx-guide-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:18px}
.hx-guide{display:flex;flex-direction:column;gap:8px;background:#fff;border:1px solid #DCE5E3;border-radius:18px;padding:12px 12px 18px;text-decoration:none;color:inherit;transition:transform .15s,border-color .15s}
.hx-guide:hover{transform:translateY(-3px);border-color:#0B9794}
.hx-guide .hx-pill{margin:8px 6px 0}
.hx-guide h3{font-size:1.1rem;margin:0 6px}
.hx-guide p{font-size:.85rem;line-height:1.5;margin:0 6px}

/* ask band */
.hx-ask{background:linear-gradient(120deg,#0B9794,#0A7F7C);}
.hx-ask-in{max-width:1180px;margin:0 auto;padding:56px 18px;display:flex;justify-content:space-between;align-items:center;gap:28px}
.hx-ask h2{color:#06201F!important;font-size:clamp(1.8rem,3.4vw,2.6rem)!important}
.hx-ask p{color:#0C3533!important}
.hx-ask .bv-kicker{color:#06302E!important}
.hx-ask .bv-button-primary{background:#0C1A19;color:#fff;margin-top:0;flex:none}
.hx-ask .bv-button-primary:hover{background:#16302E}

/* trust */
.hx-about{border-top:1px solid #E3EBEA}
.hx-trust-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.hx-trust{background:#fff;border:1px solid #DCE5E3;border-radius:16px;padding:20px}
.hx-trust span{font-family:"Spline Sans Mono",monospace;font-size:.75rem;color:#0B9794;font-weight:600}
.hx-trust h3{font-size:1rem;margin:10px 0 8px;line-height:1.25}
.hx-trust p{font-size:.84rem;line-height:1.55}

@media(max-width:980px){
  .hx-hero-in{grid-template-columns:1fr;gap:40px;padding:48px 18px 74px}
  .hx-hero-badge-1{left:10px}.hx-hero-badge-2{right:10px}
  .hx-product-grid,.hx-guide-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .hx-trust-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .hx-guide-feature{grid-template-columns:1fr}
}
@media(max-width:640px){
  .hx-hero h1{font-size:2.6rem}
  .hx-section{padding:52px 18px}
  .hx-product-grid,.hx-cat-grid,.hx-guide-grid,.hx-trust-grid{grid-template-columns:1fr}
  .hx-ask-in{flex-direction:column;align-items:flex-start;padding:46px 18px}
  .hx-guide-feature{padding:14px}
}
@media(prefers-reduced-motion:reduce){.hx-cat,.hx-guide{transition:none}}
`;
