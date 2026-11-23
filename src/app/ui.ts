// Shared control styles: one definition, used by every page. 48px tall for touch.
// Full width on phones so the main action is easy to hit; content width from sm up.
export const buttonPrimary = "inline-flex min-h-12 w-full items-center justify-center rounded-md bg-ink px-5 font-medium text-paper sm:w-auto";
// One page column for every route, so the left edge never moves between pages.
export const pageShell = "mx-auto flex w-full max-w-xl flex-1 flex-col px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(4rem,env(safe-area-inset-top))]";
// The landing page needs room for the preview beside the pitch; same gutters and safe areas.
export const pageShellWide = pageShell.replace("max-w-xl", "max-w-5xl");
// Same shape as the primary button, for actions that are not the next step.
export const buttonSecondary = "inline-flex min-h-12 w-full items-center justify-center rounded-md bg-track px-5 font-medium text-ink sm:w-auto";
// Quiet secondary action: text link look with a real tap target.
export const linkButton = "inline-flex min-h-11 items-center text-sm underline decoration-line underline-offset-4 hover:decoration-muted";
// A link button inside a line of text: keeps the 44px tap target without making the row taller.
export const inlineLinkButton = `${linkButton} -my-3`;
export const inputField = "min-h-12 w-full rounded-md border border-line bg-transparent px-3";
