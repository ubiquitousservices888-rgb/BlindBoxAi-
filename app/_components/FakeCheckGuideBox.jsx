import Link from "next/link";

import { FAKE_CHECK_GUIDE, fakeCheckGuidePagePath } from "../../lib/fake-check-guide.mjs";

// Small promo box for BlindBoxAI's own $7 guide. It links to the guide's sales
// page (not straight to checkout) so the visitor sees what they are buying.
export default function FakeCheckGuideBox({ attribution = {}, from }) {
  return (
    <aside
      data-testid="fake-check-guide-box"
      style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px", margin: "18px 0" }}
    >
      <p style={{ margin: "0 0 6px", fontWeight: 700 }}>Want the full printable checklist?</p>
      <p style={{ margin: "0 0 10px", lineHeight: 1.5 }}>
        {FAKE_CHECK_GUIDE.shortName}: {FAKE_CHECK_GUIDE.promoSummary} ${FAKE_CHECK_GUIDE.priceUsd} PDF.
      </p>
      <Link href={fakeCheckGuidePagePath(attribution, from)}>See what's inside →</Link>
    </aside>
  );
}
