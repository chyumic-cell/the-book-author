"use client";

import { useEffect } from "react";

import { APP_NAME } from "@/lib/brand";

const STALE_BUILD_RECOVERY_KEY = "storyforge-stale-build-recovery";

function isStaleChunkError(error: Error & { digest?: string }) {
  const message = (error.message || "").toLowerCase();
  return (
    message.includes("loading chunk") ||
    message.includes("chunkloaderror") ||
    message.includes("failed to fetch dynamically imported module")
  );
}

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const staleChunkError = isStaleChunkError(error);

  useEffect(() => {
    console.error(error);

    if (!staleChunkError || typeof window === "undefined") {
      return;
    }

    const hasRetried = window.sessionStorage.getItem(STALE_BUILD_RECOVERY_KEY);
    if (hasRetried) {
      return;
    }

    window.sessionStorage.setItem(STALE_BUILD_RECOVERY_KEY, "1");
    const timeout = window.setTimeout(() => {
      window.location.reload();
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [error, staleChunkError]);

  useEffect(() => {
    if (typeof window === "undefined" || staleChunkError) {
      return;
    }

    window.sessionStorage.removeItem(STALE_BUILD_RECOVERY_KEY);
  }, [staleChunkError]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-6 text-[var(--text)]">
      <section className="grid max-w-xl gap-4 rounded-[28px] border border-[color:var(--line)] bg-[color:var(--panel)] p-8 text-center shadow-[0_18px_40px_var(--shadow)]">
        <p className="text-xs uppercase tracking-[0.28em] text-[var(--muted)]">{APP_NAME}</p>
        <h1 className="text-4xl font-semibold">Something went wrong.</h1>
        <p className="text-sm text-[var(--muted)]">
          {staleChunkError
            ? `${APP_NAME} was updated while this window was open. It is reloading the fresh build now.`
            : error.message || `${APP_NAME} hit an unexpected error while loading the workspace.`}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            className="inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--accent-ink)]"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.sessionStorage.removeItem(STALE_BUILD_RECOVERY_KEY);
              }
              reset();
            }}
            type="button"
          >
            Try again
          </button>
          {staleChunkError ? (
            <button
              className="inline-flex items-center justify-center rounded-full border border-[color:var(--line)] bg-white px-5 py-3 text-sm font-semibold text-[var(--text)]"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.sessionStorage.removeItem(STALE_BUILD_RECOVERY_KEY);
                  window.location.reload();
                }
              }}
              type="button"
            >
              Reload app
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}
