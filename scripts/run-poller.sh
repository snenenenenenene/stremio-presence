#!/bin/sh
# launchd entry for the presence poller. Secrets live outside the repo.
set -a
. "$HOME/.config/stremio-presence/worker.env"
# Optional heartbeat config (present on the Mac mini).
[ -f "$HOME/.config/hc/env" ] && . "$HOME/.config/hc/env"
set +a
cd "$(dirname "$0")/.." && exec /opt/homebrew/bin/node worker/poll.ts
