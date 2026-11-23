"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { PublicPresence } from "@/lib/public-presence";
import { ago, clock, remaining } from "@/lib/format";

const REFRESH_MS = 30_000;

// Position now: while playing, extrapolate from the last save; never past the runtime.
function livePos(p: PublicPresence, now: number): number | null {
  if (p.positionMs == null) return null;
  if (p.state !== "playing" || !p.lastSavedAt) return p.positionMs;
  const pos = p.positionMs + Math.max(0, now - Date.parse(p.lastSavedAt));
  return p.durationMs ? Math.min(pos, p.durationMs) : pos;
}

export function LiveCard({ slug, initial }: { slug: string; initial: PublicPresence }) {
  const [p, setP] = useState(initial);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(async () => {
      const res = await fetch(`/api/presence/${slug}`, { cache: "no-store" }).catch(() => null);
      if (res?.ok) setP(await res.json());
    }, REFRESH_MS);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [slug]);

  if (p.state === "off" || !p.title) {
    return (
      <section className="mt-10 rounded-lg border border-line px-5 py-8 text-center">
        <p className="text-muted">{p.name} isn&apos;t watching anything right now.</p>
        {p.updatedAt && <p className="mt-1 text-xs text-muted">Checked {ago(p.updatedAt, new Date(now))}</p>}
      </section>
    );
  }

  const pos = livePos(p, now);
  const pct = pos != null && p.durationMs ? Math.min(100, (pos / p.durationMs) * 100) : null;
  const episode = p.season != null && p.episode != null ? `Season ${p.season}, episode ${p.episode}` : null;
  const playing = p.state === "playing";

  return (
    <section className="mt-8" aria-live="polite">
      <p className="flex items-center gap-2 text-sm font-medium">
        <span className={`size-2 rounded-full ${playing ? "bg-live motion-safe:animate-pulse" : "bg-idle"}`} aria-hidden />
        {playing ? `${p.name} is watching` : `${p.name} paused${p.lastSavedAt ? ` ${ago(p.lastSavedAt, new Date(now))}` : ""}`}
      </p>

      <div className="mt-4 flex gap-5 sm:gap-7">
        <div className="relative aspect-[2/3] w-28 shrink-0 overflow-hidden rounded-[6px] bg-track sm:w-48">
          {p.poster && <Image src={p.poster} alt="" fill sizes="(min-width: 640px) 192px, 112px" className="object-cover" priority />}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-3 text-2xl font-semibold leading-tight tracking-[-0.01em] sm:text-4xl">{p.title}</h2>
          <p className="mt-1 text-muted">{episode ?? (p.type === "series" ? "Series" : "Movie")}</p>
          {/* "Stremio" is the unknown-device fallback: say nothing rather than something vague. */}
          {p.device && p.device !== "Stremio" && <p className="mt-3 text-sm text-muted">on {p.device}</p>}
        </div>
      </div>

      {/* Reserved height so the card does not jump when progress appears. */}
      <div className="mt-6 min-h-12">
        {pct != null && pos != null && p.durationMs && (
          <>
            <div className="h-1 w-full overflow-hidden rounded-full bg-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Progress">
              <div className={`h-full rounded-full ${playing ? "bg-live" : "bg-muted"}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 flex justify-between text-sm tabular-nums text-muted">
              <span>{clock(pos)} / {clock(p.durationMs)}</span>
              <span>{remaining(pos, p.durationMs)}</span>
            </p>
          </>
        )}
      </div>
    </section>
  );
}
