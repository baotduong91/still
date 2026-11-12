#!/usr/bin/env bash
# Push all pending changes on the current branch to origin.
# Usage: ./scripts/push-remote.sh "Your commit message"
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

if [[ $# -lt 1 || -z "${1//[[:space:]]/}" ]]; then
  echo "Usage: $0 \"commit message\"" >&2
  exit 1
fi

message=$1
branch="$(git rev-parse --abbrev-ref HEAD)"

if [[ "$branch" == "HEAD" ]]; then
  echo "Not on a named branch (detached HEAD). Checkout a branch first." >&2
  exit 1
fi

if git diff --quiet && git diff --cached --quiet && [[ -z "$(git status --porcelain)" ]]; then
  echo "Nothing to commit."
  exit 0
fi

# Block obvious secret filenames if they are tracked or force-added.
while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  base="$(basename "$path")"
  case "$base" in
    .env | .env.local | .env.production | credentials.json | *.pem)
      echo "Refusing to commit possible secret: $path" >&2
      exit 1
      ;;
  esac
done < <(git status --porcelain | awk '{print $NF}')

git add -A

if git diff --cached --quiet; then
  echo "Nothing to commit after staging."
  exit 0
fi

git commit -m "$message"
git push origin "$branch"

echo "Pushed ${branch} to origin ($(git rev-parse --short HEAD))."
