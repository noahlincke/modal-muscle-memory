#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/deploy-mmm.sh [--no-build] [--help]

Builds the app for https://noah.lincke.org/mmm/ and deploys dist/ to the remote host with rsync.

Optional environment overrides:
  SSH_KEY     (default: ~/.ssh/id_ed25519_personal)
  SSH_TARGET  (default: noah#lincke.org@ssh.lincke.org)
  REMOTE_DIR  (default: /home/noah/public_html/mmm)
  VITE_SUPABASE_URL
  VITE_SUPABASE_PUBLISHABLE_KEY
  VITE_SUPABASE_ANON_KEY
EOF
}

SKIP_BUILD=0
case "${1:-}" in
  --no-build)
    SKIP_BUILD=1
    ;;
  --help|-h)
    usage
    exit 0
    ;;
  "")
    ;;
  *)
    echo "Unknown option: $1" >&2
    usage
    exit 1
    ;;
esac

SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_personal}"
SSH_TARGET="${SSH_TARGET:-noah#lincke.org@ssh.lincke.org}"
REMOTE_DIR="${REMOTE_DIR:-/home/noah/public_html/mmm}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

if [[ ! -f package.json ]]; then
  echo "Could not find package.json in the repo root." >&2
  exit 1
fi

command -v npm >/dev/null 2>&1 || { echo "npm is required." >&2; exit 1; }
command -v ssh >/dev/null 2>&1 || { echo "ssh is required." >&2; exit 1; }
command -v rsync >/dev/null 2>&1 || { echo "rsync is required." >&2; exit 1; }

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  npm run build:deploy:mmm
fi

ssh -i "$SSH_KEY" "$SSH_TARGET" "mkdir -p '$REMOTE_DIR'"
rsync -av --delete -e "ssh -i $SSH_KEY" dist/ "$SSH_TARGET:$REMOTE_DIR/"

echo "Deployed to https://noah.lincke.org/mmm/"
