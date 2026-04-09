"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandaloneDisplay() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

function isIosBrowser() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isAndroidBrowser() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /android/i.test(navigator.userAgent);
}

export function PwaDownloadActions() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const refreshState = () => {
      setInstalled(isStandaloneDisplay());
      setIsIos(isIosBrowser());
      setIsAndroid(isAndroidBrowser());
    };

    refreshState();
    window.addEventListener("resize", refreshState);
    window.addEventListener("appinstalled", refreshState);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("resize", refreshState);
      window.removeEventListener("appinstalled", refreshState);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const helperText = useMemo(() => {
    if (installed) {
      return "This device already has the web app shell installed. You can keep using it from your home screen.";
    }

    if (installEvent) {
      return "This browser supports the install flow. Tap Install app now and it should add The Book Author to your home screen.";
    }

    if (isIos) {
      return "On iPhone or iPad, tap Share and then Add to Home Screen. Apple does not allow websites to force the install popup.";
    }

    if (isAndroid) {
      return "On Android, open the browser menu and tap Install app or Add to Home screen if the browser does not show its own install banner.";
    }

    return "If this browser does not support installation, you can still use the full web app in the browser right away.";
  }, [installEvent, installed, isAndroid, isIos]);

  async function handleInstall() {
    if (!installEvent) {
      return;
    }

    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") {
      setInstalled(true);
      setInstallEvent(null);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <Link
          className="inline-flex items-center justify-center rounded-md border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-ink)] shadow-[0_8px_18px_rgba(var(--accent-rgb),0.18)] transition hover:bg-[var(--accent-strong)] hover:border-[var(--accent-strong)]"
          href="/"
        >
          Open the app now
        </Link>
        {installEvent ? (
          <Button onClick={() => void handleInstall()} type="button" variant="secondary">
            Install app now
          </Button>
        ) : null}
      </div>
      <p className="text-xs leading-6 text-[var(--muted)]">{helperText}</p>
    </div>
  );
}
