import Link from "next/link";
import BrandMark from "./BrandMark";
import { PRIMARY_NAV } from "../../lib/site-links.mjs";

// Site-wide header. The mobile menu is a native <details> element, so it works
// without any client-side JavaScript.
export default function SiteHeader() {
  return (
    <header className="site-head">
      <div className="site-head-in">
        <Link className="site-brand" href="/" aria-label="BlindBoxAI home">
          <BrandMark size={34} />
          <span>BlindBox<b>AI</b></span>
        </Link>
        <nav className="site-nav" aria-label="Primary navigation">
          {PRIMARY_NAV.map((item) => (
            <Link key={item.href} href={item.href}>{item.label}</Link>
          ))}
        </nav>
        <Link className="site-cta" href="/ask">Ask a question</Link>
        <details className="site-menu">
          <summary aria-label="Open menu"><span /><span /><span /></summary>
          <nav aria-label="Mobile navigation">
            {PRIMARY_NAV.map((item) => (
              <Link key={item.href} href={item.href}>{item.label}</Link>
            ))}
            <Link href="/ask">Ask Mr. Know It All</Link>
          </nav>
        </details>
      </div>
    </header>
  );
}
