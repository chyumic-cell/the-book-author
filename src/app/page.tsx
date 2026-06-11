import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";

import { AppBrandMark } from "@/components/brand/app-brand-mark";
import { AppLegalNotice } from "@/components/storyforge/app-legal-notice";
import { ProjectLibraryGrid } from "@/components/storyforge/project-library-grid";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import {
  APP_ANDROID_APK_DOWNLOAD_PATH,
  APP_INSTALLER_FILENAME,
  APP_NAME,
  APP_PROSE_NAME,
} from "@/lib/brand";
import { getOpenRouterKeysUrl, isHostedBetaEnabled } from "@/lib/hosted-beta-config";
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
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:gap-8 sm:px-6 sm:py-8 lg:px-10">
      <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <Card className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-r from-[rgba(var(--accent-rgb),0.12)] via-transparent to-[rgba(53,100,77,0.12)]" />
          <div className="relative grid gap-6">
            <div className="flex flex-wrap gap-2">
              <Chip>Tailored Novel Atelier</Chip>
              {hosted ? <Chip>Hosted web workspace</Chip> : null}
            </div>
            <div className="grid gap-4">
              <h1 className="max-w-3xl text-3xl leading-[1.04] tracking-tight sm:text-5xl sm:leading-[1.02]">
                Build books in a sunlit library workspace that remembers the story without swallowing the whole manuscript.
              </h1>
              <p className="max-w-3xl text-base text-[var(--muted)] sm:text-lg">
                {APP_PROSE_NAME} blends a manuscript studio, story bible, developmental editor, and optional AI collaborator into one polished environment. Write by hand, co-write selectively, or let the system draft while structured memory keeps canon, continuity, and momentum intact.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--accent-ink)] shadow-[0_18px_40px_rgba(var(--accent-rgb),0.2)] transition hover:bg-[var(--accent-strong)] sm:w-auto"
                href="/projects/new"
              >
                Start a New Book
              </Link>
              <Link
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[color:var(--line)] bg-white/70 px-5 py-3 text-sm font-semibold text-[var(--text)] transition hover:bg-white sm:w-auto"
                href="/account"
              >
                Open account
              </Link>
              <Link
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[color:var(--line)] bg-white/70 px-5 py-3 text-sm font-semibold text-[var(--text)] transition hover:bg-white sm:w-auto"
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

function HostedDownloadHome() {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-col gap-6 px-4 py-5 sm:px-6 sm:py-8 lg:px-10">
      <Card className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-r from-[rgba(var(--accent-rgb),0.14)] via-transparent to-[rgba(53,100,77,0.12)]" />
        <div className="relative grid gap-5">
          <div className="flex flex-wrap gap-2">
            <Chip>Download center</Chip>
            <Chip>Local-first writing</Chip>
            <Chip>Bring your own AI key</Chip>
          </div>
          <div className="grid gap-3">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              <AppBrandMark nameClassName="text-inherit" betaClassName="text-[0.42em]" />
            </h1>
            <p className="max-w-3xl text-base leading-8 text-[var(--muted)]">
              Download the local Windows app or the Android APK. Your real writing workspace is meant to live on your own device, and each user adds their own OpenRouter or OpenAI key inside the app.
            </p>
          </div>
        </div>
      </Card>

      <section className="grid gap-5 md:grid-cols-2">
        <Card className="grid gap-4">
          <div className="grid gap-2">
            <Chip>Windows desktop</Chip>
            <h2 className="text-2xl font-semibold">{APP_NAME} - PC</h2>
            <p className="text-sm leading-7 text-[var(--muted)]">
              Install the desktop build when you want the full local writing workspace on your computer.
            </p>
          </div>
          <a
            className="inline-flex min-h-11 w-fit items-center justify-center rounded-md border border-[var(--accent)] bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--accent-ink)] shadow-[0_12px_24px_rgba(var(--accent-rgb),0.18)] transition hover:border-[var(--accent-strong)] hover:bg-[var(--accent-strong)]"
            download
            href={`/downloads/${APP_INSTALLER_FILENAME}`}
          >
            Download desktop app
          </a>
        </Card>

        <Card className="grid gap-4">
          <div className="grid gap-2">
            <Chip>Android APK</Chip>
            <h2 className="text-2xl font-semibold">{APP_NAME} - Android</h2>
            <p className="text-sm leading-7 text-[var(--muted)]">
              Download the APK directly for Android phones. Android may ask you to allow installs from your browser or file manager.
            </p>
          </div>
          <a
            className="inline-flex min-h-11 w-fit items-center justify-center rounded-md border border-[var(--accent)] bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--accent-ink)] shadow-[0_12px_24px_rgba(var(--accent-rgb),0.18)] transition hover:border-[var(--accent-strong)] hover:bg-[var(--accent-strong)]"
            download
            href={APP_ANDROID_APK_DOWNLOAD_PATH}
          >
            Download Android APK
          </a>
        </Card>
      </section>

      <Card className="grid gap-3">
        <h2 className="text-xl font-semibold">Before you write</h2>
        <p className="text-sm leading-7 text-[var(--muted)]">
          {APP_PROSE_NAME} does not bundle Michael&apos;s private AI key. After installing, add your own key in Settings.
        </p>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link className="font-semibold text-[var(--accent)] underline" href={getOpenRouterKeysUrl()}>
            Get an OpenRouter key
          </Link>
          <Link className="font-semibold text-[var(--accent)] underline" href="/terms">
            Read the terms
          </Link>
          <Link className="font-semibold text-[var(--accent)] underline" href="/feedback">
            Send feedback
          </Link>
        </div>
      </Card>

      <AppLegalNotice />
    </main>
  );
}

export default async function HomePage() {
  noStore();
  if (isHostedBetaEnabled()) {
    return <HostedDownloadHome />;
  }

  const projects = await listProjects();
  return <AppHome hosted={false} projects={projects} />;
}
