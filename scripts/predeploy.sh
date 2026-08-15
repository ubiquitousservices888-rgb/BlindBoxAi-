#!/usr/bin/env bash
set -euo pipefail

project="${1:-.}"
cd -- "$project"

fail=0
printf '%s\n' 'BlindBoxAI predeploy (environment values are never printed)'

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if [[ -z "$(git status --porcelain --untracked-files=all)" ]]; then
    printf '%s\n' 'repository-state: PASS'
  else
    printf '%s\n' 'repository-state: FAIL (working tree is not clean)'
    fail=1
  fi
else
  printf '%s\n' 'repository-state: FAIL (not a git worktree)'
  fail=1
fi

required_environment_names=(
  BLINDBOXAI_SITE_URL
  BLOB_READ_WRITE_TOKEN
  BUFFER_API_TOKEN
  BUFFER_ORGANIZATION_ID
  CREATOMATE_API_KEY
  CREATOMATE_TEMPLATE_ID
  EVIDENCE_UPLOAD_CODE
  MR_KNOW_IT_ALL_ENABLED
  MR_KNOW_IT_ALL_OUTPUT_DIR
  MR_PRIVATE_BLOB_READ_WRITE_TOKEN
  MR_RESEARCH_ENCRYPTION_KEY
  NEXT_PUBLIC_EPN_CAMPID
  NEXT_PUBLIC_WAITLIST_ENDPOINT
  OPENAI_API_KEY
  OPENAI_QA_MODEL
  OPENAI_RESEARCH_MODEL
  PRODUCTION_ENVIRONMENT
  PRODUCTION_REVIEWER
  VIDEO_CHANNELS
  VIDEO_PRODUCTS_FILE
  VIDEO_STATE_FILE
  ZAPIER_VIDEO_PAYLOAD_FILE
  ZAPIER_VIDEO_WEBHOOK_URL
)

missing_environment_names=()
if [[ ! -f .env.example ]]; then
  missing_environment_names=("${required_environment_names[@]}")
else
  for name in "${required_environment_names[@]}"; do
    if ! grep -Eq "^${name}=" .env.example; then
      missing_environment_names+=("$name")
    fi
  done
fi

if ((${#missing_environment_names[@]} == 0)); then
  printf 'environment-names: PASS (%d documented; values not inspected)\n' "${#required_environment_names[@]}"
else
  printf '%s\n' 'environment-names: FAIL'
  printf 'missing-name: %s\n' "${missing_environment_names[@]}"
  fail=1
fi

tracked_environment_files=()
while IFS= read -r -d '' file; do
  case "$file" in
    .env.example) ;;
    .env|.env.*|*/.env|*/.env.*) tracked_environment_files+=("$file") ;;
  esac
done < <(git ls-files -z 2>/dev/null || true)

credential_pattern='-----BEGIN ([A-Z ]+)?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{20,}|sk-(proj-)?[A-Za-z0-9_-]{16,}|sk_live_[A-Za-z0-9]{16,}'
credential_files=()
while IFS= read -r file; do
  [[ -n "$file" ]] && credential_files+=("$file")
done < <(git grep -I -l -E "$credential_pattern" -- . 2>/dev/null || true)

if ((${#tracked_environment_files[@]} == 0 && ${#credential_files[@]} == 0)); then
  printf '%s\n' 'secret-scan: PASS'
else
  printf '%s\n' 'secret-scan: FAIL'
  printf 'review-file: %s\n' "${tracked_environment_files[@]}" "${credential_files[@]}"
  fail=1
fi

if node --input-type=module <<'NODE'
import { shouldUseSkimlinks } from "./lib/affiliate-policy.mjs";

if (shouldUseSkimlinks("https://www.ebay.com/sch/i.html?_nkw=blind+box+collectible")) process.exit(1);
if (shouldUseSkimlinks("https://deals.ebay.com/item")) process.exit(1);
if (!shouldUseSkimlinks("https://ebay.com.example.org/item")) process.exit(1);
NODE
then
  printf '%s\n' 'skimlinks-ebay-exclusion: PASS'
else
  printf '%s\n' 'skimlinks-ebay-exclusion: FAIL'
  fail=1
fi

exit "$fail"
