export default function PublishedVideoStyles() {
  return <style>{CSS}</style>;
}

const CSS = `
.bv-videos{max-width:1180px;margin:0 auto;padding:72px 18px;border-top:1px solid #e2ebe9}
.bv-video-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.bv-video-card{overflow:hidden;border:1px solid #dce6e4;border-radius:14px;background:#fbfdfc;box-shadow:0 10px 24px rgba(15,55,52,.05)}
.bv-video-card video{display:block;width:100%;aspect-ratio:9/16;max-height:430px;background:#0e1514;object-fit:cover}
.bv-video-copy{padding:16px 17px 18px}
.bv-video-copy>span{display:inline-block;font-size:.62rem;letter-spacing:.12em;font-weight:800;color:#087f7b;margin-bottom:8px}
.bv-video-copy h3{font-size:1rem;line-height:1.2;margin:0 0 8px}
.bv-video-copy p{font-size:.76rem;line-height:1.55;margin:0}
.bv-video-empty{border:1px dashed #b9ceca;border-radius:14px;background:#f3f9f7;padding:28px}
.bv-video-empty strong{display:block;font-size:1rem;margin-bottom:6px}
.bv-video-empty p{font-size:.84rem;max-width:70ch;line-height:1.6}
@media(max-width:900px){.bv-video-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:640px){.bv-videos{padding:54px 18px}.bv-video-grid{grid-template-columns:1fr}.bv-video-card video{max-height:none}}
`;
