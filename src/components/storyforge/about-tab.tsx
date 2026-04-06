"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { APP_NAME } from "@/lib/brand";

import type { StoryForgeTab } from "@/types/storyforge";

const INTRO_SENTENCES = [
  `${APP_NAME} is a professional long-form writing system built to help authors plan, draft, revise, and export books in one workspace.`,
  "It combines a manuscript studio with story structure, character intelligence, continuity tracking, and AI-assisted revision tools designed for serious fiction work.",
  "The manuscript remains the source of truth, while the surrounding planning and memory systems exist to strengthen clarity, momentum, and canon instead of interrupting the writing flow.",
  "Authors can write manually, collaborate selectively with AI, or run guided long-form drafting while keeping direct editorial control over what is accepted, rejected, or changed.",
  `${APP_NAME} is intended to produce portable, publication-ready manuscripts and reader-facing exports while preserving editorial control, workflow clarity, and professional drafting discipline.`,
];

const ABOUT_POINTS = [
  `${APP_NAME} software, interface, and packaged installers are copyrighted to Michael William Polevoy unless a later written license or transfer states otherwise.`,
  `${APP_NAME} is designed as a professional writing environment that keeps drafting, planning, continuity, and export tools in one place without forcing rigid workflow.`,
  "Each installation should use its own personal AI API credentials. Private keys should not be embedded in shared installers or public app bundles.",
  `${APP_NAME} is intended for desktop and mobile writing work, with desktop offering the deepest writing surface and mobile focusing on AI-led drafting plus human-led planning.`,
  `Formal contractual rules for use, publication, moderation, and eligibility live on the dedicated Terms page rather than on this About ${APP_NAME} page.`,
];

export function AboutTab({
  onOpenProviders,
  onOpenTab,
}: {
  onOpenProviders: () => void;
  onOpenTab: (tab: StoryForgeTab) => void;
}) {
  return (
    <div className="grid gap-4">
      <Card className="grid gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Chip>About {APP_NAME}</Chip>
              <Chip>Copyright and Use</Chip>
            </div>
            <div>
              <h3 className="text-3xl font-semibold">About {APP_NAME}</h3>
              <p className="mt-2 max-w-4xl text-sm text-[var(--muted)]">
                A professional overview of what {APP_NAME} is designed to do, how it should be distributed, and how
                the writing environment is intended to be used across desktop and mobile.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => onOpenTab("chapters")}>Open Writing View</Button>
            <Button onClick={() => onOpenTab("help")} variant="secondary">
              Open About Us Guide
            </Button>
            <Button onClick={onOpenProviders} variant="secondary">
              AI Key Setup
            </Button>
          </div>
        </div>
      </Card>

      <Card className="grid gap-4">
        <div>
          <h4 className="text-2xl font-semibold">What {APP_NAME} Does</h4>
          <p className="text-sm text-[var(--muted)]">
            This is the short professional introduction shown in-app for new users, collaborators, and reviewers.
          </p>
        </div>
        <div className="grid gap-3">
          {INTRO_SENTENCES.map((sentence, index) => (
            <p key={sentence} className="text-sm leading-7 text-[var(--muted)]">
              <strong className="mr-2 text-[var(--text)]">{index + 1}.</strong>
              {sentence}
            </p>
          ))}
        </div>
      </Card>

      <Card className="grid gap-4">
        <div>
          <h4 className="text-2xl font-semibold">Product overview and distribution notes</h4>
          <p className="text-sm text-[var(--muted)]">
            This page explains what {APP_NAME} is and how it is meant to be used. The formal contractual rules,
            publishing policy, and acceptance requirements live only on the dedicated Terms page.
          </p>
        </div>
        <div className="rounded-[24px] border border-[color:rgba(var(--accent-rgb),0.18)] bg-[rgba(var(--accent-rgb),0.04)] p-4 text-sm leading-7 text-[var(--muted)]">
          <strong className="text-[var(--text)]">Software copyright:</strong> {APP_NAME} software and interface
          copyright (c) 2026 Michael William Polevoy.
        </div>
        <div className="grid gap-3">
          {ABOUT_POINTS.map((point) => (
            <div key={point} className="rounded-[24px] border border-[color:var(--line)] bg-[color:var(--panel-soft)]/72 p-4">
              <p className="text-sm leading-7 text-[var(--muted)]">{point}</p>
            </div>
          ))}
        </div>
        <div className="rounded-[24px] border border-[color:rgba(var(--accent-rgb),0.18)] bg-[rgba(var(--accent-rgb),0.04)] p-4 text-sm leading-7 text-[var(--muted)]">
          <strong className="text-[var(--text)]">Formal terms:</strong> {APP_NAME} use is governed by the dedicated Terms page.
          Review and accept those terms before using the app.
          <div className="mt-3">
            <Link className="font-medium text-[var(--accent)] underline" href="/terms">
              Open Terms page
            </Link>
          </div>
        </div>
        <div className="rounded-[24px] border border-[color:rgba(var(--accent-rgb),0.18)] bg-[rgba(var(--accent-rgb),0.04)] p-4 text-sm leading-7 text-[var(--muted)]">
          <strong className="text-[var(--text)]">Recommended public distribution path:</strong> share the Windows installer
          publicly and require each machine to add its own API key. Keep the phone web build private until per-user project
          isolation is in place, so readers and testers do not share one server-side library or one set of credentials.
        </div>
      </Card>
    </div>
  );
}
