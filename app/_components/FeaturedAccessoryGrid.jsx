import Link from "next/link";
import { allAmazonAccessoryOffers } from "../../lib/amazon-associates.mjs";

// Text-only first: never embed or cache Amazon/eBay listing images.
const STYLES = "\n.bv-featured{max-width:1180px;margin:0 auto 18px;padding:28px 18px 54px;scroll-margin-top:90px}\n.bv-featured-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:20px}\n.bv-featured-head h2{font-size:clamp(1.8rem,3.6vw,2.8rem);line-height:1.06;margin:0}\n.bv-featured-view{font-weight:750;color:#087e7a;text-decoration:none;font-size:.84rem}\n.bv-featured-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,208px),1fr));gap:14px}\n.bv-featured-card{display:flex;flex-direction:column;min-height:230px;border:1px solid #d6e6e2;border-radius:15px;padding:20px;color:#101717;background:linear-gradient(135deg,#fff 0%,#e9f5f0 100%);text-decoration:none;transition:border-color .15s,transform .15s}\n.bv-featured-card:hover,.bv-featured-card:focus-visible{border-color:#0b9794;transform:translateY(-2px)}\n.bv-featured-number{align-self:flex-start;border:1px solid #b8dad3;background:#def2eb;color:#076f6b;font-weight:850;font-size:.72rem;padding:5px 8px;border-radius:6px;margin-bottom:18px}\n.bv-featured-card h3{font-size:1.06rem;line-height:1.18;margin:0 0 10px}\n.bv-featured-card p{font-size:.81rem;line-height:1.45;margin:0}\n.bv-featured-action{color:#087e7a;font-size:.83rem;font-weight:800;margin-top:auto;padding-top:20px}\n.bv-featured-note{font-size:.75rem;margin:18px 0 0;line-height:1.5;color:#4c5b57}\n@media(max-width:640px){.bv-featured{padding:22px 18px 42px}.bv-featured-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.bv-featured-card{min-height:210px;padding:14px}.bv-featured-card h3{font-size:.93rem}.bv-featured-card p{font-size:.72rem}.bv-featured-number{margin-bottom:14px}}\n@media(max-width:370px){.bv-featured-grid{grid-template-columns:1fr}.bv-featured-card{min-height:155px}}\n@media(prefers-reduced-motion:reduce){.bv-featured-card{transition:none}}\n";

export default function FeaturedAccessoryGrid() {
  const offers = allAmazonAccessoryOffers();

  return (
    <section className="bv-featured" id="collector-essentials" aria-labelledby="collector-essentials-heading">
      <style>{STYLES}</style>
      <div className="bv-featured-head">
        <div>
          <p className="bv-kicker">Shop collector accessories</p>
          <h2 id="collector-essentials-heading">Featured collector essentials.</h2>
        </div>
        <Link className="bv-featured-view" href="/shop/accessories?campaign=home-collector-essentials&source=homepage">
          View all accessories →
        </Link>
      </div>
      <div className="bv-featured-grid">
        {offers.map((offer) => (
          <Link
            className="bv-featured-card"
            key={offer.id}
            href={"/shop/accessories?campaign=home-collector-essentials&source=homepage#" + encodeURIComponent(offer.id)}
          >
            <span className="bv-featured-number" aria-hidden="true">COLLECTOR PICK</span>
            <h3>{offer.title}</h3>
            <p>{offer.useCase}</p>
            <span className="bv-featured-action">See current options →</span>
          </Link>
        ))}
      </div>
      <p className="bv-featured-note">
        Featured categories, not a sales ranking. Prices and availability are shown by the retailer, not estimated here.
        {" "}Affiliate disclosure: As an Amazon Associate I earn from qualifying purchases.
      </p>
    </section>
  );
}
