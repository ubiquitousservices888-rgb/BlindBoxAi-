import Link from 'next/link';

export const metadata = {
  title: 'Cookie & Privacy Notice — BlindBoxAI',
  description: 'Plain-language information about browser storage and optional analytics on BlindBoxAI.',
};

export default function CookieNoticePage() {
  return (
    <main>
      <Link className="crumb" href="/">← BlindBoxAI</Link>
      <section className="hero">
        <p className="eyebrow">Privacy controls</p>
        <h1>Cookie & privacy notice</h1>
        <p>
          BlindBoxAI keeps optional tracking off unless you choose to allow it. This page explains the browser storage and analytics controls used by the site.
        </p>
      </section>

      <section className="block">
        <h2>Essential storage</h2>
        <p>
          The site stores your privacy choice in your browser so it does not need to ask you again on every page. This preference is used only to remember that choice.
        </p>
      </section>

      <section className="block">
        <h2>Optional analytics</h2>
        <p>
          Optional analytics are intended to measure aggregate site usage, such as which pages receive visits. The consent control is designed to keep this optional analytics component off unless you allow it.
        </p>
      </section>

      <section className="block">
        <h2>Affiliate links</h2>
        <p>
          Some outbound links may be affiliate links. If you follow one, the destination marketplace may use its own cookies or similar technologies under its own privacy terms. BlindBoxAI does not control cookies set after you leave this site.
        </p>
      </section>

      <section className="block">
        <h2>Change your choice</h2>
        <p>
          Use the <strong>Privacy settings</strong> button shown on the site to reopen the consent control and change your analytics choice.
        </p>
      </section>

      <section className="block">
        <p className="fc-note">
          This notice describes the site configuration; it is not a representation that one banner by itself satisfies every privacy law in every jurisdiction.
        </p>
      </section>
    </main>
  );
}
