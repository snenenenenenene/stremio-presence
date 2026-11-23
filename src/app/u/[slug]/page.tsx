import { Suspense } from "react";
import { SiteFooter } from "@/app/site-footer";
import { pageShell } from "@/app/ui";
import { SiteHeader } from "@/app/site-header";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadPublicPresence } from "@/lib/public-presence";
import { LiveCard } from "./live-card";
import { APP_NAME } from "@/lib/brand";

// Unlisted pages: keep them out of search results.
export const metadata: Metadata = { title: `Live · ${APP_NAME}`, robots: { index: false, follow: false } };

export default function LivePage({ params }: PageProps<"/u/[slug]">) {
  return (
    <main className={pageShell}>
      <SiteHeader />
      <Suspense fallback={<Skeleton />}>
        <Live params={params} />
      </Suspense>
      <SiteFooter />
    </main>
  );
}

async function Live({ params }: { params: PageProps<"/u/[slug]">["params"] }) {
  const { slug } = await params;
  const p = await loadPublicPresence(slug);
  if (!p) notFound();
  return (
    <>
      <h1 className="sr-only">{p.name} on Stremio</h1>
      <LiveCard slug={slug} initial={p} />
    </>
  );
}

function Skeleton() {
  return (
    <div aria-hidden className="motion-safe:animate-pulse">
      <div className="mt-8 h-4 w-40 rounded bg-track" />
      <div className="mt-4 flex gap-5 sm:gap-7">
        <div className="aspect-[2/3] w-28 rounded-[6px] bg-track sm:w-48" />
        <div className="flex-1 space-y-3">
          <div className="h-7 w-3/4 rounded bg-track" />
          <div className="h-4 w-1/3 rounded bg-track" />
        </div>
      </div>
      <div className="mt-6 h-12" />
    </div>
  );
}
