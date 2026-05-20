"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, RefreshCw, X } from "lucide-react";

import { AppBrandMark } from "@/components/brand/app-brand-mark";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";
import type { StoryForgeTab } from "@/types/storyforge";

type PrimaryNavId = "guided" | "chapters" | "brain" | "review" | "export";

const PRIMARY_NAV: Array<{ id: PrimaryNavId; tab: StoryForgeTab; label: string; helper: string }> = [
  { id: "guided", tab: "guided", label: "Guided Builder", helper: "Step by step" },
  { id: "chapters", tab: "chapters", label: "Write", helper: "Manuscript" },
  { id: "brain", tab: "brain", label: "Book Brain", helper: "Setup, bible, skeleton" },
  { id: "review", tab: "review", label: "Review", helper: "Continuity and craft" },
  { id: "export", tab: "export", label: "Export", helper: "PDF, EPUB, backup" },
];

function PrimaryNavButton({
  active,
  helper,
  label,
  onClick,
  phoneShell,
}: {
  active: boolean;
  helper: string;
  label: string;
  onClick: () => void;
  phoneShell?: boolean;
}) {
  return (
    <button
      className={cn(
        "grid rounded-xl border px-3 py-2 text-left transition",
        active
          ? "border-white/35 bg-white text-[var(--accent)] shadow-[0_10px_24px_rgba(15,23,42,0.16)]"
          : "border-white/15 bg-white/8 text-white/86 hover:bg-white/14 hover:text-white",
        phoneShell ? "min-h-[50px] gap-0 px-2 py-1.5 text-center" : "min-w-[132px] gap-0.5",
      )}
      onClick={onClick}
      type="button"
    >
      <span className={cn("font-semibold", phoneShell ? "text-xs" : "text-sm")}>{label}</span>
      {!phoneShell ? <span className="text-[11px] opacity-75">{helper}</span> : null}
    </button>
  );
}

function AdvancedSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="grid gap-2 rounded-2xl border border-[color:var(--line)] bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function AdvancedLink({ children, href }: { children: ReactNode; href: string }) {
  return (
    <Link
      className="inline-flex min-h-[38px] items-center justify-center rounded-md border border-[color:var(--line)] bg-white px-3 py-2 text-sm font-semibold text-[var(--text)] transition hover:border-[color:rgba(var(--accent-rgb),0.35)] hover:bg-[color:var(--panel-soft)]"
      href={href}
      prefetch
    >
      {children}
    </Link>
  );
}

function isPrimaryActive(activeTab: StoryForgeTab, navId: PrimaryNavId) {
  if (navId === "brain") {
    return ["brain", "setup", "bible", "skeleton", "ideaLab", "settings"].includes(activeTab);
  }
  if (navId === "review") {
    return ["review", "continuity", "memory"].includes(activeTab);
  }
  return activeTab === navId;
}

export function WorkspaceMenuBar({
  activeTab,
  aiStatusLabel,
  aiWorking,
  autopilotStatus,
  saveState,
  projectId,
  showInspector,
  copilotExpanded,
  canRedo,
  canUndo,
  chapterContextVisible,
  chapterOutlineVisible,
  chapterPlanningVisible,
  chapterSidebarVisible,
  manuscriptZoom,
  phoneShell = false,
  onOpenTab,
  onOpenProviders,
  onOpenGuidedBuilder,
  onRedo,
  onResumeAutopilot,
  onReviseForPacing,
  onReviseForProse,
  onReviseForVoice,
  onRunAutopilotBook,
  onRunAutopilotChapter,
  onRunContinuityCheck,
  onRunExtractMemory,
  onRunBookGuideCheck,
  onRunChapterGuideCheck,
  onRunGenerateDraft,
  onRunGenerateOutline,
  onRunSummarizeChapter,
  onSaveNow,
  onSaveBackup,
  onSyncChapter,
  onToggleChapterContext,
  onToggleChapterOutline,
  onToggleChapterPlanning,
  onToggleChapterSidebar,
  onToggleInspector,
  onToggleCopilot,
  onUndo,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: {
  activeTab: StoryForgeTab;
  aiStatusLabel: string;
  aiWorking: boolean;
  autopilotStatus: string;
  saveState: "idle" | "saving" | "saved" | "error";
  projectId: string;
  showInspector: boolean;
  copilotExpanded: boolean;
  canRedo: boolean;
  canUndo: boolean;
  chapterContextVisible: boolean;
  chapterOutlineVisible: boolean;
  chapterPlanningVisible: boolean;
  chapterSidebarVisible: boolean;
  manuscriptZoom: number;
  phoneShell?: boolean;
  onOpenTab: (tab: StoryForgeTab) => void;
  onOpenProviders: () => void;
  onOpenGuidedBuilder: () => void;
  onRedo: () => void;
  onResumeAutopilot: () => void;
  onReviseForPacing: () => void;
  onReviseForProse: () => void;
  onReviseForVoice: () => void;
  onRunAutopilotBook: () => void;
  onRunAutopilotChapter: () => void;
  onRunBookGuideCheck: () => void;
  onRunChapterGuideCheck: () => void;
  onRunContinuityCheck: () => void;
  onRunExtractMemory: () => void;
  onRunGenerateDraft: () => void;
  onRunGenerateOutline: () => void;
  onRunSummarizeChapter: () => void;
  onSaveNow: () => void;
  onSaveBackup: () => void;
  onSyncChapter: () => void;
  onToggleChapterContext: () => void;
  onToggleChapterOutline: () => void;
  onToggleChapterPlanning: () => void;
  onToggleChapterSidebar: () => void;
  onToggleInspector: () => void;
  onToggleCopilot: () => void;
  onUndo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
}) {
  const router = useRouter();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    router.prefetch("/");
    router.prefetch("/projects/new");
  }, [router]);

  const activeLabel = useMemo(() => {
    if (activeTab === "setup") return "Book Setup";
    if (activeTab === "bible") return "Story Bible";
    if (activeTab === "skeleton") return "Story Skeleton";
    if (activeTab === "ideaLab") return "Idea Lab";
    if (activeTab === "memory") return "Memory";
    if (activeTab === "continuity") return "Continuity";
    if (activeTab === "settings") return "Settings";
    if (activeTab === "help" || activeTab === "about") return "About Us";
    return PRIMARY_NAV.find((entry) => entry.tab === activeTab)?.label ?? APP_NAME;
  }, [activeTab]);

  const openPrimaryTab = (tab: StoryForgeTab) => {
    onOpenTab(tab);
  };

  const advancedPanel = (
    <div className="grid gap-3 rounded-b-[26px] border-x border-b border-[color:var(--line)] bg-[color:var(--panel)] p-3 shadow-[0_18px_34px_var(--shadow)]">
      <div className="grid gap-3 lg:grid-cols-3">
        <AdvancedSection title="Project">
          <AdvancedLink href="/">Library</AdvancedLink>
          <AdvancedLink href="/projects/new">New Book</AdvancedLink>
          <Button onClick={onSaveNow}>Save</Button>
          <Button onClick={onSaveBackup} variant="secondary">
            Backup
          </Button>
        </AdvancedSection>

        <AdvancedSection title="Book Brain Details">
          <Button onClick={() => onOpenTab("setup")} variant={activeTab === "setup" ? "primary" : "secondary"}>
            Book Setup
          </Button>
          <Button onClick={() => onOpenTab("bible")} variant={activeTab === "bible" ? "primary" : "secondary"}>
            Story Bible
          </Button>
          <Button onClick={() => onOpenTab("skeleton")} variant={activeTab === "skeleton" ? "primary" : "secondary"}>
            Story Skeleton
          </Button>
          <Button onClick={() => onOpenTab("ideaLab")} variant={activeTab === "ideaLab" ? "primary" : "secondary"}>
            Idea Lab
          </Button>
          <Button onClick={() => onOpenTab("memory")} variant={activeTab === "memory" ? "primary" : "secondary"}>
            Memory
          </Button>
        </AdvancedSection>

        <AdvancedSection title="AI Engine">
          <Button onClick={onOpenGuidedBuilder} variant={activeTab === "guided" ? "primary" : "secondary"}>
            Guided Builder
          </Button>
          <Button onClick={onRunGenerateOutline} variant="secondary">
            Generate Outline
          </Button>
          <Button onClick={onRunGenerateDraft} variant="secondary">
            Generate Chapter
          </Button>
          <Button onClick={onReviseForProse} variant="secondary">
            Improve Prose
          </Button>
          <Button onClick={onReviseForVoice} variant="secondary">
            Sharpen Voice
          </Button>
          <Button onClick={onReviseForPacing} variant="secondary">
            Rewrite Pacing
          </Button>
          <Button onClick={onRunAutopilotChapter} variant="secondary">
            AI Current Chapter
          </Button>
          <Button onClick={onRunAutopilotBook} variant="secondary">
            AI Do The Rest
          </Button>
          {autopilotStatus !== "IDLE" ? (
            <Button onClick={onResumeAutopilot} variant="secondary">
              Resume Run
            </Button>
          ) : null}
        </AdvancedSection>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <AdvancedSection title="Review">
          <Button onClick={onRunSummarizeChapter} variant="secondary">
            Summarize Chapter
          </Button>
          <Button onClick={onSyncChapter} variant="secondary">
            Sync Chapter
          </Button>
          <Button onClick={onRunExtractMemory} variant="secondary">
            Extract Memory
          </Button>
          <Button onClick={onRunContinuityCheck} variant="secondary">
            Continuity Check
          </Button>
          <Button onClick={onRunChapterGuideCheck} variant="secondary">
            Chapter Guide
          </Button>
          <Button onClick={onRunBookGuideCheck} variant="secondary">
            Whole Book Guide
          </Button>
        </AdvancedSection>

        <AdvancedSection title="Workspace">
          <Button disabled={!canUndo} onClick={onUndo} variant="secondary">
            Undo
          </Button>
          <Button disabled={!canRedo} onClick={onRedo} variant="secondary">
            Redo
          </Button>
          <Button onClick={onToggleCopilot} variant={copilotExpanded ? "primary" : "secondary"}>
            {copilotExpanded ? "Hide AI Dock" : "Show AI Dock"}
          </Button>
          <Button onClick={onToggleInspector} variant={showInspector ? "primary" : "secondary"}>
            {showInspector ? "Hide Inspector" : "Show Inspector"}
          </Button>
          <Button onClick={onOpenProviders} variant="secondary">
            AI Key Settings
          </Button>
          <Button onClick={() => onOpenTab("help")} variant="secondary">
            About Us
          </Button>
        </AdvancedSection>

        <AdvancedSection title="Writing View">
          <Button onClick={onToggleChapterSidebar} variant={chapterSidebarVisible ? "primary" : "secondary"}>
            {chapterSidebarVisible ? "Hide Chapters" : "Show Chapters"}
          </Button>
          <Button onClick={onToggleChapterOutline} variant={chapterOutlineVisible ? "primary" : "secondary"}>
            {chapterOutlineVisible ? "Hide Outline" : "Show Outline"}
          </Button>
          <Button onClick={onToggleChapterPlanning} variant={chapterPlanningVisible ? "primary" : "secondary"}>
            {chapterPlanningVisible ? "Hide Planning" : "Show Planning"}
          </Button>
          <Button onClick={onToggleChapterContext} variant={chapterContextVisible ? "primary" : "secondary"}>
            {chapterContextVisible ? "Hide Context" : "Show Context"}
          </Button>
          <Button onClick={onZoomOut} variant="secondary">
            Zoom -
          </Button>
          <Chip>{manuscriptZoom}%</Chip>
          <Button onClick={onZoomIn} variant="secondary">
            Zoom +
          </Button>
          <Button onClick={onZoomReset} variant="ghost">
            Reset
          </Button>
        </AdvancedSection>
      </div>

      <div className="flex flex-wrap gap-2">
        <AdvancedLink href={`/api/projects/${projectId}/export?format=pdf`}>PDF</AdvancedLink>
        <AdvancedLink href={`/api/projects/${projectId}/export?format=epub`}>EPUB</AdvancedLink>
        <AdvancedLink href={`/api/projects/${projectId}/export?format=md`}>Markdown</AdvancedLink>
        <AdvancedLink href={`/api/projects/${projectId}/export?format=txt`}>TXT</AdvancedLink>
        <AdvancedLink href={`/api/projects/${projectId}/export?format=json`}>Backup JSON</AdvancedLink>
      </div>
    </div>
  );

  return (
    <header className="relative z-30">
      <div
        className={cn(
          "rounded-[26px] bg-[var(--accent)] px-4 py-3 text-white shadow-[0_16px_34px_rgba(var(--accent-rgb),0.22)]",
          phoneShell ? "rounded-[22px] px-3 py-2" : "",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {phoneShell ? (
              <Button
                aria-label="Open main menu"
                className="border-white/20 bg-white/10 px-3 text-white hover:bg-white/18"
                onClick={() => setMobileMenuOpen((current) => !current)}
                variant="ghost"
              >
                {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
              </Button>
            ) : (
              <AppBrandMark className="h-9 w-9 shrink-0" />
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className={cn("truncate font-semibold", phoneShell ? "text-lg" : "text-xl")}>{APP_NAME}</h1>
                <sup className="rounded-full bg-white/16 px-1.5 py-0.5 font-mono text-[10px] font-black tracking-[0.2em] text-white">
                  BETA
                </sup>
              </div>
              <p className={cn("text-white/72", phoneShell ? "text-[11px]" : "text-xs")}>{activeLabel}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Chip className="border-white/20 bg-white/10 text-white">{saveState}</Chip>
            <Chip className="gap-2 border-white/20 bg-white/10 text-white">
              {aiWorking ? <RefreshCw aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : null}
              <span>{aiStatusLabel}</span>
            </Chip>
            {!phoneShell ? (
              <Button
                className="border-white/20 bg-white/10 text-white hover:bg-white/18"
                onClick={onSaveNow}
                variant="ghost"
              >
                Save
              </Button>
            ) : null}
            {!phoneShell ? (
              <Button
                className="border-white/20 bg-white/10 text-white hover:bg-white/18"
                onClick={() => setAdvancedOpen((current) => !current)}
                variant="ghost"
              >
                {advancedOpen ? "Close Advanced" : "Advanced"}
              </Button>
            ) : null}
          </div>
        </div>

        {!phoneShell ? (
          <nav className="mt-4 flex flex-wrap gap-2">
            {PRIMARY_NAV.map((entry) => (
              <PrimaryNavButton
                key={entry.id}
                active={isPrimaryActive(activeTab, entry.id)}
                helper={entry.helper}
                label={entry.label}
                onClick={() => openPrimaryTab(entry.tab)}
              />
            ))}
          </nav>
        ) : null}
      </div>

      {phoneShell && mobileMenuOpen ? (
        <div className="mt-2 grid gap-3 rounded-[22px] border border-[color:var(--line)] bg-[color:var(--panel)] p-3 shadow-[0_18px_34px_var(--shadow)]">
          <div className="grid grid-cols-2 gap-2">
            {PRIMARY_NAV.map((entry) => (
              <PrimaryNavButton
                key={entry.id}
                active={isPrimaryActive(activeTab, entry.id)}
                helper={entry.helper}
                label={entry.label}
                phoneShell
                onClick={() => openPrimaryTab(entry.tab)}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onSaveNow}>Save</Button>
            <Button onClick={() => setAdvancedOpen((current) => !current)} variant="secondary">
              {advancedOpen ? "Hide Advanced" : "Advanced"}
            </Button>
            <Button onClick={() => setMobileMenuOpen(false)} variant="ghost">
              Close menu
            </Button>
          </div>
        </div>
      ) : null}

      {advancedOpen ? <div className="mt-2">{advancedPanel}</div> : null}
    </header>
  );
}
