import Link from "next/link";
import { LogoMark } from "@/app/logo-mark";
import { APP_NAME } from "@/lib/brand";

// Logo and name, linking home. Every page starts with it so the brand sits in one place.
export function SiteHeader() {
  return (
    <header className="flex items-center justify-between">
      <Link href="/connect" className="-m-2 flex min-h-11 items-center gap-2.5 p-2 font-semibold tracking-[-0.01em]">
        <LogoMark className="h-6 w-7" />
        {APP_NAME}
      </Link>
      <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-medium text-muted">Beta</span>
    </header>
  );
}
