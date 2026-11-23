import type { Metadata } from "next";
import { LegalPage } from "@/app/legal-page";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Terms · ${APP_NAME}` };

export default function TermsPage() {
  return (
    <LegalPage title="Terms" route="/terms" updated="23 November 2026">
      <h2>Beta</h2>
      <p>{APP_NAME} is in beta. Access can be removed at any time.</p>
      <h2>Not official</h2>
      <p>{APP_NAME} is not affiliated with or endorsed by Stremio or Discord.</p>
      <h2>No guarantees</h2>
      <p>The service is provided as is. It may break, change or stop without notice.</p>
      <h2>Your accounts</h2>
      <p>You need your own Stremio and Discord accounts, and you must follow their terms.</p>
      <h2>Fair use</h2>
      <p>Do not attack the service, scrape it, or use it with someone else&apos;s accounts.</p>
      <h2>Law</h2>
      <p>Belgian law applies.</p>
    </LegalPage>
  );
}
