"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { toast } from "sonner";

import { requestJson } from "@/components/storyforge/workspace-helpers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { APP_NAME, APP_PROSE_NAME } from "@/lib/brand";
import { aiRoleOptions } from "@/lib/defaults";
import { cn } from "@/lib/utils";
import type {
  AiRole,
  ContextPackage,
  ProjectChatActionRecord,
  ProjectChatScope,
  ProjectChatTurnRecord,
  ProjectWorkspace,
  StoryForgeTab,
} from "@/types/storyforge";

type AssistantPayload = {
  reply: string;
  actions: ProjectChatActionRecord[];
  proposedActions?: AssistantPlanAction[];
  proposedChanges?: BookAuthorBrainChange[];
  requiresApproval?: boolean;
  nextRecommendedAction?: string;
  project: ProjectWorkspace;
  contextPackage: ContextPackage | null;
  scope: ProjectChatScope;
  nextTab: StoryForgeTab | null;
};

type AssistantPlanAction = Record<string, unknown>;

type BookAuthorBrainChange = {
  id: string;
  kind: string;
  targetLabel: string;
  proposedValue?: string;
  reason: string;
};

type PendingPreview = {
  message: string;
  scope: ProjectChatScope;
  actions: AssistantPlanAction[];
  changes: BookAuthorBrainChange[];
  selectedIndexes: Set<number>;
};

type PhoneQuickAction = {
  id: string;
  label: string;
  onClick: () => void;
};

type TargetedFieldPayload = {
  project: ProjectWorkspace;
  contextPackage: ContextPackage | null;
};

function buildGreeting(projectId: string, projectTitle: string): ProjectChatTurnRecord {
  return {
    id: `greeting-${projectId}`,
    role: "assistant",
    text: `Talk to me plainly. I can brainstorm, coach, critique, or apply changes directly to ${projectTitle} when you ask.`,
    scope: "AUTO",
    createdAt: new Date().toISOString(),
    actions: [],
  };
}

function normalizeInstruction(value: string) {
  return value.trim().toLowerCase();
}

function looksLikeAllChapterOutlineRequest(message: string) {
  const lower = normalizeInstruction(message);
  const mentionsAllChapters =
    lower.includes("all chapters") ||
    lower.includes("each chapter") ||
    lower.includes("every chapter") ||
    lower.includes("all chapter") ||
    lower.includes("each outline") ||
    lower.includes("all outlines");
  const mentionsOutlineWork =
    lower.includes("outline") ||
    lower.includes("outlines") ||
    lower.includes("chapter runway") ||
    lower.includes("story skeleton") ||
    (lower.includes("titles") && lower.includes("chapters")) ||
    (lower.includes("chapter names") && !lower.includes("name a character"));
  return mentionsAllChapters && mentionsOutlineWork;
}

function inferPlanningAction(message: string): "develop" | "expand" | "tighten" {
  const lower = normalizeInstruction(message);
  if (lower.includes("tighten") || lower.includes("shorter") || lower.includes("trim")) {
    return "tighten";
  }
  if (lower.includes("expand") || lower.includes("fuller") || lower.includes("more detail")) {
    return "expand";
  }
  return "develop";
}

function chapterDraftItem(chapter: ProjectWorkspace["chapters"][number]) {
  return {
    title: chapter.title,
    purpose: chapter.purpose,
    currentBeat: chapter.currentBeat,
    targetWordCount: chapter.targetWordCount,
    desiredMood: chapter.desiredMood,
    outline: chapter.outline,
    draft: chapter.draft,
    notes: chapter.notes,
    keyBeats: chapter.keyBeats,
    requiredInclusions: chapter.requiredInclusions,
    forbiddenElements: chapter.forbiddenElements,
    sceneList: chapter.sceneList,
  };
}

function needsForcedChapterTitle(title: string, chapterNumber: number) {
  const normalized = title.trim().toLowerCase();
  return (
    !normalized ||
    normalized === `chapter ${chapterNumber}` ||
    normalized === `chapter ${chapterNumber}:` ||
    normalized.startsWith(`chapter ${chapterNumber} `)
  );
}

function looksLikeAllChapterDraftRequest(message: string) {
  const lower = normalizeInstruction(message);
  const mentionsWriting =
    lower.includes("write the whole book") ||
    lower.includes("write all chapters") ||
    lower.includes("write all three chapters") ||
    lower.includes("write the three chapters") ||
    lower.includes("draft all chapters") ||
    (lower.includes("write") && lower.includes("three chapters")) ||
    (lower.includes("write") && lower.includes("whole book"));
  return mentionsWriting;
}

export function ProjectCopilotBar({
  activeAiRole,
  expanded,
  dockClassName,
  phoneShell,
  onBeforeSubmit,
  onOpenProviders,
  phoneQuickActions = [],
  project,
  selectedChapterId,
  onContextPackage,
  onExpandedChange,
  onProjectUpdate,
  onRoleChange,
  onTabChange,
}: {
  activeTab: StoryForgeTab;
  activeAiRole: AiRole;
  expanded: boolean;
  dockClassName?: string;
  phoneShell?: boolean;
  onBeforeSubmit?: (options: {
    message: string;
    applyChanges: boolean;
    scope: ProjectChatScope;
  }) => Promise<void>;
  onOpenProviders: () => void;
  phoneQuickActions?: PhoneQuickAction[];
  project: ProjectWorkspace;
  selectedChapterId: string | null;
  onContextPackage: (contextPackage: ContextPackage | null) => void;
  onExpandedChange: (expanded: boolean) => void;
  onProjectUpdate: (project: ProjectWorkspace) => void;
  onRoleChange: (role: AiRole) => void;
  onTabChange: (tab: StoryForgeTab) => void;
}) {
  const [message, setMessage] = useState("");
  const [applyChanges, setApplyChanges] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pendingPreview, setPendingPreview] = useState<PendingPreview | null>(null);
  const [turns, setTurns] = useState<ProjectChatTurnRecord[]>(() => [buildGreeting(project.id, project.title)]);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const activeRoleLabel = useMemo(
    () => aiRoleOptions.find((option) => option.id === activeAiRole)?.label ?? "Assistant",
    [activeAiRole],
  );
  const greeting = useMemo(() => buildGreeting(project.id, project.title), [project.id, project.title]);

  useEffect(() => {
    setTurns([greeting]);
  }, [greeting]);

  useEffect(() => {
    const node = bodyRef.current;
    if (!node || !expanded) {
      return;
    }

    node.scrollTop = node.scrollHeight;
  }, [expanded, turns]);

  async function runAllChapterOutlineWorkflow(nextMessage: string): Promise<AssistantPayload> {
    let workingProject = project;
    let latestContext: ContextPackage | null = null;
    const lower = normalizeInstruction(nextMessage);
    const action = inferPlanningAction(nextMessage);
    const wantsTitles =
      lower.includes("title") ||
      lower.includes("titles") ||
      lower.includes("name each chapter") ||
      lower.includes("chapter names");
    const wantsPurpose =
      lower.includes("purpose") ||
      lower.includes("purposes") ||
      lower.includes("what each chapter should do");
    const wantsCurrentBeat = lower.includes("current beat") || lower.includes("beats");
    const wantsSceneList = lower.includes("scene list") || lower.includes("scene by scene") || lower.includes("scene-by-scene");
    const wantsKeyBeats = lower.includes("key beats") || lower.includes("major beats");
    const wantsDesiredMood = lower.includes("desired mood") || lower.includes("mood");
    const wantsRequiredInclusions = lower.includes("required inclusions") || lower.includes("must include");
    const wantsForbiddenElements = lower.includes("forbidden elements") || lower.includes("must not include");
    const wantsOutline = true;
    const wantsOutlineRevision =
      lower.includes("fix") ||
      lower.includes("tighten") ||
      lower.includes("slight") ||
      lower.includes("sharpen") ||
      lower.includes("polish") ||
      lower.includes("improve");
    const fieldsToTouch: Array<{ key: string; label: string }> = [];

    if (wantsTitles) {
      fieldsToTouch.push({ key: "title", label: "Title" });
    }
    if (wantsPurpose) {
      fieldsToTouch.push({ key: "purpose", label: "Purpose" });
    }
    if (wantsCurrentBeat) {
      fieldsToTouch.push({ key: "currentBeat", label: "Current beat" });
    }
    if (wantsKeyBeats) {
      fieldsToTouch.push({ key: "keyBeats", label: "Key beats" });
    }
    if (wantsRequiredInclusions) {
      fieldsToTouch.push({ key: "requiredInclusions", label: "Required inclusions" });
    }
    if (wantsForbiddenElements) {
      fieldsToTouch.push({ key: "forbiddenElements", label: "Forbidden elements" });
    }
    if (wantsDesiredMood) {
      fieldsToTouch.push({ key: "desiredMood", label: "Desired mood" });
    }
    if (wantsSceneList) {
      fieldsToTouch.push({ key: "sceneList", label: "Scene list" });
    }
    if (wantsOutline) {
      fieldsToTouch.push({ key: "outline", label: "Outline" });
    }

    const touchedLabels = new Set<string>();
    const chaptersInOrder = [...workingProject.chapters].sort((left, right) => left.number - right.number);
    const batchSize = 3;

    for (let index = 0; index < chaptersInOrder.length; index += batchSize) {
      const batch = chaptersInOrder.slice(index, index + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (chapter) => {
          let workingChapter = workingProject.chapters.find((entry) => entry.id === chapter.id) ?? chapter;
          const localTouched = new Set<string>();
          const chapterInstruction = [
            nextMessage,
            `Focus only on Chapter ${workingChapter.number}.`,
            "Use what this chapter sets up from earlier chapters and what later chapters still need, but do not act as if later events have already happened inside this chapter.",
            "Do not restart the story or repeat the opening movement midway through the chapter outline.",
          ].join("\n\n");

          if (!workingChapter.outline.trim()) {
            const outlineData = await requestJson<{
              run: { suggestion: string };
              contextPackage: ContextPackage;
            }>(`/api/chapters/${workingChapter.id}/generate/outline`, { method: "POST" });
            latestContext = outlineData.contextPackage;
            const saveData = await requestJson<{ project: ProjectWorkspace }>(`/api/chapters/${workingChapter.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ outline: outlineData.run.suggestion }),
            });
            workingChapter = saveData.project.chapters.find((entry) => entry.id === chapter.id) ?? workingChapter;
            localTouched.add(`Chapter ${workingChapter.number} outline`);
          }

          for (const field of fieldsToTouch) {
            if (field.key === "outline" && workingChapter.outline.trim() && !wantsOutlineRevision) {
              continue;
            }
            const draftItem = chapterDraftItem(workingChapter) as Record<string, unknown>;
            const rawCurrentValue = draftItem[field.key];
            const currentValue = Array.isArray(rawCurrentValue)
              ? rawCurrentValue.join("\n")
              : String(rawCurrentValue ?? "");
            const data = await requestJson<TargetedFieldPayload>(`/api/projects/${project.id}/targeted-ai`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                scope: "SKELETON",
                targetEntityType: "chapter",
                itemId: workingChapter.id,
                itemTitle: workingChapter.title,
                fieldKey: field.key,
                fieldLabel: field.label,
                action,
                currentValue,
                instruction: chapterInstruction,
                draftItem,
              }),
            });
            latestContext = data.contextPackage ?? latestContext;
            workingChapter = data.project.chapters.find((entry) => entry.id === chapter.id) ?? workingChapter;
            localTouched.add(`Chapter ${workingChapter.number} ${field.label.toLowerCase()}`);
          }

          return Array.from(localTouched);
        }),
      );

      for (const touched of batchResults) {
        for (const label of touched) {
          touchedLabels.add(label);
        }
      }

      const latestProject = await requestJson<{ project: ProjectWorkspace }>(`/api/projects/${project.id}`);
      workingProject = latestProject.project;
    }

    return {
      reply: `I updated all ${workingProject.chapters.length} chapter runway entries and touched ${touchedLabels.size} planning targets across the chapter outlines. The chapter-level edits stayed in the chapter runway instead of drifting into notes or the manuscript.`,
      actions: [],
      project: workingProject,
      contextPackage: latestContext,
      scope: "SKELETON",
      nextTab: "skeleton",
    };
  }

  async function runAllChapterDraftWorkflow(nextMessage: string): Promise<AssistantPayload> {
    let workingProject = project;
    let latestContext: ContextPackage | null = null;
    const chaptersInOrder = [...workingProject.chapters].sort((left, right) => left.number - right.number);
    const chaptersNeedingOutlines = chaptersInOrder.some((chapter) => !chapter.outline.trim());

    if (chaptersNeedingOutlines) {
      const outlineResult = await runAllChapterOutlineWorkflow(
        `${nextMessage}\n\nBefore drafting, make sure every chapter has a usable title, purpose, current beat, and outline.`,
      );
      workingProject = outlineResult.project;
      latestContext = outlineResult.contextPackage;
    }

    const draftBatchSize = 2;

    for (let index = 0; index < chaptersInOrder.length; index += draftBatchSize) {
      const batch = chaptersInOrder.slice(index, index + draftBatchSize);
      await Promise.all(
        batch.map(async (chapter) => {
          const workingChapter = workingProject.chapters.find((entry) => entry.id === chapter.id) ?? chapter;
          const notePrefix = workingChapter.notes?.trim() ? `${workingChapter.notes.trim()}\n\n` : "";
          await requestJson<{ project: ProjectWorkspace }>(`/api/chapters/${workingChapter.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              notes: `${notePrefix}Drafting instruction:\n${nextMessage}`.trim(),
            }),
          });

          let lastError: Error | null = null;
          for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
              const draftData = await requestJson<{
                run: { suggestion: string };
                contextPackage: ContextPackage;
              }>(`/api/chapters/${workingChapter.id}/generate/draft`, { method: "POST" });
              latestContext = draftData.contextPackage;
              await requestJson<{ project: ProjectWorkspace }>(`/api/chapters/${workingChapter.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  draft: draftData.run.suggestion,
                  status: "DRAFTING",
                }),
              });
              return;
            } catch (error) {
              lastError = error instanceof Error ? error : new Error("Could not draft chapter.");
              await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
            }
          }

          throw lastError ?? new Error("Could not draft chapter.");
        }),
      );

      const latestProject = await requestJson<{ project: ProjectWorkspace }>(`/api/projects/${project.id}`);
      workingProject = latestProject.project;
    }

    for (const chapter of [...workingProject.chapters].sort((left, right) => left.number - right.number)) {
      const workingChapter = workingProject.chapters.find((entry) => entry.id === chapter.id) ?? chapter;
      if (!needsForcedChapterTitle(workingChapter.title, workingChapter.number)) {
        continue;
      }

      const titleData = await requestJson<TargetedFieldPayload>(`/api/projects/${project.id}/targeted-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "SKELETON",
          targetEntityType: "chapter",
          itemId: workingChapter.id,
          itemTitle: workingChapter.title,
          fieldKey: "title",
          fieldLabel: "Title",
          action: "develop",
          currentValue: workingChapter.title,
          instruction: [
            nextMessage,
            `This is Chapter ${workingChapter.number}.`,
            "Return a commercially strong chapter title, not a generic chapter number.",
            "Base it on what the chapter actually contains after drafting.",
          ].join("\n\n"),
          draftItem: chapterDraftItem(workingChapter),
        }),
      });
      latestContext = titleData.contextPackage ?? latestContext;
      workingProject = titleData.project;
    }

    const totalWords = workingProject.chapters.reduce(
      (sum, chapter) => sum + String(chapter.draft || "").trim().split(/\s+/).filter(Boolean).length,
      0,
    );

    return {
      reply: `I drafted ${workingProject.chapters.length} chapters through the bottom AI bar workflow and landed at about ${totalWords} words in total. The chapters were written through the chapter generator after the runway was aligned first.`,
      actions: [],
      project: workingProject,
      contextPackage: latestContext,
      scope: "CHAPTER",
      nextTab: "chapters",
    };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextMessage = message.trim();
    if (!nextMessage) {
      return;
    }

    const effectiveScope: ProjectChatScope = "AUTO";
    const userTurn: ProjectChatTurnRecord = {
      id: `user-${Date.now()}`,
      role: "user",
      text: nextMessage,
      scope: effectiveScope,
      createdAt: new Date().toISOString(),
    };

    setTurns((current) => [...current, userTurn]);
    setSubmitting(true);
    setMessage("");
    onExpandedChange(true);

    try {
      if (onBeforeSubmit) {
        await onBeforeSubmit({
          message: nextMessage,
          applyChanges,
          scope: effectiveScope,
        });
      }

      const data = looksLikeAllChapterDraftRequest(nextMessage)
        ? await runAllChapterDraftWorkflow(nextMessage)
        : looksLikeAllChapterOutlineRequest(nextMessage)
          ? await runAllChapterOutlineWorkflow(nextMessage)
          : applyChanges
            ? await requestJson<AssistantPayload>(`/api/projects/${project.id}/assistant`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  message: nextMessage,
                  role: activeAiRole,
                  scope: "AUTO",
                  chapterId: selectedChapterId,
                  applyChanges,
                  previewOnly: true,
                }),
              })
            : await requestJson<AssistantPayload>(`/api/projects/${project.id}/assistant`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: nextMessage,
              role: activeAiRole,
              scope: "AUTO",
              chapterId: selectedChapterId,
              applyChanges,
            }),
          });

      if (applyChanges && data.proposedActions?.length && data.proposedActions.length > 1) {
        const changes = data.proposedChanges?.length
          ? data.proposedChanges
          : data.proposedActions.map((action, index) => ({
              id: `change-${index}`,
              kind: String(action.kind ?? "CHANGE"),
              targetLabel: String(action.title ?? action.fieldKey ?? action.entityMatch ?? `Change ${index + 1}`),
              proposedValue: typeof action.content === "string" ? action.content : undefined,
              reason: String(action.summary ?? "Proposed by the Book Author Brain."),
            }));
        setPendingPreview({
          message: nextMessage,
          scope: effectiveScope,
          actions: data.proposedActions,
          changes,
          selectedIndexes: new Set(changes.map((_change, index) => index)),
        });
        setTurns((current) => [
          ...current,
          {
            id: `assistant-preview-${Date.now()}`,
            role: "assistant",
            text: data.nextRecommendedAction || "I found multiple fields to update. Review the proposed changes before applying them.",
            scope: data.scope,
            createdAt: new Date().toISOString(),
            actions: [],
          },
        ]);
        return;
      }

      const appliedData =
        applyChanges && data.proposedActions?.length === 1
          ? await requestJson<AssistantPayload>(`/api/projects/${project.id}/assistant`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                message: nextMessage,
                role: activeAiRole,
                scope: "AUTO",
                chapterId: selectedChapterId,
                applyChanges: true,
                approvedActions: data.proposedActions,
              }),
            })
          : data;

      onProjectUpdate(appliedData.project);
      onContextPackage(appliedData.contextPackage);
      if (appliedData.nextTab) {
        onTabChange(appliedData.nextTab);
      }

      setTurns((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: appliedData.reply,
          scope: appliedData.scope,
          createdAt: new Date().toISOString(),
          actions: appliedData.actions,
        },
      ]);

      if (appliedData.actions.length > 0) {
      toast.success(`${APP_NAME} applied your instruction.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The assistant could not complete that request.");
    } finally {
      setSubmitting(false);
    }
  }

  async function applyPendingPreview() {
    if (!pendingPreview || submitting) {
      return;
    }

    const approvedActions = pendingPreview.actions.filter((_action, index) =>
      pendingPreview.selectedIndexes.has(index),
    );
    if (approvedActions.length === 0) {
      toast.error("Select at least one change to apply.");
      return;
    }

    setSubmitting(true);
    try {
      const data = await requestJson<AssistantPayload>(`/api/projects/${project.id}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: pendingPreview.message,
          role: activeAiRole,
          scope: pendingPreview.scope,
          chapterId: selectedChapterId,
          applyChanges: true,
          approvedActions,
        }),
      });
      onProjectUpdate(data.project);
      onContextPackage(data.contextPackage);
      if (data.nextTab) {
        onTabChange(data.nextTab);
      }
      setPendingPreview(null);
      setTurns((current) => [
        ...current,
        {
          id: `assistant-applied-${Date.now()}`,
          role: "assistant",
          text: data.reply,
          scope: data.scope,
          createdAt: new Date().toISOString(),
          actions: data.actions,
        },
      ]);
      toast.success(`${APP_NAME} applied the approved changes.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not apply the approved changes.");
    } finally {
      setSubmitting(false);
    }
  }

  async function regeneratePendingPreview() {
    if (!pendingPreview || submitting) {
      return;
    }

    const preview = pendingPreview;
    setPendingPreview(null);
    setMessage(preview.message);
    window.setTimeout(() => {
      document.getElementById("project-copilot-input")?.focus();
    }, 20);
    toast.message("Edit or send again to regenerate the proposed changes.");
  }

  return (
    <div className={cn("fixed left-0 right-0 z-40 px-3 pb-3 sm:px-4", dockClassName)} id="project-copilot-dock">
      {expanded ? (
        <Card className={cn("mx-auto max-w-[1600px] border-[color:var(--line-strong)] bg-[color:var(--panel)]/98 shadow-[0_-14px_34px_var(--shadow)] backdrop-blur", phoneShell ? "max-h-[38dvh] overflow-hidden rounded-[18px]" : "")}>
          <div className={cn("grid gap-4 p-4", phoneShell ? "max-h-[38dvh] gap-2 overflow-y-auto p-2" : null)}>
            <div className={cn("flex flex-wrap items-start justify-between gap-4 border-b border-[color:var(--line)] pb-3", phoneShell ? "gap-2 pb-2" : "")}>
              <div className="grid gap-2">
                <div className="flex flex-wrap gap-2">
                  <Chip>AI Dock</Chip>
                  <Chip>{activeRoleLabel}</Chip>
                  <Chip>{applyChanges ? "Apply changes on" : "Advice only"}</Chip>
                  <Chip>Auto-routing</Chip>
                  {submitting ? (
                    <Chip className="gap-2">
                      <span aria-hidden="true" className="storyforge-spinner" />
                      <span>AI working</span>
                    </Chip>
                  ) : null}
                </div>
                <div>
            <h3 className={cn("text-xl font-semibold", phoneShell ? "text-base" : "")}>Talk to {APP_PROSE_NAME}</h3>
                  <p className={cn("text-sm text-[var(--muted)]", phoneShell ? "hidden text-xs leading-5" : "")}>
                    Ask plainly for brainstorming, coaching, edits, or story-state help without leaving the page.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => onExpandedChange(false)} variant="secondary">
                  Collapse
                </Button>
                <Button className={cn(phoneShell ? "min-h-[40px] px-3 text-xs" : "")} onClick={onOpenProviders} variant="ghost">
                  AI key settings
                </Button>
              </div>
            </div>

            <div className={cn("grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]", phoneShell ? "gap-2" : "")}>
              <label className={cn("grid gap-1 text-sm", phoneShell ? "text-xs" : "")}>
                <span className="text-[var(--muted)]">AI role</span>
                <select value={activeAiRole} onChange={(event) => onRoleChange(event.target.value as AiRole)}>
                  {aiRoleOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={cn("inline-flex items-center gap-3 rounded-lg border border-[color:var(--line)] bg-[color:var(--panel-soft)] px-4 py-3 text-sm text-[var(--muted)]", phoneShell ? "px-3 py-2 text-xs leading-4" : "")}>
                <input checked={applyChanges} type="checkbox" onChange={(event) => setApplyChanges(event.target.checked)} />
                  Let {APP_PROSE_NAME} implement direct changes
              </label>
            </div>

            {phoneShell && phoneQuickActions.length ? (
              <div className="grid gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">AI Engine</p>
                <div className="flex flex-wrap gap-2">
                  {phoneQuickActions.map((action) => (
                    <Button
                      key={action.id}
                      className="min-h-[36px] px-3 text-xs"
                      disabled={submitting}
                      onClick={action.onClick}
                      type="button"
                      variant="secondary"
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {pendingPreview ? (
              <div className="grid gap-3 rounded-xl border border-[color:rgba(var(--accent-rgb),0.28)] bg-[rgba(var(--accent-rgb),0.06)] p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">Review proposed changes</p>
                    <p className="text-xs text-[var(--muted)]">
                      {APP_NAME} found {pendingPreview.changes.length} places to update. Apply only the changes you want.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={submitting} onClick={applyPendingPreview}>
                      Apply selected
                    </Button>
                    <Button disabled={submitting} onClick={regeneratePendingPreview} variant="secondary">
                      Regenerate
                    </Button>
                    <Button disabled={submitting} onClick={() => setPendingPreview(null)} variant="ghost">
                      Cancel
                    </Button>
                  </div>
                </div>
                <div className="grid max-h-[220px] gap-2 overflow-auto pr-1">
                  {pendingPreview.changes.map((change, index) => (
                    <label
                      key={change.id}
                      className="grid gap-2 rounded-lg border border-[color:var(--line)] bg-white p-3 text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <input
                          checked={pendingPreview.selectedIndexes.has(index)}
                          type="checkbox"
                          onChange={(event) =>
                            setPendingPreview((current) => {
                              if (!current) {
                                return current;
                              }
                              const selectedIndexes = new Set(current.selectedIndexes);
                              if (event.target.checked) {
                                selectedIndexes.add(index);
                              } else {
                                selectedIndexes.delete(index);
                              }
                              return { ...current, selectedIndexes };
                            })
                          }
                        />
                        <Chip>{change.kind}</Chip>
                        <span className="font-semibold text-[var(--text)]">{change.targetLabel}</span>
                      </span>
                      <span className="text-xs text-[var(--muted)]">{change.reason}</span>
                      {change.proposedValue ? (
                        <span className="line-clamp-3 whitespace-pre-wrap rounded-md bg-[color:var(--panel-soft)] px-3 py-2 text-xs text-[var(--muted)]">
                          {change.proposedValue}
                        </span>
                      ) : null}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <div
              ref={bodyRef}
              className={cn(
                "overflow-auto rounded-lg border border-[color:var(--line)] bg-[color:var(--panel-soft)] p-4",
                phoneShell ? "max-h-[56px] p-2" : "max-h-[240px]",
              )}
            >
              <div className="grid gap-3">
                {turns.map((turn) => (
                  <div key={turn.id} className={turn.role === "assistant" ? "justify-self-start" : "justify-self-end"}>
                    <div
                      className={
                        turn.role === "assistant"
                          ? cn("max-w-4xl rounded-lg border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[var(--text)]", phoneShell ? "px-3 py-2 text-xs leading-5" : "")
                          : cn("max-w-4xl rounded-lg border border-[color:rgba(var(--accent-rgb),0.3)] bg-[rgba(var(--accent-rgb),0.08)] px-4 py-3 text-sm text-[var(--text)]", phoneShell ? "px-3 py-2 text-xs leading-5" : "")
                      }
                    >
                      <div className="mb-2 flex flex-wrap gap-2">
                      <Chip>{turn.role === "assistant" ? APP_NAME : "You"}</Chip>
                        <Chip>{turn.scope}</Chip>
                      </div>
                      <p className="whitespace-pre-wrap">{turn.text}</p>
                      {turn.actions?.length ? (
                        <div className="mt-3 grid gap-2">
                          {turn.actions.map((action) => (
                            <div
                              key={action.id}
                              className="rounded-md border border-[color:var(--line)] bg-[color:var(--panel-soft)] px-3 py-2"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <Chip>{action.kind}</Chip>
                                <Chip>{action.status}</Chip>
                                <span className="text-xs text-[var(--muted)]">{action.targetLabel}</span>
                              </div>
                              <p className="mt-1 text-sm text-[var(--muted)]">{action.summary}</p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <form className={cn("grid gap-3", phoneShell ? "gap-2" : "")} onSubmit={handleSubmit}>
              <div className={cn("grid gap-3", phoneShell ? "grid-cols-1 gap-2" : "lg:grid-cols-[minmax(0,1fr)_auto]")}>
                <TextareaAutosize
                  id="project-copilot-input"
                  className={cn("resize-none", phoneShell ? "min-h-[46px] text-sm leading-5" : "min-h-[72px]")}
                  minRows={phoneShell ? 2 : 2}
                  placeholder={`Explain what to update, where it belongs, or what the AI should build.`}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                />
                <Button className={cn(phoneShell ? "min-h-[40px] px-4 text-sm" : "min-h-[72px] px-8")} disabled={submitting} type="submit">
                  <span className="inline-flex items-center gap-2">
                    {submitting ? <span aria-hidden="true" className="storyforge-spinner" /> : null}
                    <span>{submitting ? "Working..." : "Send"}</span>
                  </span>
                </Button>
              </div>
              <p className={cn("text-xs text-[var(--muted)]", phoneShell ? "leading-4" : "")}>
                Tip: ask it to advise, rewrite, brainstorm, update the skeleton, or explain what should happen next.
              </p>
            </form>
          </div>
        </Card>
      ) : (
        <div className="mx-auto max-w-[1600px] rounded-xl border border-[color:var(--line)] bg-[color:var(--panel)] shadow-[0_-10px_24px_var(--shadow)]">
          <form
            className={cn(
              "grid gap-3 p-3",
              phoneShell ? "grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 p-2" : "lg:grid-cols-[auto_minmax(0,1fr)_auto]",
            )}
            onSubmit={handleSubmit}
          >
            <div className="flex items-center gap-2">
              <Chip>AI</Chip>
              {!phoneShell ? <Chip>{activeRoleLabel}</Chip> : null}
            </div>
            <TextareaAutosize
              className={cn("resize-none", phoneShell ? "min-h-[38px] text-sm leading-5" : "min-h-[44px]")}
              minRows={1}
              placeholder={`Ask ${APP_PROSE_NAME} plainly for help, edits, ideas, or chapter changes.`}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onFocus={() => onExpandedChange(true)}
            />
            <div className="flex gap-2">
              <Button className={cn(phoneShell ? "min-h-[38px] px-3 text-xs" : null)} onClick={() => onExpandedChange(true)} type="button" variant="secondary">
                Open
              </Button>
              <Button className={cn(phoneShell ? "min-h-[38px] px-3 text-xs" : null)} disabled={submitting} type="submit">
                <span className="inline-flex items-center gap-2">
                  {submitting ? <span aria-hidden="true" className="storyforge-spinner" /> : null}
                  <span>{submitting ? "Working..." : "Send"}</span>
                </span>
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
