import Link from "next/link";

import { AppBrandMark } from "@/components/brand/app-brand-mark";
import { AppLegalNotice } from "@/components/storyforge/app-legal-notice";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import {
  APP_ANDROID_APK_DOWNLOAD_PATH,
  APP_INSTALLER_FILENAME,
  APP_NAME,
  APP_PROSE_NAME,
} from "@/lib/brand";
import { getOpenRouterKeysUrl } from "@/lib/hosted-beta-config";

export const dynamic = "force-dynamic";

export default function DownloadsPage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-col gap-6 px-4 py-5 sm:px-6 sm:py-8 lg:px-10">
      <Card className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-r from-[rgba(var(--accent-rgb),0.14)] via-transparent to-[rgba(53,100,77,0.12)]" />
        <div className="relative grid gap-5">
          <div className="flex flex-wrap gap-2">
            <Chip>Downloads</Chip>
            <Chip>Local-first</Chip>
            <Chip>No shared manuscript cloud</Chip>
          </div>
          <div className="grid gap-3">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              <AppBrandMark nameClassName="text-inherit" betaClassName="text-[0.42em]" />
            </h1>
            <p className="max-w-3xl text-base leading-8 text-[var(--muted)]">
              Choose the version you want to install. The desktop app is the main writing environment; the Android APK is the phone build.
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
              Download this on a Windows computer when you want the full local writing workspace and project library.
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
              Download the APK directly for Android. If Android blocks the install, allow installs from your browser or file manager.
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
        <h2 className="text-xl font-semibold">AI key setup</h2>
        <p className="text-sm leading-7 text-[var(--muted)]">
          {APP_PROSE_NAME} does not include a shared AI key in public downloads. Add your own OpenRouter or OpenAI key inside Settings after installation.
        </p>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link className="font-semibold text-[var(--accent)] underline" href={getOpenRouterKeysUrl()}>
            Get an OpenRouter key
          </Link>
          <Link className="font-semibold text-[var(--accent)] underline" href="/terms">
            Terms
          </Link>
          <Link className="font-semibold text-[var(--accent)] underline" href="/feedback">
            Feedback
          </Link>
        </div>
      </Card>

      <AppLegalNotice />
    </main>
  );
}
