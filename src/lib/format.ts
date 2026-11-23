// Shared display formatting (server, client and Discord).
export function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

// "1h 2m left", "14m left", "<1m left"
export function remaining(positionMs: number, durationMs: number): string {
  const m = Math.floor(Math.max(0, durationMs - positionMs) / 60_000);
  if (m < 1) return "<1m left";
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m left` : `${m}m left`;
}

// "just now", "3 min ago", "2 h ago"
export function ago(iso: string, now: Date): string {
  const min = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
  if (min < 1) return "just now";
  return min < 60 ? `${min} min ago` : `${Math.floor(min / 60)} h ago`;
}
