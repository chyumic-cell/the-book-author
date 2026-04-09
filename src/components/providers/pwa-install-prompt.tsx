"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/brand";

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

function isMobileLikeDevice() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 900;
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

export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [hiddenForSession, setHiddenForSession] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const refreshState = () => {
      setInstalled(isStandaloneDisplay());
      setIsIos(isIosBrowser());
      setIsAndroid(isAndroidBrowser());
      setIsMobile(isMobileLikeDevice());
    };

    refreshState();
    window.addEventListener("resize", refreshState);
    window.addEventListener("appinstalled", refreshState);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("resize", refreshState);
      window.removeEventListener("appinstalled", refreshState);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const shouldShow = useMemo(() => {
    if (hiddenForSession || installed || !isMobile) {
      return false;
    }

    return isInstallable || isIos || isAndroid;
  }, [hiddenForSession, installed, isInstallable, isIos, isAndroid, isMobile]);

  async function handleInstall() {
    if (!installEvent) {
      return;
    }

    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") {
      setInstalled(true);
      setHiddenForSession(true);
    }
  }

  if (!shouldShow) {
    return null;
  }

  return (
    <div className="fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[120] md:hidden">
      <div className="rounded-[24px] border border-[color:rgba(var(--accent-rgb),0.18)] bg-white/96 p-4 shadow-[0_24px_48px_rgba(15,23,42,0.18)] backdrop-blur">
        <div className="flex items-start gap-3">
          <Image
            alt={`${APP_NAME} app icon`}
            className="h-12 w-12 rounded-[14px] border border-[color:var(--line)] bg-white object-cover"
            height={48}
            src="/icon.png"
            width={48}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--text)]">Download {APP_NAME}</p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              Add {APP_NAME} to your home screen so it opens like an app with your logo and standalone layout.
            </p>
            {isIos && !isInstallable ? (
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                On iPhone or iPad, tap <strong>Share</strong> and then <strong>Add to Home Screen</strong>.
              </p>
            ) : null}
            {isAndroid && !isInstallable ? (
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                On Android, open the browser menu and tap <strong>Install app</strong> or <strong>Add to Home screen</strong> if the install banner does not appear.
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {isInstallable ? (
            <Button onClick={() => void handleInstall()} type="button">
              Download app
            </Button>
          ) : null}
          <Button onClick={() => setHiddenForSession(true)} type="button" variant="secondary">
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
