import Link from "next/link";

import { AppBrandMark } from "@/components/brand/app-brand-mark";
import { AppLegalNotice } from "@/components/storyforge/app-legal-notice";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { canViewAdminConsole } from "@/lib/beta-auth";
import type { BetaSessionRecord } from "@/lib/beta-auth";
import { getStoryForgeOwnerName } from "@/lib/hosted-beta-config";

export function BetaShell({
  children,
  session,
  title,
  intro,
}: {
  children: React.ReactNode;
  session: BetaSessionRecord | null;
  title: string;
  intro: string;
}) {
  return (
    <main className="mx-auto flex h-screen min-h-screen w-full max-w-7xl flex-col gap-6 overflow-y-auto px-6 py-8 lg:px-10">
      <Card className="grid gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Chip>
                <AppBrandMark className="items-center" betaClassName="text-[0.58em]" />
              </Chip>
              <Chip>Copyright (c) 2026 {getStoryForgeOwnerName()}</Chip>
            </div>
            <div className="grid gap-2">
              <h1 className="text-4xl font-semibold">{title}</h1>
              <p className="max-w-4xl text-sm leading-7 text-[var(--muted)]">{intro}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex items-center justify-center rounded-md border border-[color:var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:border-[color:rgba(var(--accent-rgb),0.35)] hover:bg-[color:var(--panel-soft)]"
              href="/downloads"
            >
              Downloads
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded-md border border-[color:var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:border-[color:rgba(var(--accent-rgb),0.35)] hover:bg-[color:var(--panel-soft)]"
              href="/terms"
            >
              Terms
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded-md border border-[color:var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:border-[color:rgba(var(--accent-rgb),0.35)] hover:bg-[color:var(--panel-soft)]"
              href="/feedback"
            >
              Feedback
            </Link>
            {session ? (
              <>
                <Link
                  className="inline-flex items-center justify-center rounded-md border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-ink)] shadow-[0_8px_18px_rgba(var(--accent-rgb),0.18)] hover:bg-[var(--accent-strong)] hover:border-[var(--accent-strong)]"
                  href="/account"
                >
                  Account
                </Link>
                {canViewAdminConsole(session.user) ? (
                  <Link
                    className="inline-flex items-center justify-center rounded-md border border-[color:var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:border-[color:rgba(var(--accent-rgb),0.35)] hover:bg-[color:var(--panel-soft)]"
                    href="/admin"
                  >
                    Admin
                  </Link>
                ) : null}
              </>
            ) : (
              <>
                <Link
                  className="inline-flex items-center justify-center rounded-md border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-ink)] shadow-[0_8px_18px_rgba(var(--accent-rgb),0.18)] hover:bg-[var(--accent-strong)] hover:border-[var(--accent-strong)]"
                  href="/sign-in"
                >
                  Sign in
                </Link>
                <Link
                  className="inline-flex items-center justify-center rounded-md border border-[color:var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:border-[color:rgba(var(--accent-rgb),0.35)] hover:bg-[color:var(--panel-soft)]"
                  href="/sign-up"
                >
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>
      </Card>

      {children}

      <AppLegalNotice />
    </main>
  );
}
