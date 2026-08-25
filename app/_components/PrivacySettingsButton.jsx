'use client';

export default function PrivacySettingsButton() {
  return (
    <button
      type="button"
      className="privacy-settings-button"
      onClick={() => window.dispatchEvent(new Event('blindboxai:open-consent'))}
    >
      Privacy settings
    </button>
  );
}
