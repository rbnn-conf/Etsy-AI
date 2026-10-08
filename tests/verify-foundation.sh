#!/usr/bin/env bash
# Repository hygiene checks: no secrets tracked, .env ignored, variable names
# documented. Application tests run with `npm test` from the repository root.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

failures=0
out_file="$(mktemp)"
trap 'rm -f "$out_file"' EXIT

check() {
  local name="$1"; shift
  if "$@" > "$out_file" 2>&1; then
    echo "PASS: $name"
  else
    echo "FAIL: $name"
    sed 's/^/       /' "$out_file"
    failures=$((failures + 1))
  fi
}

# 1. .env is git-ignored (never overwrites a real .env if one exists).
if [ -f .env ]; then
  check ".env is git-ignored" git check-ignore -q .env
else
  check ".env is git-ignored" bash -c 'touch .env; git check-ignore -q .env; rm -f .env'
fi

# 2. No obvious secret files are tracked by git.
check "no tracked .env / key / credential files" bash -c \
  '! git ls-files | grep -E "(^|/)\.env$|\.pem$|\.key$|credentials.*\.json$"'

# 3. Required env var names are documented in the .env.example files.
check ".env.example files define required variable names" bash -c \
  'for v in ETSY_API_KEYSTRING ETSY_SHARED_SECRET ETSY_OAUTH_REDIRECT_URI TELEGRAM_CHAT_ID; do grep -q "^$v=" .env.example || exit 1; done; for v in AUTOMATION_TELEGRAM_BOT_TOKEN OPENAI_API_KEY OPENAI_TEXT_MODEL OPENAI_IMAGE_MODEL; do grep -q "^$v=" automation/.env.example || exit 1; done'

# 4. Git working tree has no unexpected untracked secret-looking files.
check "no untracked .env files" bash -c \
  '[ -z "$(git status --porcelain | grep -E "^\?\? .*\.env$")" ]'

echo
if [ "$failures" -eq 0 ]; then
  echo "All checks passed."
  exit 0
else
  echo "$failures check(s) failed."
  exit 1
fi
