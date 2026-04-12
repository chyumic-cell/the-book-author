import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";

import { BetaShell } from "@/components/beta/beta-shell";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { getOptionalBetaSession } from "@/lib/beta-auth";
import {
  getStoryForgeTermsLastUpdated,
  getStoryForgeTermsSections,
  getStoryForgeTermsSummary,
  getStoryForgeTermsVersion,
} from "@/lib/beta-legal";
import { APP_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function TermsPage() {
  noStore();
  const session = await getOptionalBetaSession();
  const introLines = getStoryForgeTermsSummary();
  const sections = getStoryForgeTermsSections();

  return (
      <BetaShell
        intro={`These are the current ${APP_NAME} Terms and Publishing Policy. Users must accept them before an account can be created.`}
        session={session}
        title="Terms and publishing policy"
      >
      <Card className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          <Chip>Version {getStoryForgeTermsVersion()}</Chip>
          <Chip>Updated {getStoryForgeTermsLastUpdated()}</Chip>
        </div>
        <div className="flex flex-wrap gap-3 text-sm font-medium">
          {session ? (
            <>
              <Link className="text-[var(--accent)] underline" href="/">
                Return to the app
              </Link>
              <Link className="text-[var(--accent)] underline" href="/account">
                Open account
              </Link>
            </>
          ) : (
            <>
              <Link className="text-[var(--accent)] underline" href="/sign-in">
                Sign in
              </Link>
              <Link className="text-[var(--accent)] underline" href="/sign-up">
                Create account
              </Link>
            </>
          )}
        </div>
        <div className="grid gap-3">
          {introLines.map((line, index) => (
            <p key={line} className="text-sm leading-7 text-[var(--muted)]">
              <strong className="mr-2 text-[var(--text)]">{index + 1}.</strong>
              {line}
            </p>
          ))}
        </div>
      </Card>

      {sections.map((section) => (
        <Card key={section.title} className="grid gap-3">
          <h2 className="text-2xl font-semibold">{section.title}</h2>
          <div className="grid gap-3">
            {section.body.map((paragraph) => (
              <p key={paragraph} className="text-sm leading-7 text-[var(--muted)]">
                {paragraph}
              </p>
            ))}
          </div>
        </Card>
      ))}
    </BetaShell>
  );
}
