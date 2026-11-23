import type { Metadata } from "next";
import { LegalPage } from "@/app/legal-page";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Privacy · ${APP_NAME}` };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" route="/privacy" updated="23 November 2026">
      <p>{APP_NAME} is a beta run by Senne Bels (Okapi Works, Belgium). This page lists what it stores, why, and how to remove it.</p>

      <h2>What we store</h2>
      <p><strong>From Discord.</strong> Your Discord user ID and display name. If you allow it at sign-in, also a Discord access token and refresh token, encrypted, so we can set your Discord status.</p>
      <p><strong>From Stremio.</strong> You enter your Stremio email and password once. They go straight to Stremio, which returns a session key. We never store your password. We store the session key, encrypted.</p>
      <p><strong>What you are watching.</strong> Every minute we read your recently watched items from your Stremio library. We keep only your current state: title, episode, position, length, device and poster. Each check overwrites the last one. We keep no viewing history.</p>
      <p><strong>Addon requests.</strong> The addon you install tells us when you open a title: the title ID, your device type, your app&apos;s user agent and the time. We delete these after 30 days.</p>

      <h2>Who can see it</h2>
      <ul>
        <li>Anyone with the link to your live page.</li>
        <li>Members of Discord servers where you ran /nowwatching join.</li>
        <li>Anyone who can see your Discord profile, while your status is on.</li>
      </ul>
      <p>We do not sell data, show ads or use trackers or analytics.</p>

      <h2>Services we use</h2>
      <p>Vercel hosts the site. Neon runs the database. Discord and Stremio receive the requests needed to sign you in, read your library and set your status.</p>

      <h2>Your control</h2>
      <ul>
        <li><strong>Unlink Stremio</strong> on the connect page. We stop reading your library and remove your current state.</li>
        <li><strong>Leave a server board</strong> with /nowwatching leave.</li>
        <li><strong>Remove Discord access</strong> under Authorized Apps in your Discord settings. Your Discord status stops.</li>
        <li><strong>Delete your account</strong> on the connect page. Everything we stored about you is deleted right away.</li>
      </ul>

      <h2>Contact</h2>
      <p>Ask in the Discord server where you received beta access.</p>
    </LegalPage>
  );
}
