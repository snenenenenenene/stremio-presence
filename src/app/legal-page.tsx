import type { ReactNode } from "react";
import { SiteFooter } from "@/app/site-footer";
import { pageShell } from "@/app/ui";
import { SiteHeader } from "@/app/site-header";

// Shared shell for the privacy and terms pages: one measure, one heading scale.
export function LegalPage({ title, updated, route, children }: { title: string; updated: string; route: "/privacy" | "/terms"; children: ReactNode }) {
  return (
    <main className={pageShell}>
      <SiteHeader />
      <h1 className="mt-12 text-3xl font-semibold tracking-[-0.02em]">{title}</h1>
      <div className="mt-6 space-y-4 leading-relaxed [&_h2]:mt-10 [&_h2:first-child]:mt-0 [&_h2]:text-lg [&_h2]:font-semibold [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-4">
        {children}
      </div>
      <p className="mt-10 text-sm text-muted">Last updated {updated}.</p>
      <SiteFooter current={route} />
    </main>
  );
}
