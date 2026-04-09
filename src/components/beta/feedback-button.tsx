"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function FeedbackButton() {
  const pathname = usePathname();
  const hostedBetaEnabled =
    (process.env.NEXT_PUBLIC_THE_BOOK_AUTHOR_HOSTED_BETA ?? process.env.NEXT_PUBLIC_STORYFORGE_HOSTED_BETA)?.trim() === "true";
  const betaPath = /^\/(downloads|sign-in|sign-up|terms|account|admin|feedback)(\/|$)/.test(pathname);

  if (!hostedBetaEnabled || !betaPath || pathname === "/feedback") {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Link
        className="inline-flex items-center justify-center rounded-md border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-ink)] shadow-[0_8px_18px_rgba(var(--accent-rgb),0.18)] hover:bg-[var(--accent-strong)] hover:border-[var(--accent-strong)]"
        href="/feedback"
      >
        Feedback
      </Link>
    </div>
  );
}
