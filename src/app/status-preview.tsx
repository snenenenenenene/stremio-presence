import Image from "next/image";

// Landing-page example of the status a friend sees on your profile. Static: it shows the product, not live data.
export function StatusPreview() {
  return (
    <figure className="rounded-xl border border-line bg-paper p-5 shadow-[0_1px_2px_oklch(0_0_0/0.04),0_12px_32px_-12px_oklch(0_0_0/0.18)] sm:p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-track text-sm font-semibold" aria-hidden>S</span>
        <div className="leading-tight">
          <p className="font-semibold">Senne</p>
          <p className="text-sm text-muted">Profile</p>
        </div>
      </div>
      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.06em] text-muted">Watching</p>
      <div className="mt-2 flex gap-4">
        <div className="relative aspect-[2/3] w-16 shrink-0 overflow-hidden rounded-md bg-track sm:w-20">
          <Image src="https://images.metahub.space/poster/medium/tt33764258/img" alt="" fill sizes="80px" className="object-cover" />
        </div>
        <div className="min-w-0 self-center">
          <p className="truncate font-semibold">The Odyssey</p>
          <p className="text-sm text-muted">on Apple TV</p>
          <p className="mt-1 text-sm tabular-nums text-muted">1:04:12 elapsed</p>
        </div>
      </div>
      <div className="mt-4 h-1 overflow-hidden rounded-full bg-track" aria-hidden>
        <div className="h-full w-[54%] rounded-full bg-live" />
      </div>
      <figcaption className="sr-only">Example: your Discord profile shows Watching The Odyssey on Apple TV.</figcaption>
    </figure>
  );
}
