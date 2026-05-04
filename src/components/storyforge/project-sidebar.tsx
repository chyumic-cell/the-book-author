"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { storyForgeTabs } from "@/lib/defaults";
import { isBookRuleNote } from "@/lib/book-rules";
import { cn } from "@/lib/utils";
import type { ProjectWorkspace, StoryForgeTab } from "@/types/storyforge";

function TreeSection({
  defaultOpen = true,
  title,
  count,
  children,
}: {
  defaultOpen?: boolean;
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <details
      className="rounded-lg border border-[color:var(--line)] bg-[color:var(--panel)]"
      data-testid={`sidebar-section-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`}
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-[color:var(--line)] px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)] [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        {typeof count === "number" ? (
          <span className="rounded-md bg-[color:var(--panel-soft)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
            {count}
          </span>
        ) : null}
      </summary>
      <div className="grid gap-1 p-2">{children}</div>
    </details>
  );
}

function TreeButton({
  active,
  label,
  secondary,
  onClick,
}: {
  active?: boolean;
  label: string;
  secondary?: string;
  onClick: () => void;
}) {
  return (
    <button
      data-testid="sidebar-tree-button"
      className={cn(
        "grid w-full gap-1 rounded-md border px-3 py-2 text-left transition",
        active
          ? "border-[color:rgba(var(--accent-rgb),0.35)] bg-[color:rgba(var(--accent-rgb),0.08)]"
          : "border-transparent bg-transparent hover:border-[color:var(--line)] hover:bg-[color:var(--panel-soft)]",
      )}
      onClick={onClick}
      type="button"
    >
      <span className="text-sm font-medium text-[var(--text)]">{label}</span>
      {secondary ? <span className="line-clamp-2 text-xs text-[var(--muted)]">{secondary}</span> : null}
    </button>
  );
}

function ChapterPaneButton({
  active,
  chapterNumber,
  title,
  purpose,
  onClick,
}: {
  active?: boolean;
  chapterNumber: number;
  title: string;
  purpose: string;
  onClick: () => void;
}) {
  return (
    <button
      data-testid="sidebar-chapter-button"
      className={cn(
        "grid w-full gap-2 rounded-lg border bg-white p-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition",
        active
          ? "border-[color:rgba(var(--accent-rgb),0.42)] ring-1 ring-[rgba(var(--accent-rgb),0.12)]"
          : "border-[color:var(--line)] hover:border-[color:rgba(var(--accent-rgb),0.22)] hover:bg-[color:var(--panel-soft)]",
      )}
      onClick={onClick}
      type="button"
    >
      <div className="rounded-md border border-[color:var(--line)] bg-[color:var(--panel-soft)] px-2 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
          Chapter {chapterNumber}
        </div>
        <div className="mt-2 h-8 rounded-sm border border-dashed border-[color:var(--line)] bg-white" />
      </div>
      <div className="grid gap-1">
        <span className="line-clamp-2 text-sm font-semibold text-[var(--text)]">{title || `Chapter ${chapterNumber}`}</span>
        <span className="line-clamp-2 text-xs text-[var(--muted)]">{purpose || "No chapter purpose yet."}</span>
      </div>
    </button>
  );
}

export function ProjectSidebar({
  className,
  activeProjectId,
  activeTab,
  project,
  selectedChapterId,
  onSelectChapter,
  onTabChange,
  projects,
}: {
  className?: string;
  activeProjectId: string;
  activeTab: StoryForgeTab;
  project: ProjectWorkspace;
  selectedChapterId: string | null;
  onSelectChapter: (chapterId: string) => void;
  onTabChange: (tab: StoryForgeTab) => void;
  projects: {
    id: string;
    title: string;
    premise: string;
  }[];
}) {
  const sidebarWorkingNotes = project.workingNotes.filter((note) => !isBookRuleNote(note));

  return (
    <aside className={cn("flex h-full min-h-0 flex-col gap-3 overflow-y-auto pr-1", className)}>
      <div className="rounded-lg border border-[color:var(--line)] bg-[color:var(--panel)] p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="grid gap-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Book Pane</p>
            <h2 className="text-lg font-semibold text-[var(--text)]">{project.title}</h2>
          </div>
          <Link
            className="rounded-md border border-[color:var(--line)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition hover:border-[color:rgba(var(--accent-rgb),0.24)] hover:text-[var(--text)]"
            href="/"
          >
            Library
          </Link>
        </div>
        <p className="mt-2 line-clamp-3 text-xs text-[var(--muted)]">{project.premise}</p>
      </div>

      <TreeSection count={storyForgeTabs.length} title="Views">
        {storyForgeTabs.map((tab) => (
          <TreeButton
            key={tab.id}
            active={activeTab === tab.id}
            label={tab.label}
            onClick={() => onTabChange(tab.id)}
          />
        ))}
      </TreeSection>

      <TreeSection count={project.characters.length} title="Characters">
        {project.characters.map((character) => (
          <TreeButton
            key={character.id}
            active={activeTab === "bible"}
            label={character.name}
            secondary={character.role || character.summary}
            onClick={() => onTabChange("bible")}
          />
        ))}
      </TreeSection>

      <TreeSection count={project.structureBeats.length} title="Story Structure">
        {project.structureBeats.slice(0, 10).map((beat) => (
          <TreeButton
            key={beat.id}
            active={activeTab === "skeleton"}
            label={beat.label}
            secondary={beat.type.replaceAll("_", " ")}
            onClick={() => onTabChange("skeleton")}
          />
        ))}
      </TreeSection>

      <TreeSection count={project.ideaEntries.length + sidebarWorkingNotes.length} defaultOpen={false} title="Idea Vault">
        {project.ideaEntries.slice(0, 8).map((idea) => (
          <TreeButton
            key={idea.id}
            active={activeTab === "ideaLab"}
            label={idea.title}
            secondary={idea.type.replaceAll("_", " ")}
            onClick={() => onTabChange("ideaLab")}
          />
        ))}
        {sidebarWorkingNotes.slice(0, 6).map((note) => (
          <TreeButton
            key={note.id}
            active={activeTab === "ideaLab"}
            label={note.title}
            secondary={note.type.replaceAll("_", " ")}
            onClick={() => onTabChange("ideaLab")}
          />
        ))}
      </TreeSection>

      <TreeSection count={project.chapters.length} defaultOpen={false} title="Chapters">
        {project.chapters.map((chapter) => (
          <ChapterPaneButton
            key={chapter.id}
            active={activeTab === "chapters" && selectedChapterId === chapter.id}
            chapterNumber={chapter.number}
            purpose={chapter.purpose}
            title={chapter.title}
            onClick={() => {
              onSelectChapter(chapter.id);
              onTabChange("chapters");
            }}
          />
        ))}
      </TreeSection>

      <TreeSection count={projects.length} defaultOpen={false} title="Projects">
        {projects.map((entry) => (
          <Link
            key={entry.id}
            className={cn(
              "rounded-md border px-3 py-3 transition",
              entry.id === activeProjectId
                ? "border-[color:rgba(var(--accent-rgb),0.32)] bg-[color:rgba(var(--accent-rgb),0.08)]"
                : "border-[color:var(--line)] bg-white hover:border-[color:rgba(var(--accent-rgb),0.18)] hover:bg-[color:var(--panel-soft)]",
            )}
            href={`/projects/${entry.id}`}
          >
            <div className="grid gap-1">
              <span className="text-sm font-semibold text-[var(--text)]">{entry.title}</span>
              <span className="line-clamp-2 text-xs text-[var(--muted)]">{entry.premise}</span>
            </div>
          </Link>
        ))}
      </TreeSection>
    </aside>
  );
}
