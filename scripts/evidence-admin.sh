#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
umask 077

PROJECT="$HOME/blindboxai"
ENV_FILE="$PROJECT/.env.local"
REVIEW_ROOT="$HOME/storage/shared/BlindBoxAI/evidence-review"

fail() {
  printf '\nERROR: %s\n' "$*" >&2
  exit 1
}

load_environment() {
  [[ -d "$PROJECT" ]] ||
    fail "Project not found: $PROJECT"

  cd "$PROJECT"

  [[ -f "$ENV_FILE" ]] ||
    fail ".env.local is missing."

  set +u
  set -a
  . "$ENV_FILE"
  set +a
  set -u

  [[ -n "${BLOB_READ_WRITE_TOKEN:-}" ]] ||
    fail "BLOB_READ_WRITE_TOKEN is missing."

  # Termux runs outside Vercel, so use the static Blob token.
  # A partial local OIDC environment causes the Blob CLI to fail.
  unset VERCEL_OIDC_TOKEN
  unset BLOB_STORE_ID
}

show_help() {
  cat <<'HELP'
BlindBoxAI Evidence Administration

Commands:

  blindboxai-evidence doctor
  blindboxai-evidence list
  blindboxai-evidence fetch SUBMISSION_ID
  blindboxai-evidence show-code

These commands do not publish, approve, classify,
or delete evidence.
HELP
}

doctor() {
  load_environment

  vercel blob list \
    --prefix "evidence/manifests/pending/" \
    --limit 1 >/dev/null

  echo
  echo "Private Blob connection: ready"
  echo "Contributor access code: configured"
  echo "Automatic publication: disabled"
}

list_pending() {
  load_environment

  echo
  echo "Pending evidence manifests:"
  echo

  vercel blob list \
    --prefix "evidence/manifests/pending/" \
    --limit 100
}

show_code() {
  load_environment

  [[ -n "${EVIDENCE_UPLOAD_CODE:-}" ]] ||
    fail "EVIDENCE_UPLOAD_CODE is missing."

  echo
  echo "Contributor access code:"
  echo
  printf '%s\n' "$EVIDENCE_UPLOAD_CODE"
  echo
  echo "Share only with intended contributors."
}

fetch_submission() {
  local submission_id="${1:-}"

  [[ "$submission_id" =~ ^[a-zA-Z0-9-]{16,80}$ ]] ||
    fail "Invalid or missing submission ID."

  load_environment

  local destination
  local manifest_path
  local manifest_file
  local file_list

  destination="$REVIEW_ROOT/$submission_id"
  manifest_path="evidence/manifests/pending/$submission_id.json"
  manifest_file="$destination/manifest.json"
  file_list="$destination/files.tsv"

  mkdir -p "$destination"

  echo
  echo "Downloading private manifest..."

  vercel blob get "$manifest_path" \
    --access private \
    --output "$manifest_file"

  python - "$manifest_file" "$file_list" <<'PY'
import json
import pathlib
import sys

manifest_path = pathlib.Path(sys.argv[1])
file_list_path = pathlib.Path(sys.argv[2])

manifest = json.loads(
    manifest_path.read_text(encoding="utf-8")
)

uploads = manifest.get("uploads")

if not isinstance(uploads, list):
    raise SystemExit("Invalid manifest uploads field.")

rows = []

for index, upload in enumerate(uploads, start=1):
    pathname = str(upload.get("pathname", "")).strip()

    if not pathname:
        raise SystemExit("Manifest contains an empty pathname.")

    suffix = pathlib.Path(pathname).suffix.lower()

    if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
        suffix = ".jpg"

    rows.append(
        f"{pathname}\t{index:02d}{suffix}"
    )

file_list_path.write_text(
    "\n".join(rows) + ("\n" if rows else ""),
    encoding="utf-8",
)
PY

  echo
  echo "Downloading private images..."

  while IFS=$'\t' read -r pathname filename
  do
    [[ -n "$pathname" ]] || continue

    vercel blob get "$pathname" \
      --access private \
      --output "$destination/$filename"
  done < "$file_list"

  rm -f "$file_list"

  cat > "$destination/REVIEW_CHECKLIST.txt" <<CHECKLIST
BLINDBOXAI EVIDENCE REVIEW

Submission ID:
$submission_id

RIGHTS

[ ] Contributor owns the photographs, took them,
    has written permission, or supplied a valid license.

[ ] Any open license and attribution were verified.

[ ] No marketplace photograph was copied without rights.

PRIVACY

[ ] No names, addresses, emails, receipts, seller IDs,
    order numbers, or tracking information remain visible.

[ ] No complete QR code, barcode, serial number,
    or verification code remains readable.

[ ] Every image was manually inspected at full size.

AUTHENTICITY

[ ] A verified-genuine label has adequate provenance.

[ ] Warning signs are not presented as conclusive proof.

[ ] Series, item, viewpoint, and notes match the images.

PUBLICATION

[ ] Captions are accurate and limited.

[ ] Required attribution is included.

[ ] No unsupported seller accusation is present.

[ ] A preview will be reviewed before production.

Nothing in this folder was automatically published.
CHECKLIST

  if command -v termux-media-scan >/dev/null 2>&1
  then
    termux-media-scan "$destination" \
      >/dev/null 2>&1 || true
  fi

  echo
  echo "Submission downloaded to:"
  echo "  $destination"
  echo
  echo "Nothing was published."
}

case "${1:-}" in
  doctor)
    doctor
    ;;

  list)
    list_pending
    ;;

  fetch)
    fetch_submission "${2:-}"
    ;;

  show-code)
    show_code
    ;;

  -h|--help|"")
    show_help
    ;;

  *)
    fail "Unknown command. Use --help."
    ;;
esac
