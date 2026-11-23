# Stremio Presence: full build plan

Date: 2026-11-22. Decisions taken by Senne: Discord bot + live page as output; Vercel + Neon + Mac mini worker.

## What the validation proved

| Signal | Mac app | Web | Apple TV |
|---|---|---|---|
| Addon `stream` request (title page opened) | yes | yes | yes |
| Addon `subtitles` request (player opened) | yes | yes | never |
| Account library sync (`api.strem.io/api/datastoreGet`, `libraryItem.state`) | expected | yes | yes, ~every 90 s while playing, one save on pause, then silence |

Library state gives title (`_id`, `name`), episode (`state.video_id`), position (`state.timeOffset`, ms), runtime (`state.duration`, ms), save time (`state.lastWatched`). Pause and stop look the same. Device comes only from the addon request user agent.

Risk: `datastoreGet` / `login` are undocumented Stremio APIs. If Stremio changes them, the poller breaks; the addon signal keeps working.

## Product

1. User opens `/connect`, logs in to Stremio once (email + password go straight through to `api.strem.io/api/login`; we store only the returned auth key, encrypted). The page then installs the addon with the user's token.
2. User adds the Discord bot to a server and runs `/nowwatching here` in a channel. The bot keeps one message per user updated.
3. Each user gets `/u/<handle>`: a live now-playing page plus an embeddable image.

States: `playing` (save in last 240 s and position moved), `idle` (no save for 240 s – 15 min), `off` (nothing for 15 min). Device label: latest addon request in the same title within 30 min, else "Stremio".

## Architecture

- **Next.js on Vercel** (`apps/web`): addon routes (`/<token>/manifest.json`, `stream`, `subtitles`), `/connect`, `/u/<handle>`, Discord interactions endpoint. Production only, per environment rules.
- **Neon Postgres**: `users`, `stremio_links` (encrypted auth key), `addon_events`, `presence` (current state per user), `discord_targets` (guild, channel, message id).
- **Worker on the Mac mini** (`apps/worker`, launchd + `hc-run.sh` heartbeat): every 60 s per linked user, call `datastoreMeta` for changed ids, `datastoreGet` only those, run the state machine, write `presence`, edit Discord messages on change. Backs off per user on errors; marks the link broken on auth failure.
- **Discord**: one application with a bot user and slash commands; edits messages via REST. No user tokens, no self-bot.

## Phases (each ends with tests + a real check)

1. Monorepo, Next app, Neon schema, port addon routes with the existing tests.
2. State machine as a pure module, tested against the recorded Dog Stars / Odyssey / Survivor samples.
3. `/connect` login flow + encrypted key storage + poller (runs on the laptop until mini SSH works).
4. Live page `/u/<handle>` + image (UI rules: Mobbin reference first, screenshots at 390x844 and 1440x900, Codex visual QA, Senne OK).
5. Discord bot: app, `/nowwatching here`, message upsert.
6. Deploy: Vercel prd, Neon prd, worker on the mini, jobs.yaml entry, remove the laptop tunnel.

## Decisions (grilling, 2026-11-22)

1. Private beta first (done 2026-11-22); open sign-up from 2026-11-23. The Stremio API is still undocumented, so it can break without notice.
2. Sign-in to our product: Discord OAuth.
3. Stremio link: password passes through once to Stremio login; only the encrypted auth key is stored. Facebook-login Stremio accounts unsupported in beta.
4. Live page unlisted by default (random slug); public handle opt-in.
5. Discord: one shared "Now watching" board message per channel.
6. New private repo `stremio-presence`, push to main; working name only, real name before public launch.
7. Users appear on a server's board only after `/nowwatching join` there; `/nowwatching leave` removes them.
8. Board row: name, title (+S1E2), progress bar with position/runtime, device, small poster; idle rows grey for 15 min, then removed.
9. Data: current presence + 30 days of raw events/polls; no history; account delete wipes everything.
10. Sign-up: open since 2026-11-23, capped at `MAX_USERS` new accounts (default 100) because the poller checks users one by one each minute. The `allowlist` table is no longer read.
11. Beta on the `*.vercel.app` domain.
12. Poller runs on the laptop via launchd until mini SSH works, then moves.

Defaults taken without asking: poll every 60 s per user; when two titles are active, show the most recently saved one.

## Blockers needing Senne

- Mac mini SSH: add this laptop's `~/.ssh/id_ed25519.pub` to the mini's `authorized_keys`.
- Discord application + bot token (create in the Discord developer portal; Claude must not create accounts or keys).
- Neon project and Vercel project creation (creates resources under his accounts).
