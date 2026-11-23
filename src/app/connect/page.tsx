import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { desc, eq } from "drizzle-orm";
import { SiteFooter } from "@/app/site-footer";
import { SiteHeader } from "@/app/site-header";
import { StatusPreview } from "@/app/status-preview";
import { buttonPrimary, buttonSecondary, inlineLinkButton, inputField, linkButton, pageShell, pageShellWide } from "@/app/ui";
import { db, schema } from "@/db";
import { currentUser } from "@/lib/session";
import { CopyLink } from "./copy-link";
import { deleteAccount, linkStremio, signOut, unlinkStremio } from "./actions";

const ERRORS: Record<string, string> = {
  state: "Sign-in expired. Try again.",
  discord: "Discord sign-in failed. Try again.",
  full: "Now Watching is full for now. Try again in a few days.",
  missing: "Enter your Stremio email and password.",
  login: "Stremio did not accept that email and password.",
  stremio: "Could not reach Stremio. Try again in a minute.",
};

type SearchParams = PageProps<"/connect">["searchParams"];

// The whole page depends on the session, so it streams behind Suspense (cacheComponents).
export default function ConnectPage({ searchParams }: PageProps<"/connect">) {
  return (
    <Suspense fallback={<main className={pageShell}><SiteHeader /><p className="mt-12 text-muted">Loading…</p></main>}>
      <Connect searchParams={searchParams} />
    </Suspense>
  );
}

async function Connect({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? ERRORS[sp.error] : undefined;
  const user = await currentUser();
  const notice = (
    <>
      {sp.deleted === "1" && !user && (
        <p role="status" className="mt-8 rounded-md bg-track px-4 py-3 text-sm">Your account and all its data are deleted.</p>
      )}
      {error && (
        <p role="alert" className="mt-8 rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
  return user ? <Setup user={user} notice={notice} /> : <Landing notice={notice} />;
}

function Landing({ notice }: { notice: ReactNode }) {
  return (
    <main className={pageShellWide}>
      <SiteHeader />
      {notice}
      <section className="mt-12 grid items-center gap-12 md:mt-20 md:grid-cols-[1.1fr_1fr] md:gap-16">
        <div>
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-[-0.025em] sm:text-5xl">
            What you watch on Stremio, on your Discord profile
          </h1>
          <p className="mt-5 max-w-[34rem] text-lg leading-relaxed text-muted">
            Friends see the title, episode and your progress. Works on Apple TV, Mac and the web. Nothing needs to keep running on your side.
          </p>
          {/* Full-page navigation to the OAuth redirect route, not client-side routing. */}
          <form action="/api/auth/discord" method="get" className="mt-8">
            <button className={buttonPrimary}>Sign in with Discord</button>
          </form>
        </div>
        <StatusPreview />
      </section>

      <section className="mt-20 border-t border-line pt-10 md:mt-28">
        <h2 className="text-lg font-semibold">How it works</h2>
        <ol className="mt-6 grid gap-8 md:grid-cols-3">
          {[
            ["Sign in with Discord", "Allow us to set your status."],
            ["Link Stremio", "Log in once. We store Stremio's session key, never your password."],
            ["Install the addon", "It tells us which device you're watching on."],
          ].map(([title, body], i) => (
            <li key={title} className="flex gap-4">
              <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-sm font-medium tabular-nums">{i + 1}</span>
              <div>
                <p className="font-medium">{title}</p>
                <p className="mt-1 text-muted">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <SiteFooter current="/connect" />
    </main>
  );
}

type User = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

async function Setup({ user, notice }: { user: User; notice: ReactNode }) {
  const [[link], [token], [seen]] = await Promise.all([
    db.select().from(schema.stremioLinks).where(eq(schema.stremioLinks.userId, user.id)).limit(1),
    db.select({ scope: schema.discordTokens.scope }).from(schema.discordTokens).where(eq(schema.discordTokens.userId, user.id)).limit(1),
    db.select({ device: schema.addonEvents.device }).from(schema.addonEvents)
      .where(eq(schema.addonEvents.userId, user.id)).orderBy(desc(schema.addonEvents.ts)).limit(1),
  ]);
  const host = (await headers()).get("host");
  const manifest = `stremio://${host}/${user.addonToken}/manifest.json`;
  const linked = link?.status === "ok";
  const statusOn = !!token;
  // Only the first unfinished step gets the dark button, so it is clear where to start.
  const next = !statusOn ? 1 : !linked ? 2 : !seen ? 3 : 0;
  const cta = (n: number) => (n === next ? buttonPrimary : buttonSecondary);

  return (
    <main className={pageShell}>
      <SiteHeader />
      <h1 className="mt-12 text-3xl font-semibold tracking-[-0.02em]">{next === 0 ? "You're live" : "Your setup"}</h1>
      {notice}
      <ol className="mt-8">
        <Step n={1} done={statusOn} title="Discord status">
          <p>Signed in as {user.discordName}. {statusOn ? "Your status is on." : "Allow us to set your status."}</p>
          {!statusOn && (
            <form action="/api/auth/discord" method="get" className="mt-3">
              <button className={cta(1)}>Allow Discord status</button>
            </form>
          )}
        </Step>

        <Step n={2} done={linked} title="Stremio">
          {linked ? (
            <form action={unlinkStremio} className="flex flex-wrap items-center gap-x-4">
              <p>Linked.</p>
              <button className={`${inlineLinkButton} text-muted`}>Unlink</button>
            </form>
          ) : (
            <form action={linkStremio} className="space-y-3">
              <p>{link ? "Stremio logged you out. Link it again." : "Log in to Stremio once. We store the session key, never your password."}</p>
              <label className="block text-sm font-medium text-ink">
                Stremio email
                <input name="email" type="email" required autoComplete="username" className={`${inputField} mt-1.5 font-normal`} />
              </label>
              <label className="block text-sm font-medium text-ink">
                Stremio password
                <input name="password" type="password" required autoComplete="current-password" className={`${inputField} mt-1.5 font-normal`} />
              </label>
              <button className={cta(2)}>Link Stremio</button>
            </form>
          )}
        </Step>

        <Step n={3} done={!!seen} title="Addon" last>
          {seen ? (
            <div className="flex flex-wrap items-center gap-x-4">
              <p>{seen.device === "Stremio" ? "Seen in Stremio." : `Seen on ${seen.device}.`}</p>
              <a href={manifest} className={`${inlineLinkButton} text-muted`}>Install again</a>
            </div>
          ) : (
            <>
              <p>Install it in Stremio. It tells us which device you&apos;re watching on.</p>
              <a href={manifest} className={`${cta(3)} mt-3`}>Install the addon</a>
            </>
          )}
        </Step>
      </ol>

      <section className="mt-10 rounded-lg border border-line p-5">
        <h2 className="font-semibold">Your live page</h2>
        <p className="mt-1 text-muted">Anyone with this link can see what you&apos;re watching.</p>
        <p className="mt-3 truncate text-sm tabular-nums">{host}/u/{user.slug}</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Link href={`/u/${user.slug}`} className={next === 0 ? buttonPrimary : buttonSecondary}>Open live page</Link>
          <CopyLink url={`https://${host}/u/${user.slug}`} />
        </div>
      </section>

      <div className="mt-10 space-y-1 text-sm">
        <form action={signOut}><button className={`${linkButton} text-muted`}>Sign out</button></form>
        {/* Two steps without JavaScript: the real button only shows after opening this. */}
        <details>
          <summary className={`${linkButton} cursor-pointer list-none text-danger`}>Delete account</summary>
          <form action={deleteAccount} className="mt-2 space-y-3 rounded-md bg-danger-soft p-4">
            <p className="text-danger">This deletes your account, your Stremio link, your Discord status and everything we stored about you. It cannot be undone.</p>
            <button className="inline-flex min-h-11 items-center rounded-md bg-danger px-4 font-medium text-paper">Delete my account</button>
          </form>
        </details>
      </div>
      <SiteFooter current="/connect" />
    </main>
  );
}

// One row of the setup checklist: a numbered marker that turns into a check, joined to the next row by a line.
function Step({ n, done, title, last, children }: { n: number; done: boolean; title: string; last?: boolean; children: ReactNode }) {
  return (
    <li className="relative flex gap-4 pb-8">
      {!last && <span className="absolute left-4 top-10 bottom-1 w-px bg-line" aria-hidden />}
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-medium tabular-nums ${done ? "bg-ink text-paper" : "border border-line text-muted"}`}
        aria-hidden
      >
        {done ? (
          <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg>
        ) : n}
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <h2 className="font-semibold">
          {title} <span className="sr-only">{done ? "(done)" : "(to do)"}</span>
        </h2>
        <div className="mt-1 text-muted [&_input]:text-ink">{children}</div>
      </div>
    </li>
  );
}
