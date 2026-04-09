import Link from "next/link";

import { BetaShell } from "@/components/beta/beta-shell";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { requireBetaSession } from "@/lib/beta-auth";
import { APP_INSTALLER_FILENAME, APP_NAME } from "@/lib/brand";
import { getOpenRouterKeysUrl } from "@/lib/hosted-beta-config";

export const dynamic = "force-dynamic";

export default async function DownloadsPage() {
  const session = await requireBetaSession();

  return (
      <BetaShell
        intro={`Download ${APP_NAME} for desktop, or install the mobile web app to your home screen. Actual book data is intended to stay on the user's own computer or phone instead of inside a shared cloud manuscript database.`}
        session={session}
        title="Downloads and device setup"
      >
      <Card className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          <Chip>Local-first writing</Chip>
          <Chip>Bring your own AI key</Chip>
          <Chip>Use in browser too</Chip>
        </div>
        <div className="grid gap-3">
          <h2 className="text-2xl font-semibold">{APP_NAME} - PC</h2>
          <p className="text-sm leading-7 text-[var(--muted)]">
            Install the Windows desktop build to keep your writing workspace and project library on the local machine.
          </p>
          <a
            className="inline-flex w-fit items-center justify-center rounded-md border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-ink)] shadow-[0_8px_18px_rgba(var(--accent-rgb),0.18)] hover:bg-[var(--accent-strong)] hover:border-[var(--accent-strong)]"
            download
            href={`/downloads/${APP_INSTALLER_FILENAME}`}
          >
            Download {APP_NAME} - PC
          </a>
          <Link className="font-medium text-[var(--accent)] underline" href="/">
            Open the web app now
          </Link>
        </div>
      </Card>

      <Card className="grid gap-4">
        <h2 className="text-2xl font-semibold">{APP_NAME} - Android</h2>
        <p className="text-sm leading-7 text-[var(--muted)]">
          Open the {APP_NAME} site in Chrome on Android, then use the install banner or the browser menu to add it to your
          home screen. If Chrome does not show the banner automatically, open the browser menu and tap <strong>Install app</strong> or{" "}
          <strong>Add to Home screen</strong>.
        </p>
        <p className="text-xs leading-6 text-[var(--muted)]">
          The Android install is a Progressive Web App that stores the installed shell on the device rather than a Play Store package.
        </p>
        <Link className="font-medium text-[var(--accent)] underline" href="/">
          Open the mobile web app
        </Link>
      </Card>

      <Card className="grid gap-4">
        <h2 className="text-2xl font-semibold">{APP_NAME} - iOS</h2>
        <p className="text-sm leading-7 text-[var(--muted)]">
          Open the {APP_NAME} site in Safari on iPhone or iPad, tap the Share button, then choose <strong>Add to Home Screen</strong>.
          iOS uses the apple-touch icon and launches it as a standalone web app.
        </p>
        <p className="text-xs leading-6 text-[var(--muted)]">
          The iPhone install is a home-screen web app rather than an App Store package.
        </p>
        <Link className="font-medium text-[var(--accent)] underline" href="/">
          Open the mobile web app
        </Link>
      </Card>

      <Card className="grid gap-4">
        <h2 className="text-2xl font-semibold">AI key setup</h2>
        <p className="text-sm leading-7 text-[var(--muted)]">
          Every user must supply their own personal AI key. {APP_NAME} does not bundle your personal key into public downloads.
        </p>
        <Link className="font-medium text-[var(--accent)] underline" href={getOpenRouterKeysUrl()}>
          Get an OpenRouter API key
        </Link>
      </Card>
    </BetaShell>
  );
}
