"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { toast } from "sonner";

import { requestJson } from "@/components/storyforge/workspace-helpers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { APP_NAME } from "@/lib/brand";
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
  project: ProjectWorkspace;
  contextPackage: ContextPackage | null;
  scope: ProjectChatScope;
  nextTab: StoryForgeTab | null;
};

function scopeFromTab(tab: StoryForgeTab): ProjectChatScope {
  if (tab === "ideaLab") {
    return "IDEA_LAB";
  }

  if (tab === "skeleton") {
    return "SKELETON";
  }

  if (tab === "chapters") {
    return "CHAPTER";
  }

  if (tab === "bible") {
    return "STORY_BIBLE";
  }

  return "PROJECT";
}

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

export function ProjectCopilotBar({
  activeTab,
  activeAiRole,
  expanded,
  dockClassName,
  phoneShell,
  onBeforeSubmit,
  onOpenProviders,
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
  project: ProjectWorkspace;
  selectedChapterId: string | null;
  onContextPackage: (contextPackage: ContextPackage | null) => void;
  onExpandedChange: (expanded: boolean) => void;
  onProjectUpdate: (project: ProjectWorkspace) => void;
  onRoleChange: (role: AiRole) => void;
  onTabChange: (tab: StoryForgeTab) => void;
}) {
  const [message, setMessage] = useState("");
  const [scope, setScope] = useState<ProjectChatScope>("AUTO");
  const [applyChanges, setApplyChanges] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextMessage = message.trim();
    if (!nextMessage) {
      return;
    }

    const effectiveScope = scope === "AUTO" ? scopeFromTab(activeTab) : scope;
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

      const data = await requestJson<AssistantPayload>(`/api/projects/${project.id}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: nextMessage,
          role: activeAiRole,
          scope: effectiveScope,
          chapterId: selectedChapterId,
          applyChanges,
        }),
      });

      onProjectUpdate(data.project);
      onContextPackage(data.contextPackage);
      if (data.nextTab) {
        onTabChange(data.nextTab);
      }

      setTurns((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: data.reply,
          scope: data.scope,
          createdAt: new Date().toISOString(),
          actions: data.actions,
        },
      ]);

      if (data.actions.length > 0) {
      toast.success(`${APP_NAME} applied your instruction.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The assistant could not complete that request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={cn("fixed left-0 right-0 z-40 px-3 pb-3 sm:px-4", dockClassName)} id="project-copilot-dock">
      {expanded ? (
        <Card className={cn("mx-auto max-w-[1600px] border-[color:var(--line-strong)] bg-[color:var(--panel)]/98 shadow-[0_-14px_34px_var(--shadow)] backdrop-blur", phoneShell ? "max-h-[52dvh] overflow-hidden rounded-[18px]" : "")}>
          <div className={cn("grid gap-4 p-4", phoneShell ? "max-h-[52dvh] gap-2 overflow-y-auto p-2" : null)}>
            <div className={cn("flex flex-wrap items-start justify-between gap-4 border-b border-[color:var(--line)] pb-3", phoneShell ? "gap-2 pb-2" : "")}>
              <div className="grid gap-2">
                <div className="flex flex-wrap gap-2">
                  <Chip>AI Dock</Chip>
                  <Chip>{activeRoleLabel}</Chip>
                  <Chip>{applyChanges ? "Apply changes on" : "Advice only"}</Chip>
                  <Chip>{scope === "AUTO" ? "Auto scope" : scope}</Chip>
                  {submitting ? (
                    <Chip className="gap-2">
                      <span aria-hidden="true" className="storyforge-spinner" />
                      <span>AI working</span>
                    </Chip>
                  ) : null}
                </div>
                <div>
            <h3 className={cn("text-xl font-semibold", phoneShell ? "text-base" : "")}>Talk to {APP_NAME}</h3>
                  <p className={cn("text-sm text-[var(--muted)]", phoneShell ? "text-xs leading-5" : "")}>
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

            <div className={cn("grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]", phoneShell ? "gap-2" : "")}>
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
              <label className={cn("grid gap-1 text-sm", phoneShell ? "text-xs" : "")}>
                <span className="text-[var(--muted)]">Scope</span>
                <select value={scope} onChange={(event) => setScope(event.target.value as ProjectChatScope)}>
                  <option value="AUTO">Auto from current tab</option>
                  <option value="PROJECT">Project setup</option>
                  <option value="IDEA_LAB">Idea Lab</option>
                  <option value="SKELETON">Story Skeleton</option>
                  <option value="CHAPTER">Selected chapter</option>
                  <option value="STORY_BIBLE">Story Bible</option>
                </select>
              </label>
              <label className={cn("inline-flex items-center gap-3 rounded-lg border border-[color:var(--line)] bg-[color:var(--panel-soft)] px-4 py-3 text-sm text-[var(--muted)]", phoneShell ? "px-3 py-2 text-xs leading-4" : "")}>
                <input checked={applyChanges} type="checkbox" onChange={(event) => setApplyChanges(event.target.checked)} />
                  Let {APP_NAME} implement direct changes
              </label>
            </div>

            <div
              ref={bodyRef}
              className={cn(
                "overflow-auto rounded-lg border border-[color:var(--line)] bg-[color:var(--panel-soft)] p-4",
                phoneShell ? "max-h-[96px] p-2" : "max-h-[240px]",
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
              placeholder={`Ask ${APP_NAME} plainly for help, edits, ideas, or chapter changes.`}
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
