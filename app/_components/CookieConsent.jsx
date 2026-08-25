'use client';

import { useEffect, useRef, useState } from 'react';
import { Analytics } from '@vercel/analytics/next';

const STORAGE_KEY = 'blindboxai_consent_v1';

function readConsent() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      necessary: true,
      analytics: parsed?.analytics === true,
      updatedAt: parsed?.updatedAt || null,
    };
  } catch {
    return null;
  }
}

function saveConsent(analytics) {
  const value = {
    necessary: true,
    analytics: analytics === true,
    updatedAt: new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in hardened/private browser contexts. The
    // runtime choice still applies for this page session even if persistence
    // is unavailable.
  }

  window.dispatchEvent(new CustomEvent('blindboxai:consent', { detail: value }));
  return value;
}

export default function CookieConsent() {
  const [consent, setConsent] = useState(undefined);
  const [showSettings, setShowSettings] = useState(false);
  const dialogRef = useRef(null);
  const dialogOpen = consent === null || showSettings;

  useEffect(() => {
    setConsent(readConsent());

    const openSettings = () => setShowSettings(true);
    window.addEventListener('blindboxai:open-consent', openSettings);
    return () => window.removeEventListener('blindboxai:open-consent', openSettings);
  }, []);

  useEffect(() => {
    if (!dialogOpen || !dialogRef.current) return undefined;

    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    const getFocusable = () => Array.from(
      dialog.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );

    const focusable = getFocusable();
    (focusable[0] || dialog).focus();

    const onKeyDown = (event) => {
      if (event.key !== 'Tab') return;

      const items = getFocusable();
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    dialog.addEventListener('keydown', onKeyDown);
    return () => {
      dialog.removeEventListener('keydown', onKeyDown);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, [dialogOpen]);

  const choose = (analytics) => {
    setConsent(saveConsent(analytics));
    setShowSettings(false);
  };

  return (
    <>
      {consent?.analytics ? <Analytics /> : null}

      {dialogOpen && (
        <div className="consent-backdrop" role="presentation">
          <section
            ref={dialogRef}
            className="consent-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="consent-title"
            aria-describedby="consent-copy"
            tabIndex={-1}
          >
            <p className="consent-kicker">Privacy controls</p>
            <h2 id="consent-title">Your choice comes first.</h2>
            <p id="consent-copy">
              BlindBoxAI uses essential browser storage to remember your privacy choice. Optional analytics stay off unless you allow them.
            </p>

            <div className="consent-actions">
              <button type="button" className="consent-primary" onClick={() => choose(true)}>
                Accept optional analytics
              </button>
              <button type="button" className="consent-secondary" onClick={() => choose(false)}>
                Reject optional analytics
              </button>
            </div>

            <p className="consent-fine">
              You can change this choice anytime from Privacy settings in the footer. See the <a href="/cookies">cookie & privacy notice</a>.
            </p>
          </section>
        </div>
      )}

      <style jsx global>{`
        .consent-backdrop{position:fixed;inset:0;z-index:9999;display:flex;align-items:flex-end;justify-content:center;padding:18px;background:rgba(10,12,14,.48)}
        .consent-card{width:min(680px,100%);background:#FBFCFA;color:#16181C;border:1px solid #C2C6BB;border-radius:16px;padding:20px;box-shadow:0 24px 70px rgba(0,0,0,.24)}
        .consent-kicker{font:600 .72rem/1.2 "Spline Sans Mono",ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#0A5C4B;margin-bottom:8px}
        .consent-card h2{font-size:1.45rem;margin-bottom:8px}
        .consent-card p{margin:0;color:#5E635C}
        .consent-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}
        .consent-actions button{cursor:pointer;border-radius:999px;padding:11px 16px;font:600 .9rem/1 Inter,system-ui,sans-serif}
        .consent-primary{border:1px solid #0E7C66;background:#0E7C66;color:white}
        .consent-secondary{border:1px solid #C2C6BB;background:white;color:#16181C}
        .consent-fine{font-size:.78rem!important;margin-top:14px!important}
        @media(max-width:560px){.consent-actions{display:grid}.consent-actions button{width:100%}}
      `}</style>
    </>
  );
}

export function openBlindBoxPrivacySettings() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('blindboxai:open-consent'));
  }
}
