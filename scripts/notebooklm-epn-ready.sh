#!/usr/bin/env bash
set -euo pipefail

INPUT="${1:-}"
PRODUCT_ID="${2:-}"

if [[ -z "$INPUT" ]]; then
  echo "Usage: bash scripts/notebooklm-epn-ready.sh /path/to/video.mp4 [product-id]" >&2
  exit 2
fi

command -v ffmpeg >/dev/null 2>&1 || {
  echo "ffmpeg is required. In Termux: pkg install ffmpeg" >&2
  exit 1
}
command -v ffprobe >/dev/null 2>&1 || {
  echo "ffprobe is required. In Termux: pkg install ffmpeg" >&2
  exit 1
}
command -v espeak >/dev/null 2>&1 || {
  echo "espeak is required for audible affiliate disclosure. In Termux: pkg install espeak" >&2
  exit 1
}

[[ -f "$INPUT" ]] || { echo "Video not found: $INPUT" >&2; exit 1; }
[[ "$INPUT" =~ \.mp4$ ]] || { echo "Only MP4 input is supported." >&2; exit 1; }

BASE="${INPUT%.*}"
OUTPUT="${BASE} - EPN Ready.mp4"
FONT="/system/fonts/Roboto-Bold.ttf"
if [[ ! -f "$FONT" ]]; then FONT="/system/fonts/Roboto-Regular.ttf"; fi
[[ -f "$FONT" ]] || { echo "Android Roboto font not found." >&2; exit 1; }

DURATION="$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$INPUT")"
CTA_START="$(awk -v d="$DURATION" 'BEGIN { s=d-5.5; if (s < 6) s=6; printf "%.3f", s }')"

FILTER="drawbox=x=28:y=30:w=w-56:h=190:color=black@0.80:t=fill:enable='between(t,0,5.8)',drawtext=fontfile=${FONT}:text='#ad  As an eBay Partner,':fontcolor=white:fontsize=28:x=(w-text_w)/2:y=55:enable='between(t,0,5.8)',drawtext=fontfile=${FONT}:text='I may earn a commission from':fontcolor=white:fontsize=28:x=(w-text_w)/2:y=105:enable='between(t,0,5.8)',drawtext=fontfile=${FONT}:text='qualifying purchases.':fontcolor=white:fontsize=28:x=(w-text_w)/2:y=155:enable='between(t,0,5.8)',drawbox=x=28:y=h-195:w=w-56:h=145:color=black@0.78:t=fill:enable='gte(t,${CTA_START})',drawtext=fontfile=${FONT}:text='Full collector guide + current listings':fontcolor=white:fontsize=27:x=(w-text_w)/2:y=h-170:enable='gte(t,${CTA_START})',drawtext=fontfile=${FONT}:text='BlindBoxAI.com':fontcolor=white:fontsize=38:x=(w-text_w)/2:y=h-125:enable='gte(t,${CTA_START})'"

TMP_WAV="$(mktemp --suffix=.wav)"
trap 'rm -f "$TMP_WAV"' EXIT
espeak -w "$TMP_WAV" "As an eBay Partner, I may earn a commission from qualifying purchases."

ffmpeg -y -hide_banner -loglevel error \
  -i "$INPUT" -i "$TMP_WAV" \
  -filter_complex "[0:v]${FILTER}[v];[0:a]volume='if(lt(t,5.8),0.22,1)'[orig];[1:a]aresample=44100,volume=1.15[disc];[orig][disc]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]" \
  -map '[v]' -map '[a]' \
  -c:v libx264 -preset veryfast -crf 21 -pix_fmt yuv420p \
  -c:a aac -b:a 160k -movflags +faststart "$OUTPUT"

ffprobe -v error \
  -show_entries format=duration,size:stream=codec_name,codec_type,width,height,sample_rate,channels \
  -of json "$OUTPUT"

echo "Prepared: $OUTPUT"

ARGS=(--file "$OUTPUT")
if [[ -n "$PRODUCT_ID" ]]; then ARGS+=(--product "$PRODUCT_ID"); fi
npm run video:notebooklm -- "${ARGS[@]}"
