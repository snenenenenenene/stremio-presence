"use client";

import { useState } from "react";
import { buttonSecondary } from "@/app/ui";

// Copies the live page URL; the label confirms for two seconds. Width is fixed so the swap does not shift the row.
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`${buttonSecondary} sm:w-32`}
      onClick={async () => {
        await navigator.clipboard.writeText(url).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      <span aria-live="polite">{copied ? "Copied" : "Copy link"}</span>
    </button>
  );
}
