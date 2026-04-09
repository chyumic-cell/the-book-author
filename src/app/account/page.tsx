import Link from "next/link";

import { BetaShell } from "@/components/beta/beta-shell";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { canViewAdminConsole, requireBetaSession } from "@/lib/beta-auth";
import { APP_NAME } from "@/lib/brand";
import { getOpenRouterKeysUrl } from "@/lib/hosted-beta-config";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await requireBetaSession();

  return (
      <BetaShell
        intro={`This is your ${APP_NAME} private-beta account dashboard. Use it to confirm your access status, review the current beta model, and reach downloads, feedback, and the policy pages.`}
        session={session}
        title={`Your ${APP_NAME} Account`}
      >
      <Card className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Chip>{session.user.role.toLowerCase()}</Chip>
          <Chip>{session.user.planTier.toLowerCase()}</Chip>
          <Chip>{session.user.username}</Chip>
        </div>
        <div className="grid gap-2">
          <h2 className="text-2xl font-semibold">Account status</h2>
          <p className="text-sm leading-7 text-[var(--muted)]">
            Signed in as <strong className="text-[var(--text)]">{session.user.displayName}</strong>. Your {APP_NAME}
            beta account is active and your terms acceptance is recorded under the current beta policy version.
          </p>
          <p className="text-sm leading-7 text-[var(--muted)]">
            Phase-one private beta is local-first: keep your real projects on your own device. The hosted site currently
            manages access, downloads, feedback, moderation, and policy acceptance.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="font-medium text-[var(--accent)] underline" href="/downloads">
            Open downloads
          </Link>
          <Link className="font-medium text-[var(--accent)] underline" href="/feedback">
            Send feedback
          </Link>
          <Link className="font-medium text-[var(--accent)] underline" href="/terms">
            Review the terms
          </Link>
          {canViewAdminConsole(session.user) ? (
            <Link className="font-medium text-[var(--accent)] underline" href="/admin">
              Open admin console
            </Link>
          ) : null}
          <Link className="font-medium text-[var(--accent)] underline" href={getOpenRouterKeysUrl()}>
            Get your own OpenRouter key
          </Link>
        </div>
      </Card>

      <Card className="grid gap-4">
        <h2 className="text-2xl font-semibold">Sign out</h2>
        <form action="/api/auth/sign-out" method="post">
          <button className="inline-flex items-center justify-center rounded-md border border-[color:var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:border-[color:rgba(var(--accent-rgb),0.35)] hover:bg-[color:var(--panel-soft)]">
            Sign out
          </button>
        </form>
      </Card>
    </BetaShell>
  );
}
