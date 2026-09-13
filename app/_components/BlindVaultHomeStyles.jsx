export default function BlindVaultHomeStyles() {
  return <style>{CSS}</style>;
}

const CSS = `
.bv-home{max-width:none;margin:0 -18px;padding:0;background:#f7fbfa;color:#151b1b;font-family:Inter,system-ui,sans-serif}
.bv-home h1,.bv-home h2,.bv-home h3{font-family:Inter,system-ui,sans-serif;letter-spacing:-.035em;color:#101717}
.bv-home p{color:#46504f}
.bv-nav{min-height:70px;padding:0 max(18px,calc((100vw - 1180px)/2));display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:28px;border-bottom:1px solid #dde7e5;background:rgba(247,251,250,.96);position:sticky;top:0;z-index:30;backdrop-filter:blur(10px)}
.bv-brand{font-weight:800;color:#101717;text-decoration:none;font-size:1.05rem}
.bv-nav nav{display:flex;justify-content:flex-end;gap:28px}
.bv-nav nav a{font-size:.84rem;color:#202929;text-decoration:none}
.bv-nav-cta,.bv-button{display:inline-flex;align-items:center;justify-content:center;border-radius:4px;text-decoration:none;font-weight:650;transition:transform .15s,background .15s,border-color .15s}
.bv-nav-cta{background:#0b9794;color:#061515;padding:11px 16px;font-size:.82rem}
.bv-nav-cta:hover,.bv-button:hover{transform:translateY(-1px)}
.bv-hero{max-width:1180px;margin:0 auto;padding:74px 18px 68px;display:grid;grid-template-columns:minmax(0,.9fr) minmax(420px,1.1fr);gap:60px;align-items:center}
.bv-kicker{font-size:.7rem!important;letter-spacing:.22em;text-transform:uppercase;font-weight:800;color:#0c8c88!important;margin-bottom:16px}
.bv-hero h1{font-size:clamp(2.8rem,6vw,5.3rem);line-height:.96;max-width:10ch;margin-bottom:24px}
.bv-lead{font-size:1.04rem;max-width:58ch;line-height:1.7}
.bv-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}
.bv-button{padding:12px 20px;border:1px solid transparent;font-size:.86rem}
.bv-button-primary{background:#078d8a;color:#081818}
.bv-button-secondary{background:#fbfdfc;border-color:#d8e3e1;color:#172020}
.bv-button-light{background:#e6efec;color:#16201f;margin-top:18px}
.bv-micro{font-size:.75rem;margin-top:14px}
.bv-vault-visual{min-height:430px;border-radius:24px;position:relative;overflow:hidden;background:radial-gradient(circle at 63% 48%,#60452c 0 7%,#151817 8% 20%,transparent 21%),linear-gradient(140deg,#2a2019 0,#111514 43%,#263332 100%);box-shadow:0 28px 60px rgba(17,26,25,.18);padding:28px}
.bv-vault-grid{position:absolute;inset:28px 42% 90px 28px;display:grid;grid-template-columns:1fr 1fr;gap:10px}
.bv-mini-card{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.07);border-radius:10px;padding:14px;display:flex;flex-direction:column;justify-content:flex-end;min-height:100px;color:white}
.bv-mini-card span{font-size:.58rem;letter-spacing:.16em;color:#8fe0d8}
.bv-mini-card strong{font-size:.82rem;margin-top:5px}
.bv-safe-door{position:absolute;right:7%;top:13%;width:38%;aspect-ratio:1/1.25;border:2px solid #6b6d64;border-radius:8px;background:linear-gradient(145deg,#232927,#0d1110);box-shadow:inset 0 0 0 12px #171c1a,0 18px 35px rgba(0,0,0,.35);display:grid;place-items:center}
.bv-safe-ring{width:57%;aspect-ratio:1;border:7px solid #7f8277;border-radius:50%;display:grid;place-items:center;box-shadow:0 0 0 5px #252a27,inset 0 0 18px #000}
.bv-safe-hub{width:46%;aspect-ratio:1;border-radius:50%;display:grid;place-items:center;background:#a58662;color:#101514;font-weight:900;letter-spacing:.12em}
.bv-evidence-note{position:absolute;left:28px;bottom:26px;background:#eef3f1;border-radius:8px;padding:14px 16px;max-width:290px;box-shadow:0 8px 18px rgba(0,0,0,.16)}
.bv-evidence-note span{font-size:.6rem;text-transform:uppercase;letter-spacing:.14em;color:#0b8784;font-weight:800}
.bv-evidence-note p{font-size:.76rem!important;margin-top:4px;color:#25302f!important;line-height:1.45}
.bv-standard{border-top:1px solid #e0e8e7;border-bottom:1px solid #e0e8e7;display:grid;grid-template-columns:1.5fr repeat(3,1fr);max-width:none;padding:46px max(18px,calc((100vw - 1180px)/2));gap:0;background:#f8fbfa}
.bv-standard>div{padding:0 26px;border-left:1px solid #e0e8e7}
.bv-standard>div:first-child{border-left:0;padding-left:0}
.bv-standard h2{font-size:1.65rem}
.bv-standard-item strong{font-size:.88rem}
.bv-standard-item p{font-size:.76rem;line-height:1.6;margin-top:7px}
.bv-workflow,.bv-research,.bv-depth,.bv-faq{max-width:1180px;margin:0 auto;padding:78px 18px}
.bv-section-intro{max-width:640px}
.bv-section-intro h2,.bv-section-head h2,.bv-faq h2{font-size:clamp(2rem,4vw,3.2rem);line-height:1.02;margin-bottom:18px}
.bv-section-intro>p:last-child{line-height:1.7}
.bv-steps{margin-top:42px;border-left:1px solid #dce6e4}
.bv-step{display:grid;grid-template-columns:58px 1fr;gap:0;padding:22px 0 22px 0;position:relative}
.bv-step-no{width:30px;height:30px;border:1px solid #d4e2df;border-radius:50%;display:grid;place-items:center;background:#f7fbfa;color:#0c9692;font-size:.66rem;position:relative;left:-15px}
.bv-step h3{font-size:1.12rem;letter-spacing:-.02em}
.bv-step p{font-size:.88rem;margin-top:7px;max-width:68ch}
.bv-text-link{display:inline-block;margin-top:20px;color:#087e7a;font-weight:700;text-decoration:none}
.bv-research{border-top:1px solid #e3ebea}
.bv-section-head{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;margin-bottom:30px}
.bv-section-head>span{font-size:.72rem;color:#66716f;text-transform:uppercase;letter-spacing:.12em;white-space:nowrap}
.bv-series-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.bv-series-card{border:1px solid #dce5e3;border-radius:10px;background:#fbfdfc;padding:18px;text-decoration:none;color:inherit}
.bv-series-card:hover{border-color:#0d9995}
.bv-series-top{display:flex;justify-content:space-between;gap:18px}
.bv-series-top>div{display:flex;flex-direction:column}
.bv-series-top strong{font-size:1rem}
.bv-series-top span{font-size:.72rem;color:#687270;margin-top:2px}
.bv-series-top b{font-size:.82rem;white-space:nowrap}
.bv-series-meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:14px}
.bv-chip,.bv-status{font-size:.65rem;letter-spacing:.04em}
.bv-chip{border:1px solid #7164bd;color:#5f50b3;border-radius:4px;padding:2px 6px}
.bv-status{color:#087d70}
.bv-status-pending{color:#a55c19}
.bv-depth{border-top:1px solid #e1e9e7}
.bv-plan-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:38px}
.bv-plan-card{background:#fbfdfc;border:1px solid #dbe5e3;border-radius:10px;padding:28px}
.bv-plan-card>span{font-size:.68rem;font-weight:800;letter-spacing:.1em}
.bv-plan-card>span em{font-style:normal;background:#dcefed;color:#087d79;border-radius:999px;padding:4px 8px;margin-left:8px;font-size:.58rem}
.bv-plan-card h3{font-size:2rem;margin:8px 0 6px}
.bv-plan-card h3 span{font-size:.82rem;letter-spacing:0;color:#4c5755;font-weight:500}
.bv-plan-card p{font-size:.86rem}
.bv-plan-card ul{list-style:none;padding:0;margin:22px 0;display:grid;grid-template-columns:1fr 1fr;gap:9px 18px;font-size:.78rem}
.bv-plan-card li:before{content:'✓';color:#078e89;margin-right:8px}
.bv-plan-featured{border-color:#14a5a0;box-shadow:0 12px 28px rgba(11,118,114,.09)}
.bv-faq{text-align:center;border-top:1px solid #e2eae9}
.bv-faq-list{max-width:820px;margin:34px auto 0;text-align:left}
.bv-faq details{border-bottom:1px solid #dfe7e6;padding:18px 0}
.bv-faq summary{font-size:.87rem;cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:20px}
.bv-faq summary:after{content:'⌄';color:#44504e}
.bv-faq details p{font-size:.82rem;line-height:1.65;padding-top:12px;max-width:70ch}
.bv-final-cta{max-width:1180px;margin:20px auto 70px;padding:60px 50px;border-radius:24px;background:#078e8a;min-height:300px;display:flex;flex-direction:column;justify-content:center}
.bv-final-cta .bv-kicker{color:#0b2928!important}
.bv-final-cta h2{font-size:clamp(2.3rem,5vw,4.1rem);line-height:.98;max-width:13ch;color:#0b1b1a}
.bv-final-cta p{max-width:58ch;color:#153735;margin-top:16px}
.bv-final-cta .bv-button{align-self:flex-start}
@media(max-width:900px){
  .bv-nav{grid-template-columns:1fr auto}.bv-nav nav{display:none}
  .bv-hero{grid-template-columns:1fr;padding-top:46px}.bv-vault-visual{min-height:380px}
  .bv-standard{grid-template-columns:1fr 1fr}.bv-standard>div{border-left:0;border-top:1px solid #e0e8e7;padding:22px 18px}.bv-standard>div:first-child{grid-column:1/-1;border-top:0;padding-left:18px}
}
@media(max-width:640px){
  .bv-nav{min-height:62px;gap:12px}.bv-nav-cta{padding:9px 11px;font-size:.72rem}
  .bv-hero{padding:38px 18px 48px;gap:34px}.bv-hero h1{font-size:2.75rem}.bv-lead{font-size:.94rem}
  .bv-vault-visual{min-height:330px;padding:18px}.bv-vault-grid{inset:18px 43% 84px 18px;grid-template-columns:1fr}.bv-mini-card{min-height:62px;padding:10px}.bv-mini-card:nth-child(n+3){display:none}.bv-safe-door{width:42%;right:5%;top:16%}.bv-evidence-note{left:18px;bottom:18px;max-width:250px}
  .bv-standard{grid-template-columns:1fr}.bv-standard>div:first-child{grid-column:auto}.bv-standard>div{padding:20px 18px}
  .bv-workflow,.bv-research,.bv-depth,.bv-faq{padding:58px 18px}
  .bv-series-grid,.bv-plan-grid{grid-template-columns:1fr}.bv-section-head{align-items:flex-start;flex-direction:column}.bv-plan-card ul{grid-template-columns:1fr}
  .bv-final-cta{margin:10px 18px 60px;padding:42px 28px;min-height:320px;border-radius:20px}.bv-final-cta h2{font-size:2.65rem}
}
@media(prefers-reduced-motion:reduce){.bv-home *{transition:none!important}}
`;
