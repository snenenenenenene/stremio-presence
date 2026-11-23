import Link from "next/link";
import { APP_NAME } from "@/lib/brand";

const LINKS = [["/connect", APP_NAME], ["/privacy", "Privacy"], ["/terms", "Terms"]] as const;
type FooterRoute = (typeof LINKS)[number][0];

// One footer for every page; sits at the bottom of the viewport (parent is a flex column).
// py-3 gives each link a 44px tap target; the page passes its own route so it is marked, not linked.
export function SiteFooter({ current }: { current?: FooterRoute }) {
  return (
    <footer className="mt-auto flex flex-wrap gap-x-5 pt-12 text-sm text-muted">
      {LINKS.map(([href, label]) =>
        current === href ? (
          <span key={href} aria-current="page" className="py-3 font-medium text-ink">{label}</span>
        ) : (
          <Link key={href} href={href} className="py-3 underline decoration-line underline-offset-4 hover:decoration-muted">{label}</Link>
        ),
      )}
    </footer>
  );
}
