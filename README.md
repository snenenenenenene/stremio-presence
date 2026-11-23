# Now Watching

Shows what you watch on Stremio as your Discord status, on a live page and on a board in your Discord server. Works on Apple TV, Mac and the web, with nothing to keep running on your own devices.

Use it at https://stremio-presence.vercel.app.

## How it works

- **Stremio library sync.** Every minute a worker reads each user's recently watched items through Stremio's account API. Stremio clients save the position about every 90 to 180 seconds while playing and once on pause, which gives playing, paused and stopped.
- **Addon.** A Stremio addon that returns no streams. Stremio calls it when you open a title, and the request's user agent says which device you use.
- **Discord status.** One Discord Social SDK client per user sets the "Watching" activity on their profile, using the OAuth token they granted at sign-in.
- **Server board.** A bot keeps one message per channel up to date with `/nowwatching here`, `join` and `leave`.

Stremio's account API is undocumented, so it can change without notice.

## Stack

Next.js on Vercel, Postgres on Neon (Drizzle), and a Node worker under launchd that runs the poller and the Discord SDK hosts.

## Run it yourself

1. `bun install`, then copy the variables the code reads (`DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `DISCORD_CLIENT_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`) into `.env.local`.
2. `bun run db:migrate`, then `bun run dev`.
3. For the worker, download the Discord Social SDK yourself (its license does not allow redistribution), unpack it into `vendor/discord-social-sdk/`, run `scripts/build-daemon.sh` and start `scripts/run-poller.sh`.

Tests: `bun run test`.

## License

MIT
