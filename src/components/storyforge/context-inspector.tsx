"use client";

import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { APP_NAME } from "@/lib/brand";
import type { ContextPackage, ProjectWorkspace } from "@/types/storyforge";

export function ContextInspector({
  aiMode,
  contextPackage,
  project,
}: {
  aiMode: string;
  contextPackage: ContextPackage | null;
  project: ProjectWorkspace;
}) {
  const longTerm = contextPackage?.relevantLongTermMemory ?? project.longTermMemoryItems.slice(0, 5);
  const shortTerm = contextPackage?.recentShortTermMemory ?? project.shortTermMemoryItems.slice(0, 4);
  const plotThreads = contextPackage?.activePlotThreads ?? project.plotThreads.slice(0, 4);
  const continuity = contextPackage?.continuityConstraints ?? project.continuityIssues.filter((issue) => issue.status === "OPEN").slice(0, 4);
  const chapterBlueprint = contextPackage?.chapterBlueprint ?? [];
  const storyBibleContext = contextPackage?.storyBibleContext ?? [];
  const storySkeletonContext = contextPackage?.storySkeletonContext ?? [];

  return (
    <div className="grid gap-4">
      <Card className="grid gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl">Context Inspector</h3>
          <Chip>{aiMode}</Chip>
        </div>
        <p className="text-sm text-[var(--muted)]">
          This is the compact memory bundle {APP_NAME} prefers to assemble instead of resending the whole manuscript.
        </p>
        <div className="flex flex-wrap gap-2">
          <Chip>Long-term {longTerm.length}</Chip>
          <Chip>Short-term {shortTerm.length}</Chip>
          <Chip>Threads {plotThreads.length}</Chip>
          <Chip>Approx. {contextPackage?.tokenEstimate ?? 0} tokens</Chip>
        </div>
      </Card>

      <Card className="grid gap-3">
        <h4 className="text-xl">Chapter blueprint</h4>
        <div className="grid gap-2">
          {chapterBlueprint.length ? (
            chapterBlueprint.map((line) => (
              <div key={line} className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--panel-soft)]/78 p-3 text-sm text-[var(--muted)]">
                {line}
              </div>
            ))
          ) : (
            <p className="text-sm text-[var(--muted)]">No active chapter blueprint loaded yet.</p>
          )}
        </div>
      </Card>

      <Card className="grid gap-3">
        <h4 className="text-xl">Story bible canon</h4>
        <div className="grid gap-2">
          {storyBibleContext.length ? (
            storyBibleContext.map((line) => (
              <div key={line} className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--panel-soft)]/78 p-3 text-sm text-[var(--muted)]">
                {line}
              </div>
            ))
          ) : (
            <p className="text-sm text-[var(--muted)]">No focused story bible context loaded yet.</p>
          )}
        </div>
      </Card>

      <Card className="grid gap-3">
        <h4 className="text-xl">Story skeleton support</h4>
        <div className="grid gap-2">
          {storySkeletonContext.length ? (
            storySkeletonContext.map((line) => (
              <div key={line} className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--panel-soft)]/78 p-3 text-sm text-[var(--muted)]">
                {line}
              </div>
            ))
          ) : (
            <p className="text-sm text-[var(--muted)]">No focused skeleton context loaded yet.</p>
          )}
        </div>
      </Card>

      <Card className="grid gap-3">
        <h4 className="text-xl">Relevant long-term memory</h4>
        <div className="grid gap-3">
          {longTerm.map((item) => (
            <div key={item.id} className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--panel-soft)]/78 p-3">
              <div className="flex items-center justify-between gap-2">
                <strong>{item.title}</strong>
                <Chip>{item.category}</Chip>
              </div>
              <p className="mt-2 text-sm text-[var(--muted)]">{item.content}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="grid gap-3">
        <h4 className="text-xl">Recent short-term memory</h4>
        <div className="grid gap-3">
          {shortTerm.map((item) => (
            <div key={item.id} className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--panel-soft)]/78 p-3">
              <strong>{item.title}</strong>
              <p className="mt-2 text-sm text-[var(--muted)]">{item.content}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="grid gap-3">
        <h4 className="text-xl">Active tensions & continuity</h4>
        <div className="grid gap-2">
          {plotThreads.map((thread) => (
            <div key={thread.id} className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--panel-soft)]/78 p-3">
              <div className="flex items-center justify-between">
                <strong>{thread.title}</strong>
                <Chip>Heat {thread.heat}</Chip>
              </div>
              <p className="mt-2 text-sm text-[var(--muted)]">{thread.summary}</p>
            </div>
          ))}
          {continuity.map((issue) => (
            <div key={issue.id} className="rounded-2xl border border-[color:var(--line)] bg-[rgba(var(--accent-rgb),0.08)] p-3">
              <div className="flex items-center justify-between">
                <strong>{issue.title}</strong>
                <Chip>{issue.severity}</Chip>
              </div>
              <p className="mt-2 text-sm text-[var(--muted)]">{issue.description}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
