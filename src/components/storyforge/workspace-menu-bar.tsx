"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { AppBrandMark } from "@/components/brand/app-brand-mark";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";
import type { StoryForgeTab } from "@/types/storyforge";

type RibbonTabId = "file" | "home" | "edit" | "review" | "ai" | "view" | "settings" | "help";

const RIBBON_TABS: Array<{ id: RibbonTabId; label: string }> = [
  { id: "file", label: "File" },
  { id: "home", label: "Home" },
  { id: "edit", label: "Edit" },
  { id: "review", label: "Review" },
  { id: "ai", label: "AI Engine" },
  { id: "view", label: "View" },
  { id: "settings", label: "Settings" },
  { id: "help", label: "About Us" },
];

function RibbonTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "border-b-2 px-3 py-3 text-sm font-semibold transition",
        active
          ? "border-white bg-white/12 text-white"
          : "border-transparent text-white/82 hover:bg-white/10 hover:text-white",
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function setRibbonAndMaybeOpenTab(
  ribbonTab: RibbonTabId,
  setActiveRibbonTab: (tab: RibbonTabId) => void,
  onOpenTab: (tab: StoryForgeTab) => void,
) {
  setActiveRibbonTab(ribbonTab);
  if (ribbonTab === "help") {
    onOpenTab("help");
  }
}

function RibbonGroup({
  compact = false,
  title,
  children,
}: {
  compact?: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid gap-2",
        compact
          ? "rounded-xl border border-[color:var(--line)] bg-white px-3 py-3"
          : "min-w-[170px] border-r border-[color:var(--line)] pr-4 last:border-r-0 last:pr-0",
      )}
    >
      <div className={cn("flex flex-wrap gap-2", compact && "flex-col [&>*]:w-full")}>{children}</div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{title}</div>
    </div>
  );
}

function RibbonLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      className="inline-flex items-center justify-center rounded-md border border-[color:var(--line)] bg-white px-3 py-2 text-sm font-medium text-[var(--text)] transition hover:border-[color:rgba(var(--accent-rgb),0.28)] hover:bg-[color:var(--panel-soft)]"
      href={href}
      prefetch
    >
      {children}
    </Link>
  );
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
  onRedo: () => void;
  onResumeAutopilot: () => void;
  onReviseForPacing: () => void;
  onReviseForProse: () => void;
  onReviseForVoice: () => void;
  onRunAutopilotBook: () => void;
  onRunAutopilotChapter: () => void;
  onRunContinuityCheck: () => void;
  onRunExtractMemory: () => void;
  onRunBookGuideCheck: () => void;
  onRunChapterGuideCheck: () => void;
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
  const [activeRibbonTab, setActiveRibbonTab] = useState<RibbonTabId>("home");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    router.prefetch("/");
    router.prefetch("/projects/new");
  }, [router]);

  const compactGroup = phoneShell;
  const effectiveMobileMenuOpen = phoneShell && mobileMenuOpen;

  const mobileWorkspaceLinks: Array<{ tab: StoryForgeTab; label: string }> = [
    { tab: "chapters", label: "Writing" },
    { tab: "setup", label: "Book Setup" },
    { tab: "skeleton", label: "Story Skeleton" },
    { tab: "bible", label: "Story Bible" },
    { tab: "ideaLab", label: "Idea Lab" },
    { tab: "memory", label: "Memory" },
    { tab: "continuity", label: "Continuity" },
    { tab: "settings", label: "Settings" },
    { tab: "help", label: "About Us" },
  ];

  const ribbonContent = useMemo(() => {
    switch (activeRibbonTab) {
      case "file":
        return (
            <>
            <RibbonGroup compact={compactGroup} title="Project">
              <RibbonLink href="/">Open Library</RibbonLink>
              <RibbonLink href="/projects/new">New Book</RibbonLink>
            </RibbonGroup>
            <RibbonGroup compact={compactGroup} title="Save">
              <Button onClick={onSaveNow}>Save</Button>
              <Button onClick={onSaveBackup} variant="secondary">
                Save As Backup
              </Button>
            </RibbonGroup>
            <RibbonGroup compact={compactGroup} title="Export">
              <RibbonLink href={`/api/projects/${projectId}/export?format=pdf`}>PDF</RibbonLink>
              <RibbonLink href={`/api/projects/${projectId}/export?format=epub`}>EPUB</RibbonLink>
              <RibbonLink href={`/api/projects/${projectId}/export?format=md`}>Markdown</RibbonLink>
              <RibbonLink href={`/api/projects/${projectId}/export?format=txt`}>TXT</RibbonLink>
              <RibbonLink href={`/api/projects/${projectId}/export?format=json`}>Backup JSON</RibbonLink>
            </RibbonGroup>
          </>
        );
      case "edit":
        return (
          <>
            <RibbonGroup compact={compactGroup} title="Writing">
              <Button disabled={!canUndo} onClick={onUndo} variant="secondary">
                Undo
              </Button>
              <Button disabled={!canRedo} onClick={onRedo} variant="secondary">
                Redo
              </Button>
            </RibbonGroup>
            <RibbonGroup compact={compactGroup} title="Navigation">
              <Button onClick={() => onOpenTab("chapters")} variant={activeTab === "chapters" ? "primary" : "secondary"}>
                Chapter View
              </Button>
              <Button onClick={() => onOpenTab("ideaLab")} variant="secondary">
                Notes
              </Button>
              <Button onClick={() => onOpenTab("setup")} variant="secondary">
                Book Setup
              </Button>
              <Button onClick={() => onOpenTab("skeleton")} variant="secondary">
                Story Skeleton
              </Button>
            </RibbonGroup>
          </>
        );
      case "review":
        return (
          <>
            <RibbonGroup compact={compactGroup} title="Checks">
              <Button onClick={onSyncChapter} variant="secondary">
                Sync Chapter
              </Button>
              <Button onClick={onRunSummarizeChapter} variant="secondary">
                Summarize
              </Button>
              <Button onClick={onRunExtractMemory} variant="secondary">
                Extract Memory
              </Button>
              <Button onClick={onRunContinuityCheck} variant="secondary">
                Run Continuity
              </Button>
              <Button onClick={() => onOpenTab("continuity")} variant={activeTab === "continuity" ? "primary" : "secondary"}>
                Continuity View
              </Button>
            </RibbonGroup>
            <RibbonGroup compact={compactGroup} title="Panels">
              <Button onClick={onToggleInspector} variant="secondary">
                {showInspector ? "Hide Context Pane" : "Show Context Pane"}
              </Button>
            </RibbonGroup>
          </>
        );
      case "ai":
        return (
          <>
            <RibbonGroup compact={compactGroup} title="Providers">
              <Button onClick={onOpenProviders}>AI Engine</Button>
              <Button onClick={onToggleCopilot} variant="secondary">
                {copilotExpanded ? "Hide Command Bar" : "Show Command Bar"}
              </Button>
            </RibbonGroup>
            <RibbonGroup compact={compactGroup} title="AI Access">
              <Button onClick={onToggleCopilot} variant={copilotExpanded ? "primary" : "secondary"}>
                {copilotExpanded ? "Hide AI Bar" : "Show AI Bar"}
              </Button>
              <Button onClick={onOpenProviders} variant="secondary">
                Model Settings
              </Button>
            </RibbonGroup>
            <RibbonGroup compact={compactGroup} title="Chapter Drafting">
              <Button onClick={onRunGenerateOutline} variant="secondary">
                Generate Outline
              </Button>
              <Button onClick={onRunGenerateDraft}>Generate Chapter</Button>
              <Button onClick={onReviseForPacing} variant="secondary">
                Rewrite Pacing
              </Button>
            </RibbonGroup>
            <RibbonGroup compact={compactGroup} title="Chapter Revision">
              <Button onClick={onReviseForProse} variant="secondary">
                Improve Prose
              </Button>
              <Button onClick={onReviseForVoice} variant="secondary">
                Sharpen Voice
              </Button>
            </RibbonGroup>
            <RibbonGroup compact={compactGroup} title="Bestseller Sync">
              <Button onClick={onRunChapterGuideCheck} variant="secondary">
                Chapter Guide
              </Button>
              <Button onClick={onRunBookGuideCheck} variant="secondary">
                Whole Book Guide
              </Button>
            </RibbonGroup>
            <RibbonGroup compact={compactGroup} title="AI Writing Run">
              <Button onClick={onRunAutopilotChapter} variant="secondary">
                Write Current Chapter
              </Button>
              <Button onClick={onRunAutopilotBook} variant="secondary">
                AI Do The Rest
              </Button>
              <Button onClick={onResumeAutopilot} variant="secondary">
                Resume Paused Run
              </Button>
              <Chip>{autopilotStatus.toLowerCase()}</Chip>
            </RibbonGroup>
          </>
        );
      case "view":
        return (
          <>
            <RibbonGroup compact={compactGroup} title="Writing">
              <Button onClick={() => onOpenTab("chapters")} variant={activeTab === "chapters" ? "primary" : "secondary"}>
                Writing View
              </Button>
              <Button onClick={onToggleChapterSidebar} variant={chapterSidebarVisible ? "primary" : "secondary"}>
                {chapterSidebarVisible ? "Hide Chapters" : "Show Chapters"}
              </Button>
              <Button onClick={onToggleChapterContext} variant={chapterContextVisible ? "primary" : "secondary"}>
                {chapterContextVisible ? "Hide Context" : "Show Context"}
              </Button>
            </RibbonGroup>
            <RibbonGroup compact={compactGroup} title="Panels">
              <Button onClick={onToggleChapterOutline} variant={chapterOutlineVisible ? "primary" : "secondary"}>
                {chapterOutlineVisible ? "Hide Outline" : "Show Outline"}
              </Button>
              <Button onClick={onToggleChapterPlanning} variant={chapterPlanningVisible ? "primary" : "secondary"}>
                {chapterPlanningVisible ? "Hide Planning" : "Show Planning"}
              </Button>
              <Button onClick={onToggleCopilot} variant={copilotExpanded ? "primary" : "secondary"}>
                {copilotExpanded ? "Hide AI Bar" : "Show AI Bar"}
              </Button>
              <Button onClick={onToggleInspector} variant={showInspector ? "primary" : "secondary"}>
                {showInspector ? "Hide Inspector" : "Show Inspector"}
              </Button>
            </RibbonGroup>
            <RibbonGroup compact={compactGroup} title="Project">
              <Button onClick={() => onOpenTab("bible")} variant="secondary">
                Character Master
              </Button>
              <Button onClick={() => onOpenTab("skeleton")} variant="secondary">
                Arc Master
              </Button>
              <Button onClick={() => onOpenTab("ideaLab")} variant="secondary">
                Idea Lab
              </Button>
            </RibbonGroup>
          </>
        );
      case "settings":
        return (
          <>
            <RibbonGroup compact={compactGroup} title="Workspace">
              <Button onClick={() => onOpenTab("settings")} variant={activeTab === "settings" ? "primary" : "secondary"}>
                Open Settings
              </Button>
              <Button onClick={onOpenProviders} variant="secondary">
                AI Providers
              </Button>
            </RibbonGroup>
          </>
        );
      case "help":
        return (
          <>
            <RibbonGroup compact={compactGroup} title="About Us">
              <Button onClick={() => onOpenTab("help")}>
                Open About Us
              </Button>
              <Button onClick={() => onOpenTab("about")} variant="secondary">
                About {APP_NAME}
              </Button>
              <RibbonLink href="/terms">Open Terms Page</RibbonLink>
              <Button onClick={onOpenProviders} variant="secondary">
                Where is my AI key?
              </Button>
              <Button onClick={() => onOpenTab("chapters")} variant="secondary">
                Open Writing View
              </Button>
            </RibbonGroup>
          </>
        );
      case "home":
      default:
        return (
          <>
            <RibbonGroup compact={compactGroup} title="Document">
              <Button onClick={onSaveNow}>Save</Button>
              <Button onClick={onSaveBackup} variant="secondary">
                Backup
              </Button>
              <Button onClick={onSyncChapter} variant="secondary">
                Sync Chapter
              </Button>
              <Button disabled={!canUndo} onClick={onUndo} variant="secondary">
                Undo
              </Button>
              <Button disabled={!canRedo} onClick={onRedo} variant="secondary">
                Redo
              </Button>
            </RibbonGroup>
            <RibbonGroup compact={compactGroup} title="Zoom">
              <Button onClick={onZoomOut} variant="secondary">
                Zoom -
              </Button>
              <Button onClick={onZoomReset} variant="secondary">
                {manuscriptZoom}%
              </Button>
              <Button onClick={onZoomIn} variant="secondary">
                Zoom +
              </Button>
            </RibbonGroup>
            <RibbonGroup compact={compactGroup} title="Views">
              <Button onClick={() => onOpenTab("chapters")} variant={activeTab === "chapters" ? "primary" : "secondary"}>
                Writing
              </Button>
              <Button onClick={onToggleChapterOutline} variant={chapterOutlineVisible ? "primary" : "secondary"}>
                Outline
              </Button>
              <Button onClick={onToggleChapterPlanning} variant={chapterPlanningVisible ? "primary" : "secondary"}>
                Planning
              </Button>
              <Button onClick={onToggleChapterContext} variant={chapterContextVisible ? "primary" : "secondary"}>
                Context
              </Button>
            </RibbonGroup>
          </>
        );
    }
  }, [
    activeRibbonTab,
    activeTab,
    canRedo,
    canUndo,
    chapterContextVisible,
    chapterOutlineVisible,
    chapterPlanningVisible,
    chapterSidebarVisible,
    copilotExpanded,
    manuscriptZoom,
    onOpenProviders,
    onOpenTab,
    onRedo,
    onReviseForPacing,
    onReviseForProse,
    onReviseForVoice,
    onResumeAutopilot,
    onRunAutopilotBook,
    onRunAutopilotChapter,
    onRunContinuityCheck,
    onRunExtractMemory,
    onRunBookGuideCheck,
    onRunChapterGuideCheck,
    onRunGenerateDraft,
    onRunGenerateOutline,
    onRunSummarizeChapter,
    onSaveBackup,
    onSaveNow,
    onSyncChapter,
    onToggleChapterContext,
    onToggleChapterOutline,
    onToggleChapterPlanning,
    onToggleChapterSidebar,
    onToggleCopilot,
    onToggleInspector,
    onUndo,
    onZoomIn,
    onZoomOut,
    onZoomReset,
    projectId,
    showInspector,
    autopilotStatus,
    compactGroup,
  ]);

  if (phoneShell) {
    return (
      <>
        <div
          className="sticky top-0 z-50 shrink-0 rounded-2xl border border-[color:var(--line)] bg-[color:var(--panel)] shadow-[0_12px_28px_var(--shadow)]"
          data-testid="workspace-ribbon"
        >
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--accent)] px-3 py-2.5">
            <Button
              aria-label="Open navigation menu"
              className="min-h-10 min-w-10 border-white/20 bg-white/12 px-0 text-white hover:bg-white/18"
              onClick={() => setMobileMenuOpen(true)}
              variant="ghost"
            >
              <span aria-hidden="true" className="text-xl leading-none text-white">
                ≡
              </span>
            </Button>
            <div className="min-w-0 flex-1">
              <AppBrandMark
                className="items-center text-white"
                nameClassName="truncate text-lg text-white"
                betaClassName="text-[0.5em] text-white"
              />
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">
                {RIBBON_TABS.find((tab) => tab.id === activeRibbonTab)?.label ?? "Home"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Chip className="border-white/18 bg-white/14 text-white">
                <span className="inline-flex items-center gap-1.5">
                  <RefreshCw className={cn("h-3.5 w-3.5", aiWorking && "animate-spin")} />
                  <span className="max-w-[8.5rem] truncate">{aiStatusLabel}</span>
                </span>
              </Chip>
              <Chip className="border-white/18 bg-white/14 text-white">{saveState}</Chip>
            </div>
          </div>
        </div>

        {effectiveMobileMenuOpen ? (
          <div className="fixed inset-0 z-[90] bg-slate-950/38" onClick={() => setMobileMenuOpen(false)} role="presentation">
            <aside
              className="h-full w-[min(88vw,22rem)] overflow-y-auto border-r border-[color:var(--line)] bg-[color:var(--panel-soft)] px-3 py-3 shadow-[0_24px_48px_rgba(15,23,42,0.26)]"
              onClick={(event) => {
                event.stopPropagation();
                const target = event.target as HTMLElement;
                if (target.closest("button, a")) {
                  window.setTimeout(() => setMobileMenuOpen(false), 0);
                }
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="grid gap-1">
                  <AppBrandMark nameClassName="text-lg" />
                  <p className="text-xs text-[var(--muted)]">Phone workspace menu</p>
                </div>
                <Button className="min-h-10 min-w-10 px-0" onClick={() => setMobileMenuOpen(false)} variant="secondary">
                  ×
                </Button>
              </div>

              <div className="mt-4 grid gap-3">
                <RibbonGroup compact title="Workspace">
                  {mobileWorkspaceLinks.map((entry) => (
                    <Button
                      key={entry.tab}
                      onClick={() => onOpenTab(entry.tab)}
                      variant={activeTab === entry.tab ? "primary" : "secondary"}
                    >
                      {entry.label}
                    </Button>
                  ))}
                  <RibbonLink href="/">Open Library</RibbonLink>
                  <RibbonLink href="/projects/new">New Book</RibbonLink>
                </RibbonGroup>

                <RibbonGroup compact title="Sections">
                  {RIBBON_TABS.map((tab) => (
                    <Button
                      key={tab.id}
                      onClick={() => setRibbonAndMaybeOpenTab(tab.id, setActiveRibbonTab, onOpenTab)}
                      variant={activeRibbonTab === tab.id ? "primary" : "secondary"}
                    >
                      {tab.label}
                    </Button>
                  ))}
                </RibbonGroup>

                <div className="grid gap-3">{ribbonContent}</div>
              </div>
            </aside>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div
      className="sticky top-0 z-50 shrink-0 rounded-xl border border-[color:var(--line)] bg-[color:var(--panel)] shadow-[0_12px_28px_var(--shadow)]"
      data-testid="workspace-ribbon"
    >
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-t-xl bg-[var(--accent)] px-4 py-2"
        data-testid="workspace-ribbon-tabs"
      >
        <div className="flex flex-wrap items-center gap-1">
          <AppBrandMark
            className="mr-3 items-center text-white"
            nameClassName="text-xl text-white"
            betaClassName="text-[0.52em] text-white"
          />
          {RIBBON_TABS.map((tab) => (
            <RibbonTabButton
              key={tab.id}
              active={activeRibbonTab === tab.id}
              label={tab.label}
              onClick={() => setRibbonAndMaybeOpenTab(tab.id, setActiveRibbonTab, onOpenTab)}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Chip className="border-white/18 bg-white/14 text-white">Ctrl+S saves</Chip>
          <Chip className="border-white/18 bg-white/14 text-white">
            <span className="inline-flex items-center gap-1.5">
              <RefreshCw className={cn("h-3.5 w-3.5", aiWorking && "animate-spin")} />
              <span>AI: {aiStatusLabel}</span>
            </span>
          </Chip>
          <Chip className="border-white/18 bg-white/14 text-white">Status: {saveState}</Chip>
        </div>
      </div>

      <div
        className="flex flex-wrap items-stretch gap-4 overflow-x-auto bg-[color:var(--panel-soft)] px-4 py-3"
        data-testid="workspace-ribbon-content"
      >
        {ribbonContent}
      </div>
    </div>
  );
}
