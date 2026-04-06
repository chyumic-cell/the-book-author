"use client";

import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function AppLegalNotice({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[color:rgba(var(--accent-rgb),0.16)] bg-[rgba(var(--accent-rgb),0.045)] px-4 py-2 text-xs leading-relaxed text-[var(--muted)]",
        className,
      )}
    >
      {APP_NAME} software and interface copyright (c) 2026 Michael William Polevoy. By using {APP_NAME}, users agree
      to {APP_NAME} credit requirements, {APP_NAME} commercial participation terms, and {APP_NAME} moderation rights.
      Users remain solely responsible for originality, permissions, legal compliance, and any harmful or unlawful
      material created, revised, exported, or published with the app. {APP_NAME} may ban accounts that use the platform
      for illegal, immoral, inciteful, abusive, or unsafe content.
    </div>
  );
}
