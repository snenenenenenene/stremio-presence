#!/bin/sh
# Moves the poller + Discord presence daemon from this laptop to the Mac mini. Run on the laptop:
#   scripts/move-to-mini.sh user@host       (or set MINI_HOST)
# Needs: SSH key access to the mini, and node + bun + clang (Xcode CLT) there.
# The laptop job is stopped only after the mini's poller has logged a pass.
set -eu
HOST="${1:-${MINI_HOST:?usage: move-to-mini.sh user@host (or set MINI_HOST)}}"
# Non-interactive SSH shells do not load the Homebrew PATH.
BREW='export PATH=/opt/homebrew/bin:$PATH;'
REPO="$(cd "$(dirname "$0")/.." && pwd)"
LABEL=com.senne.stremio-presence-poller
DEST='~/jobs/stremio-presence'

ssh -o BatchMode=yes "$HOST" "$BREW"'command -v /opt/homebrew/bin/node && command -v bun && command -v clang++' >/dev/null \
  || { echo "mini is missing node, bun or clang++ (or SSH is refused)"; exit 1; }

echo "copying code and SDK"
ssh "$HOST" "mkdir -p $DEST/logs ~/.config/stremio-presence && chmod 700 ~/.config/stremio-presence"
cd "$REPO"
# Tracked files plus the SDK (gitignored); never node_modules, builds, logs or local env files.
{ git ls-files; find vendor/discord-social-sdk -type f; } | rsync -a --files-from=- . "$HOST:$DEST/"
scp -q "$HOME/.config/stremio-presence/worker.env" "$HOST:.config/stremio-presence/worker.env"
ssh "$HOST" "chmod 600 ~/.config/stremio-presence/worker.env"

echo "installing and building on the mini"
ssh "$HOST" "$BREW cd $DEST && bun install --frozen-lockfile >/dev/null && scripts/build-daemon.sh"

echo "starting the mini job"
ssh "$HOST" "cat > ~/Library/LaunchAgents/$LABEL.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/sh</string><string>-c</string><string>exec \$HOME/jobs/stremio-presence/scripts/run-poller.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>/tmp/stremio-presence-poller.log</string>
  <key>StandardErrorPath</key><string>/tmp/stremio-presence-poller.err.log</string>
</dict></plist>
EOF
# bootout returns before the old job is gone; bootstrap fails (error 5) until it is.
ssh "$HOST" "launchctl bootout gui/\$(id -u)/$LABEL 2>/dev/null; i=0; while launchctl list $LABEL >/dev/null 2>&1 && [ \$i -lt 20 ]; do sleep 1; i=\$((i+1)); done; launchctl bootstrap gui/\$(id -u) ~/Library/LaunchAgents/$LABEL.plist"

echo "waiting for the first pass on the mini"
i=0
until ssh "$HOST" "grep -Eq ' (playing|idle|off)\$' /tmp/stremio-presence-poller.log 2>/dev/null"; do
  i=$((i + 1)); [ $i -gt 24 ] && { echo "no pass after 2 min; laptop job left running"; ssh "$HOST" "tail -5 /tmp/stremio-presence-poller.err.log"; exit 1; }
  sleep 5
done

echo "mini is polling; stopping the laptop job"
launchctl bootout "gui/$(id -u)/$LABEL" || true
P="$HOME/Library/LaunchAgents/$LABEL.plist"; if [ -f "$P" ]; then mv "$P" "$P.disabled"; fi
echo "done. mini log: ssh $HOST tail -f /tmp/stremio-presence-poller.log"
