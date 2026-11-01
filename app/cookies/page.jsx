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
          Optional Vercel Analytics and PostHog are loaded only after you accept optional analytics. They measure page visits, normalized traffic and campaign labels, appraisal lookup starts and outcomes (counts and evidence freshness), audience research participation (whether raw or graded amounts were entered), marketplace-intent clicks, and successful new waitlist signups. These events do not include your appraisal question, submitted waitlist email, offer amounts, or photos.
        </p>
        <p>
          PostHog uses random browser and session identifiers to connect consented visits and events. Production analytics are sent to PostHog's US service. Its current project setting does not anonymize IP addresses, so PostHog may process your IP address and browser or connection metadata in the United States when analytics are enabled. Query strings and referrer paths are removed from PostHog analytics URLs before events are sent. Rejecting analytics prevents these optional browser analytics from starting; you can change your choice from Privacy settings at any time.
        </p>
      </section>

      <section className="block">
        <h2>Reseller tools waitlist</h2>
        <p>
          If you join the reseller tools waitlist, BlindBoxAI stores the email address
          you submit so Ubiquitous Enlightened Services can notify you about those tools.
          Waitlist emails are not placed into analytics or affiliate telemetry. Campaign
          and source labels may be stored separately to measure where signups came from.
        </p>
        <p>
          Waitlist messages will include an unsubscribe option. You can opt out at any
          time, and the address will no longer be used for waitlist marketing messages.
        </p>
      </section>

      <section className="block">
        <h2>Affiliate links</h2>
        <p>
          Some outbound links may be affiliate links. If you follow one, the destination marketplace may use its own cookies or similar technologies under its own privacy terms. BlindBoxAI does not control cookies set after you leave this site.
        </p>
        <p>
          When you choose an affiliate link, BlindBoxAI may record a first-party outbound-click event so the owner can reconcile aggregate affiliate reporting. The application event can include the marketplace, offer, campaign/source label, and click time. It does not store your email, IP address, cookies, account or user ID, user agent, or referrer. This operational affiliate record is separate from optional site analytics.
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
