import Link from 'next/link';
import CookieConsent from './_components/CookieConsent';
import PrivacySettingsButton from './_components/PrivacySettingsButton';
import SiteHeader from './_components/SiteHeader';
import BrandMark from './_components/BrandMark';
import { FAKE_CHECK_GUIDE } from '../lib/site-links.mjs';

const SITE_DESCRIPTION =
  "Independent reference for blind box resellers: US-sold resale ranges, manufacturer pull odds, and per-series counterfeit inspection guides.";

export const metadata = {
  metadataBase: new URL("https://www.blindboxai.com"),
  title: "BlindBoxAI — resale prices, pull odds & fake checks",
  description: SITE_DESCRIPTION,
  applicationName: "BlindBoxAI",
  // Title and description are left to each page so a shared link previews
  // that page's own title; the share image comes from app/opengraph-image.jsx.
  openGraph: { type: "website", siteName: "BlindBoxAI" },
  twitter: { card: "summary_large_image" },
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
        <SiteHeader />
        {children}
        <footer className="foot">
          <div className="foot-grid">
            <div className="foot-about">
              <Link className="foot-brand" href="/"><BrandMark size={30} /> <span>BlindBoxAI</span></Link>
              <p>Sold-price evidence and fake checks for blind boxes, trading cards and collectibles. Missing evidence stays marked as missing.</p>
            </div>
            <nav aria-label="Explore">
              <h2>Explore</h2>
              <Link href="/#knowledge">Price guides</Link>
              <Link href="/#collectibles">Verified sales</Link>
              <Link href="/tools/buy-or-pass">Buy or pass</Link>
              <Link href="/tools/resale-margin">Resale margin tool</Link>
            </nav>
            <nav aria-label="Guides">
              <h2>Guides</h2>
              <a href={FAKE_CHECK_GUIDE.url} target="_blank" rel="noopener">Fake-Check Field Guide ↗</a>
              <Link href="/guides/mew-ex-152-vs-158">Mew ex #152 vs #158</Link>
              <Link href="/ask">Ask Mr. Know It All</Link>
            </nav>
            <nav aria-label="Shop">
              <h2>Shop</h2>
              <Link href="/shop/accessories">Display &amp; storage</Link>
              <Link href="/pro">Pro</Link>
              <Link href="/#about">How we verify</Link>
            </nav>
          </div>
          <p className="foot-legal">
            <strong>BlindBoxAI</strong> is an independent reference site. Not affiliated with,
            sponsored, or endorsed by any brand named here — brand and series names are used only
            to identify the products they refer to. Prices are US-sold estimates, not offers.
            Not financial advice.
          </p>
          <span className="foot-actions">
            <a href="/cookies">Cookie & privacy notice</a>
            <PrivacySettingsButton />
          </span>
        </footer>
        <CookieConsent />
      </body>
    </html>
  );
}
const CSS = `
:root{
  --paper:#F6F9F8; --panel:#FFFFFF; --ink:#16181C; --muted:#5E635C;
  --verify:#0E7C66; --verify-ink:#0A5C4B; --fake:#B4560A; --rare:#5B4FC9;
  --line:#DCE5E3; --line-strong:#C3D2CF; --head:#0C1A19; --teal:#0B9794;
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
.verify.pending{color:var(--muted)}
.verify.pending .dot{background:#B8C4C1}

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
.nodata{color:var(--muted);font-family:"Spline Sans Mono",monospace;font-size:.78rem}
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
.fc-guide{margin-top:16px;display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap;background:#0C1A19;color:#C4D9D6;border-radius:12px;padding:14px 16px}
.fc-guide strong{color:#fff}
.fc-guide p{font-size:.82rem;line-height:1.5;margin-top:4px;max-width:52ch}
.fc-guide a{flex:none;background:var(--teal);color:#04201F;text-decoration:none;font-weight:700;font-size:.84rem;border-radius:999px;padding:10px 16px}

/* pro */
.plan{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:20px;max-width:420px}
.plan .amt{font-family:Fraunces,serif;font-size:1.6rem}
.plan ul{margin:12px 0 18px 18px;color:var(--ink)}
.plan .fine{font-size:.82rem;color:var(--muted)}

.foot{margin:0 -18px;padding:52px max(18px,calc((100vw - 1180px)/2)) 40px;background:var(--head);color:#A9BDBA;font-size:.8rem}
.foot a{color:#DCEDEA;text-decoration:none}
.foot a:hover{color:#fff;text-decoration:underline}
.foot strong{color:#fff}
.foot-grid{display:grid;grid-template-columns:1.6fr repeat(3,1fr);gap:32px;padding-bottom:32px;border-bottom:1px solid #233836}
.foot-grid nav{display:flex;flex-direction:column;gap:9px}
.foot-grid h2{font-family:Inter,system-ui,sans-serif;font-size:.68rem;letter-spacing:.16em;text-transform:uppercase;color:#7FD6CF;margin-bottom:4px}
.foot-brand{display:inline-flex;align-items:center;gap:10px;font-weight:800;font-size:1.05rem;color:#fff!important}
.foot-about p{margin-top:12px;max-width:36ch;line-height:1.6}
.foot-legal{margin-top:22px;max-width:90ch;line-height:1.6}
.foot-actions{display:flex;flex-wrap:wrap;gap:14px;align-items:center;margin-top:12px}
.privacy-settings-button{appearance:none;border:0;background:transparent;padding:0;color:#DCEDEA;font:inherit;text-decoration:underline;text-underline-offset:2px;cursor:pointer}

/* site header */
.site-head{margin:0 -18px;position:sticky;top:0;z-index:40;background:rgba(12,26,25,.94);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid #1E3533}
.site-head-in{max-width:1180px;margin:0 auto;padding:0 18px;min-height:66px;display:flex;align-items:center;gap:26px}
.site-brand{display:inline-flex;align-items:center;gap:10px;color:#fff;text-decoration:none;font-weight:800;font-size:1.08rem;letter-spacing:-.01em}
.site-brand b{color:#5FD7CE}
.site-nav{display:flex;gap:24px;margin-left:auto}
.site-nav a{color:#CFE2DF;text-decoration:none;font-size:.86rem;font-weight:500}
.site-nav a:hover{color:#fff}
.site-cta{background:var(--teal);color:#04201F;text-decoration:none;font-weight:700;font-size:.84rem;padding:10px 16px;border-radius:999px;white-space:nowrap}
.site-cta:hover{background:#2BB3AE}
.site-menu{display:none;position:relative}
.site-menu summary{list-style:none;cursor:pointer;width:42px;height:42px;border-radius:10px;border:1px solid #2A4442;display:grid;place-content:center;gap:5px}
.site-menu summary::-webkit-details-marker{display:none}
.site-menu summary span{display:block;width:18px;height:2px;background:#E3F1EF;border-radius:2px}
.site-menu nav{position:absolute;right:0;top:52px;min-width:220px;background:#0F2221;border:1px solid #2A4442;border-radius:14px;padding:8px;display:flex;flex-direction:column;box-shadow:0 18px 40px rgba(0,0,0,.35)}
.site-menu nav a{color:#E3F1EF;text-decoration:none;padding:12px 14px;border-radius:8px;font-size:.95rem}
.site-menu nav a:hover{background:#18302E}

/* image slots */
.ui-slot{position:relative;overflow:hidden;border-radius:12px;aspect-ratio:4/3;background:#E7F4F1}
.ui-slot img,.ui-slot .ui-art{display:block;width:100%;height:100%;object-fit:cover}
.ui-slot-has-image img{object-fit:contain;padding:7% 10% 4%}
.ui-slot-dark.ui-slot-has-image{background:radial-gradient(circle at 50% 38%,#F4FBF9 0,#DDEFEB 55%,#C9E4DE 100%)}
.ui-art-glow{fill:#CDEBE4}.ui-art-glow-2{fill:#D9EFEA}
.ui-art-ink{fill:none;stroke:#0E2F2D;stroke-width:3;stroke-linejoin:round;stroke-linecap:round}
.ui-art-fill{fill:#FFFFFF}.ui-art-fill-2{fill:#9FDCD2}
.ui-art-thin{stroke-width:2;opacity:.7}
.ui-art-dot{fill:#0E2F2D;stroke:none}
.ui-art-q{fill:#0B9794;stroke:none;font:800 30px Inter,system-ui,sans-serif}
.ui-slot-amber{background:#FBF0DA}.ui-slot-amber .ui-art-glow{fill:#F7DFAE}.ui-slot-amber .ui-art-glow-2{fill:#F9E8C6}.ui-slot-amber .ui-art-fill-2{fill:#F2B544}
.ui-slot-violet{background:#EEEAFE}.ui-slot-violet .ui-art-glow{fill:#DDD5FF}.ui-slot-violet .ui-art-glow-2{fill:#E6E0FF}.ui-slot-violet .ui-art-fill-2{fill:#B9A7FF}
.ui-slot-dark{background:#132826}.ui-slot-dark .ui-art-glow{fill:#1B3936}.ui-slot-dark .ui-art-glow-2{fill:#163230}.ui-slot-dark .ui-art-ink{stroke:#BFEDE6}.ui-slot-dark .ui-art-fill{fill:#0F2221}.ui-slot-dark .ui-art-dot{fill:#BFEDE6}

@media(max-width:900px){
  .site-nav,.site-cta{display:none}
  .site-menu{display:block;margin-left:auto}
  .foot-grid{grid-template-columns:1fr 1fr}
  .foot-about{grid-column:1/-1}
}

@media(max-width:560px){
  .srow-top{flex-direction:column;align-items:flex-start;gap:6px}
}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
:focus-visible{outline:2.5px solid var(--verify);outline-offset:2px;border-radius:4px}
`;
