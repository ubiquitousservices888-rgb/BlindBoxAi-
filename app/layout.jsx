import { Analytics } from '@vercel/analytics/next';

export const metadata = {
  title: "BlindBoxAI — resale prices, pull odds & fake checks",
  description:
    "Independent reference for blind box resellers: US-sold resale ranges, manufacturer pull odds, and per-series counterfeit inspection guides.",
};
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&family=Spline+Sans+Mono:wght@500;600&display=swap" rel="stylesheet" />
        <style>{CSS}</style>
      </head>
      <body>
        {children}
        <footer className="foot">
          <strong>BlindBoxAI</strong> is an independent reference site. Not affiliated with,
          sponsored, or endorsed by any brand named here — brand and series names are used only
          to identify the products they refer to. Prices are US-sold estimates, not offers.
          Not financial advice.
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
const CSS = `
:root{
  --paper:#F1F3EE; --panel:#FBFCFA; --ink:#16181C; --muted:#5E635C;
  --verify:#0E7C66; --verify-ink:#0A5C4B; --fake:#B4560A; --rare:#5B4FC9;
  --line:#D7DAD1; --line-strong:#C2C6BB;
}
*{box-sizing:border-box;margin:0}
html{-webkit-text-size-adjust:100%}
body{background:var(--paper);color:var(--ink);
  font:16px/1.6 Inter,system-ui,sans-serif;padding:0 18px}
::selection{background:#CBE9DF}
a{color:var(--verify-ink);text-underline-offset:2px}
h1,h2,h3{font-family:Fraunces,Georgia,serif;line-height:1.08;letter-spacing:-.01em;font-weight:600}
main{max-width:760px;margin:0 auto;padding:28px 0 72px}
.mono{font-family:"Spline Sans Mono",ui-monospace,monospace}

/* hero */
.hero{position:relative;padding:20px 0 8px;overflow:hidden}
.guilloche{position:absolute;inset:0;z-index:0;opacity:.10;pointer-events:none}
.hero > *{position:relative;z-index:1}
.eyebrow{font-family:"Spline Sans Mono",monospace;font-size:.72rem;letter-spacing:.18em;
  text-transform:uppercase;color:var(--verify-ink)}
.hero h1{font-size:clamp(2.1rem,8vw,3.1rem);margin:.3em 0 .35em}
.hero p{color:var(--muted);max-width:52ch}
.cta{display:inline-flex;align-items:center;gap:.5em;margin-top:20px;
  background:var(--verify);color:#fff;text-decoration:none;font-weight:600;
  border-radius:999px;padding:12px 22px;font-size:.95rem}
.cta:hover{background:var(--verify-ink)}

/* section head */
.shead{display:flex;align-items:baseline;justify-content:space-between;
  margin:44px 0 14px;border-bottom:1.5px solid var(--line-strong);padding-bottom:8px}
.shead h2{font-size:1.35rem}
.shead .count{font-family:"Spline Sans Mono",monospace;font-size:.78rem;color:var(--muted)}

/* series list */
.slist{display:grid;gap:12px}
.srow{display:block;background:var(--panel);border:1px solid var(--line);
  border-radius:14px;padding:16px 18px;text-decoration:none;color:inherit;
  transition:border-color .15s,transform .15s}
.srow:hover{border-color:var(--verify);transform:translateY(-1px)}
.srow-top{display:flex;align-items:center;justify-content:space-between;gap:12px}
.srow-name{font-family:Fraunces,serif;font-weight:600;font-size:1.12rem}
.srow-brand{color:var(--muted);font-size:.82rem;margin-left:.5em;font-family:Inter}
.srow-meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;align-items:center}
.price{font-family:"Spline Sans Mono",monospace;font-weight:600;font-size:.95rem}
.chip{font-family:"Spline Sans Mono",monospace;font-size:.68rem;letter-spacing:.05em;
  border:1.4px solid var(--line-strong);border-radius:5px;padding:2px 8px;white-space:nowrap}
.chip.secret{border-color:var(--rare);color:var(--rare)}
.verify{display:inline-flex;align-items:center;gap:5px;font-family:"Spline Sans Mono",monospace;
  font-size:.68rem;letter-spacing:.04em;color:var(--verify-ink)}
.verify .dot{width:8px;height:8px;border-radius:50%;background:var(--verify)}
.verify.pending{color:var(--fake)}
.verify.pending .dot{background:var(--fake)}

/* series page */
.crumb{font-family:"Spline Sans Mono",monospace;font-size:.75rem;color:var(--muted);
  text-decoration:none;display:inline-block;margin-bottom:8px}
.ptitle{font-size:clamp(1.8rem,6vw,2.4rem);margin:.1em 0 .3em}
.ptitle .brand{display:block;font-family:"Spline Sans Mono",monospace;font-size:.8rem;
  letter-spacing:.12em;text-transform:uppercase;color:var(--verify-ink);font-weight:500;margin-bottom:.5em}
.sub{display:flex;flex-wrap:wrap;gap:10px;align-items:center;color:var(--muted);font-size:.9rem}

.block{margin-top:32px}
.block > h2{font-size:1.25rem;margin-bottom:12px;
  display:flex;align-items:baseline;gap:10px}
.block > h2 .k{font-family:"Spline Sans Mono",monospace;font-size:.7rem;color:var(--muted);letter-spacing:.1em}

/* price table */
.ptable{width:100%;border-collapse:collapse;background:var(--panel);
  border:1px solid var(--line);border-radius:12px;overflow:hidden}
.ptable th,.ptable td{text-align:left;padding:11px 14px;border-bottom:1px solid var(--line)}
.ptable tr:last-child td{border-bottom:none}
.ptable th{font-family:"Spline Sans Mono",monospace;font-size:.66rem;text-transform:uppercase;
  letter-spacing:.09em;color:var(--muted);background:#EDEFEA}
.ptable td.rng{font-family:"Spline Sans Mono",monospace;font-weight:600}
.rar{font-family:"Spline Sans Mono",monospace;font-size:.66rem;padding:2px 7px;border-radius:5px;
  border:1.3px solid var(--line-strong)}
.rar.secret{border-color:var(--rare);color:var(--rare)}
.nodata{color:var(--fake);font-family:"Spline Sans Mono",monospace;font-size:.78rem}
.ebay{display:inline-flex;align-items:center;gap:4px;font-family:"Spline Sans Mono",monospace;
  font-size:.74rem;font-weight:600;text-decoration:none;color:var(--verify-ink);
  border:1.4px solid var(--verify);border-radius:6px;padding:4px 9px}
.ebay:hover{background:var(--verify);color:#fff}

/* fake check signature */
.fc{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px}
.fc-diagram{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.fc-panel{border:1px solid var(--line);border-radius:10px;padding:12px;background:#fff}
.fc-panel figcaption{font-family:"Spline Sans Mono",monospace;font-size:.72rem;color:var(--muted);
  text-align:center;margin-top:8px}
.tag{font-weight:700;padding:1px 6px;border-radius:4px;font-size:.68rem}
.tag-real{background:#CBE9DF;color:var(--verify-ink)}
.tag-fake{background:#F6DFC9;color:var(--fake)}
.fc-tells{list-style:none;margin:18px 0 0;padding:0;display:grid;gap:9px}
.fc-tells li{display:flex;gap:10px;font-size:.92rem;line-height:1.45}
.fc-num{flex:none;width:22px;height:22px;border-radius:50%;background:var(--fake);color:#fff;
  font-family:"Spline Sans Mono",monospace;font-size:.75rem;font-weight:700;
  display:grid;place-items:center;margin-top:1px}
.fc-note{margin-top:14px;font-size:.76rem;color:var(--muted)}

/* pro */
.plan{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:20px;max-width:420px}
.plan .amt{font-family:Fraunces,serif;font-size:1.6rem}
.plan ul{margin:12px 0 18px 18px;color:var(--ink)}
.plan .fine{font-size:.82rem;color:var(--muted)}

.foot{max-width:760px;margin:0 auto;padding:22px 0 52px;border-top:1px solid var(--line);
  font-size:.76rem;color:var(--muted)}
.foot strong{color:var(--ink)}

@media(max-width:560px){
  .srow-top{flex-direction:column;align-items:flex-start;gap:6px}
}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
:focus-visible{outline:2.5px solid var(--verify);outline-offset:2px;border-radius:4px}
`;
