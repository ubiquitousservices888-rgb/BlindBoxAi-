#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

INPUT="${1:-}"
PRODUCT_ID="${2:-labubu-hair-salon-vinyl-plush-pendant}"
SCOPE="${VERCEL_SCOPE:-ubiquitious-enlightened-services-projects}"
PROJECT="${VERCEL_PROJECT:-blindboxai}"
PICKED="$HOME/blindboxai-incoming.mp4"

if [[ -z "$INPUT" ]]; then
  command -v termux-storage-get >/dev/null 2>&1 || {
    echo "No video path supplied and termux-storage-get is unavailable." >&2
    echo "Install Termux:API app + package, or pass the MP4 path as argument 1." >&2
    exit 1
  }
  rm -f "$PICKED"
  echo "Select the NotebookLM MP4 in Android's file picker..."
  termux-storage-get "$PICKED"
  INPUT="$PICKED"
fi

[[ -f "$INPUT" ]] || { echo "Video not found: $INPUT" >&2; exit 1; }

if [[ ! -d node_modules ]]; then
  npm ci
fi

need_env=0
for key in BLOB_READ_WRITE_TOKEN BUFFER_API_TOKEN BUFFER_ORGANIZATION_ID NEXT_PUBLIC_EPN_CAMPID; do
  if ! node --env-file-if-exists=.env.local -e "process.exit(process.env.$key ? 0 : 1)" 2>/dev/null; then
    need_env=1
  fi
done

if [[ "$need_env" -eq 1 ]]; then
  echo "Linking BlindBoxAI and pulling production environment..."
  npx vercel@latest link --yes --project "$PROJECT" --scope "$SCOPE"
  npx vercel@latest env pull .env.local --environment=production --yes --scope "$SCOPE"
fi

if ! node --env-file-if-exists=.env.local -e 'process.exit(process.env.GEMINI_API_KEY ? 0 : 1)' 2>/dev/null; then
  printf "Paste Gemini API key (stored only in local .env.local): "
  IFS= read -r -s GEMINI_KEY
  printf "\n"
  [[ -n "$GEMINI_KEY" ]] || { echo "GEMINI_API_KEY is required." >&2; exit 1; }
  printf '\nGEMINI_API_KEY=%s\n' "$GEMINI_KEY" >> .env.local
  unset GEMINI_KEY
fi

missing=()
for key in BLOB_READ_WRITE_TOKEN BUFFER_API_TOKEN BUFFER_ORGANIZATION_ID NEXT_PUBLIC_EPN_CAMPID GEMINI_API_KEY; do
  if ! node --env-file-if-exists=.env.local -e "process.exit(process.env.$key ? 0 : 1)" 2>/dev/null; then
    missing+=("$key")
  fi
done
if (( ${#missing[@]} )); then
  echo "Missing required configuration:" >&2
  printf ' - %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "Running video safety/quality tests..."
npm run video:test

echo "Processing with natural Gemini disclosure and uploading..."
npm run video:notebooklm-ready -- "$INPUT" "$PRODUCT_ID"

STATE="output/video-pipeline/state.json"
[[ -f "$STATE" ]] || { echo "State file missing after ingest." >&2; exit 1; }

VIDEO_URL="$(node -e 'const s=require("./output/video-pipeline/state.json"); console.log(s.render?.videoUrl || "")')"
STATUS="$(node -e 'const s=require("./output/video-pipeline/state.json"); console.log(s.state || "")')"

echo
echo "State: $STATUS"
echo "Review URL: $VIDEO_URL"

if command -v termux-open-url >/dev/null 2>&1 && [[ "$VIDEO_URL" == https://* ]]; then
  termux-open-url "$VIDEO_URL" >/dev/null 2>&1 || true
fi

echo
printf "After reviewing the hosted video, type PUBLISH to approve and send it to Buffer: "
IFS= read -r CONFIRM
if [[ "$CONFIRM" != "PUBLISH" ]]; then
  echo "Stopped at READY_FOR_REVIEW. Nothing was published."
  exit 0
fi

npm run video:approve
npm run video:publish

echo
node -e '
const s=require("./output/video-pipeline/state.json");
console.log(`Final state: ${s.state}`);
for (const [channel, p] of Object.entries(s.publications || {})) {
  console.log(`${channel}: ${p.status}${p.externalId ? ` (${p.externalId})` : ""}${p.error ? ` - ${p.error}` : ""}`);
}
'
