"use client";

import CoreAnalytics from "./_components/CoreAnalytics";

// Production entry marker: analytics wrapper is intentionally deterministic and client-only.
export default function Template({ children }) {
  return (
    <>
      <CoreAnalytics />
      {children}
    </>
  );
}
