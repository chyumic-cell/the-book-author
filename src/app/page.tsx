import Link from "next/link";

import { BetaShell } from "@/components/beta/beta-shell";
import { AppBrandMark } from "@/components/brand/app-brand-mark";
import { AppLegalNotice } from "@/components/storyforge/app-legal-notice";
import { ProjectLibraryGrid } from "@/components/storyforge/project-library-grid";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { getOptionalBetaSession } from "@/lib/beta-auth";
import { APP_NAME } from "@/lib/brand";
import { isHostedBetaEnabled } from "@/lib/hosted-beta-config";
import { listProjects } from "@/lib/project-data";

export const dynamic = "force-dynamic";

function AppHome({
  hosted,
  projects,
}: {
  hosted: boolean;
  projects: Awaited<ReturnType<typeof listProjects>>;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-6 py-8 lg:px-10">
      <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <Card className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-r from-[rgba(var(--accent-rgb),0.12)] via-transparent to-[rgba(53,100,77,0.12)]" />
          <div className="relative grid gap-6">
            <div className="flex flex-wrap gap-2">
              <Chip>Tailored Novel Atelier</Chip>
              {hosted ? <Chip>Hosted web workspace</Chip> : null}
            </div>
            <div className="grid gap-4">
              <h1 className="max-w-3xl text-5xl leading-[1.02] tracking-tight">
                Build books in a sunlit library workspace that remembers the story without swallowing the whole manuscript.
              </h1>
              <p className="max-w-3xl text-lg text-[var(--muted)]">
                {APP_NAME} blends a manuscript studio, story bible, developmental editor, and optional AI collaborator into one polished environment. Write by hand, co-write selectively, or let the system draft while structured memory keeps canon, continuity, and momentum intact.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                className="inline-flex items-center rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--accent-ink)] shadow-[0_18px_40px_rgba(var(--accent-rgb),0.2)] transition hover:bg-[var(--accent-strong)]"
                href="/projects/new"
              >
                Start a New Book
              </Link>
              <Link
                className="inline-flex items-center rounded-full border border-[color:var(--line)] bg-white/70 px-5 py-3 text-sm font-semibold text-[var(--text)] transition hover:bg-white"
                href="/account"
              >
                Open account
              </Link>
              <Link
                className="inline-flex items-center rounded-full border border-[color:var(--line)] bg-white/70 px-5 py-3 text-sm font-semibold text-[var(--text)] transition hover:bg-white"
                href="/downloads"
              >
                Install on phone
              </Link>
            </div>
          </div>
        </Card>

        <Card className="grid gap-4">
          <Chip>What It Remembers</Chip>
          <ul className="grid gap-3 text-sm text-[var(--muted)]">
            <li>Long-term canon: character arcs, world rules, promises, foreshadowing, and major plot state.</li>
            <li>Short-term context: recent summaries, emotional tone, active objects, injuries, and scene atmosphere.</li>
            <li>User intent: plot direction, themes, prose preferences, and current chapter goals.</li>
            <li>Guidance: chapter-level tension, scene causality, emotional motion, and reader momentum.</li>
          </ul>
        </Card>
      </section>

      <section className="grid gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl">Projects</h2>
            <p className="text-sm text-[var(--muted)]">
              Open an existing manuscript workspace or start a fresh book.
            </p>
          </div>
          <Link
            className="inline-flex items-center rounded-full border border-[color:var(--line)] bg-white/70 px-4 py-2 text-sm font-semibold text-[var(--text)] hover:bg-white"
            href="/projects/new"
          >
            New Project
          </Link>
        </div>

        <ProjectLibraryGrid initialProjects={projects} />
      </section>

      <AppLegalNotice />
    </main>
  );
}

export default async function HomePage() {
  if (isHostedBetaEnabled()) {
    const session = await getOptionalBetaSession();

    if (session) {
      const projects = await listProjects();
      return <AppHome hosted projects={projects} />;
    }

    return (
      <BetaShell
        intro={`${APP_NAME} is a local-first writing platform. Use this site to create your account, review the publishing terms, download the desktop build, install the mobile web app, send feedback, and manage access without placing everyone's manuscripts inside one shared cloud library.`}
        session={session}
        title={<AppBrandMark nameClassName="text-inherit" betaClassName="text-[0.44em]" />}
      >
        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="grid gap-5">
            <div className="flex flex-wrap gap-2">
              <Chip>Local-first writing</Chip>
              <Chip>Per-user AI keys</Chip>
              <Chip>Account-based access</Chip>
            </div>
            <div className="grid gap-3">
              <h2 className="text-3xl font-semibold">
                What <AppBrandMark betaClassName="text-[0.46em]" /> does
              </h2>
              <p className="text-sm leading-7 text-[var(--muted)]">
                {APP_NAME} is a professional writing environment for planning, outlining, drafting, revising, tracking canon, and exporting full-length books with optional AI assistance.
              </p>
              <p className="text-sm leading-7 text-[var(--muted)]">
                The hosted site manages access, policy acceptance, downloads, moderation, feedback, and export oversight, while your actual working library is meant to live on your own computer or phone.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                className="inline-flex items-center rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--accent-ink)] shadow-[0_18px_40px_rgba(var(--accent-rgb),0.2)] transition hover:bg-[var(--accent-strong)]"
                href={session ? "/downloads" : "/sign-up"}
              >
                {session ? "Open downloads" : "Create account"}
              </Link>
              <Link
                className="inline-flex items-center rounded-full border border-[color:var(--line)] bg-white/70 px-5 py-3 text-sm font-semibold text-[var(--text)] transition hover:bg-white"
                href="/terms"
              >
                Read the terms
              </Link>
            </div>
          </Card>

          <Card className="grid gap-4">
            <Chip>How access works</Chip>
            <ul className="grid gap-3 text-sm text-[var(--muted)]">
              <li>Create a {APP_NAME} account with a username and password.</li>
              <li>Accept the {APP_NAME} Terms and Publishing Policy before access is activated.</li>
              <li>Download the desktop app or install the mobile web app to your home screen.</li>
              <li>Bring your own OpenRouter or OpenAI key. {APP_NAME} does not bundle your personal key into public downloads.</li>
              <li>Use the feedback channel if you hit bugs, deployment problems, or confusing UI.</li>
            </ul>
          </Card>
        </section>
      </BetaShell>
    );
  }

  const projects = await listProjects();
  return <AppHome hosted={false} projects={projects} />;
}
