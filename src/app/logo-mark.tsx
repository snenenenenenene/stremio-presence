// The Now Watching mark: a play triangle with a live dot (logo concept 1). Colours come from the theme tokens.
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="240 255 590 515" className={className} aria-hidden="true">
      <polygon points="305,320 305,705 640,512" className="fill-ink stroke-ink" strokeWidth={80} strokeLinejoin="round" />
      <circle cx="698" cy="511" r="62" className="fill-live" />
    </svg>
  );
}
