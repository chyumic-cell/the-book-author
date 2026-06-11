"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { APP_ANDROID_APK_DOWNLOAD_PATH, APP_NAME } from "@/lib/brand";

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

function isAndroidBrowser() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /android/i.test(navigator.userAgent);
}

export function PwaInstallPrompt() {
  const pathname = usePathname();
  const [hiddenForSession, setHiddenForSession] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const refreshState = () => {
      setInstalled(isStandaloneDisplay());
      setIsAndroid(isAndroidBrowser());
      setIsMobile(isMobileLikeDevice());
    };

    refreshState();
    window.addEventListener("resize", refreshState);
    window.addEventListener("appinstalled", refreshState);

    return () => {
      window.removeEventListener("resize", refreshState);
      window.removeEventListener("appinstalled", refreshState);
    };
  }, []);

  const shouldShow = useMemo(() => {
    if (hiddenForSession || installed || !isMobile) {
      return false;
    }

    if (!isAndroid) {
      return false;
    }

    if (pathname && pathname !== "/" && pathname !== "/downloads") {
      return false;
    }

    return true;
  }, [hiddenForSession, installed, isAndroid, isMobile, pathname]);

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
            <p className="text-sm font-semibold text-[var(--text)]">Download {APP_NAME} for Android</p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              Install the APK directly so the phone build opens like a normal app.
            </p>
            {isAndroid ? (
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                On Android, download the APK directly. Android may ask you to allow installs from this browser or file manager.
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {isAndroid ? (
            <a
              className="inline-flex items-center justify-center rounded-md border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-ink)] shadow-[0_8px_18px_rgba(var(--accent-rgb),0.18)] transition hover:border-[var(--accent-strong)] hover:bg-[var(--accent-strong)]"
              download
              href={APP_ANDROID_APK_DOWNLOAD_PATH}
            >
              Download APK
            </a>
          ) : null}
          <Button onClick={() => setHiddenForSession(true)} type="button" variant="secondary">
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
