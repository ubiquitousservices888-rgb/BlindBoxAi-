"use client";

import CoreAnalytics from "./_components/CoreAnalytics";

export default function Template({ children }) {
  return (
    <>
      <CoreAnalytics />
      {children}
    </>
  );
}
