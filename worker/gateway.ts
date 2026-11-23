// Keeps the bot user shown as online. Commands arrive over HTTP (Vercel); this connection only exists so the bot
// does not look dead in member lists and on bot sites. No intents: Discord sends us nothing but heartbeats.
const GATEWAY = "wss://gateway.discord.gg/?v=10&encoding=json";
const RETRY_MS = 15_000;

export function keepBotOnline(token: string) {
  let seq: number | null = null;
  let beat: ReturnType<typeof setInterval> | undefined;

  const connect = () => {
    const ws = new WebSocket(GATEWAY);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as { op: number; s: number | null; t: string | null; d: { heartbeat_interval?: number } | null };
      if (msg.s !== null) seq = msg.s;
      if (msg.t === "READY") console.log(`${new Date().toISOString()} gateway: bot online`);
      if (msg.op === 10) {
        // Hello: heartbeat at Discord's interval, then identify with a "Watching" status.
        clearInterval(beat);
        beat = setInterval(() => ws.send(JSON.stringify({ op: 1, d: seq })), msg.d!.heartbeat_interval!);
        ws.send(JSON.stringify({
          op: 2,
          d: {
            token,
            intents: 0,
            properties: { os: "macos", browser: "now-watching", device: "now-watching" },
            presence: { status: "online", afk: false, since: null, activities: [{ name: "Stremio", type: 3 }] },
          },
        }));
      }
      if (msg.op === 1) ws.send(JSON.stringify({ op: 1, d: seq })); // Discord asked for a heartbeat now
      if (msg.op === 7 || msg.op === 9) ws.close(); // reconnect / invalid session: start over
    };
    ws.onclose = (ev) => {
      clearInterval(beat);
      // 4004: bad token. Retrying would only get the token flagged, so stop.
      if (ev.code === 4004) { console.error("gateway: token rejected, bot stays offline"); return; }
      setTimeout(connect, RETRY_MS);
    };
    ws.onerror = () => {}; // onclose follows and retries
  };
  connect();
}
