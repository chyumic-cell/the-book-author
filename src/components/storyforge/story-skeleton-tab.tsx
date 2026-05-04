"use client";

import { useMemo, useState } from "react";

import { buildCraftReport } from "@/lib/craft-engine";
import { EditableListSection } from "@/components/storyforge/editable-list-section";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { APP_NAME } from "@/lib/brand";
import type { ProjectWorkspace } from "@/types/storyforge";

function estimatePageRange(words: number) {
  const safeWords = Math.max(0, words);
  return {
    trimMin: Math.max(1, Math.round(safeWords / 300)),
    trimMax: Math.max(1, Math.round(safeWords / 250)),
  };
}

function BookLengthPlanner({
  chapterCount,
  initialBookWordTarget,
  onAddChapter,
  onApplyBookPlan,
  planningBusy,
}: {
  chapterCount: number;
  initialBookWordTarget: number;
  onAddChapter: () => Promise<void>;
  onApplyBookPlan: (bookWordTarget: number, chapterCount: number) => Promise<void>;
  planningBusy: boolean;
}) {
  const [bookWordTarget, setBookWordTarget] = useState(initialBookWordTarget);
  const [chapterCountTarget, setChapterCountTarget] = useState(Math.max(1, chapterCount));
  const estimatedPages = useMemo(() => estimatePageRange(bookWordTarget), [bookWordTarget]);
  const targetWordsPerChapter = useMemo(
    () => Math.max(300, Math.round(bookWordTarget / Math.max(1, chapterCountTarget))),
    [bookWordTarget, chapterCountTarget],
  );

  return (
    <Card className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-2xl font-semibold">Book length planner</h3>
          <p className="text-sm text-[var(--muted)]">
              Set the full book target, choose the chapter count, and let {APP_NAME} push the average chapter target across the plan.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip>{estimatedPages.trimMin}-{estimatedPages.trimMax} pages</Chip>
          <Chip>~{targetWordsPerChapter} words per chapter</Chip>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="grid gap-2">
          <span className="text-sm font-semibold text-[var(--text)]">Target book words</span>
          <input
            min={1000}
            step={1000}
            type="number"
            value={bookWordTarget}
            onChange={(event) => setBookWordTarget(Math.max(1000, Number(event.target.value) || 1000))}
          />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-semibold text-[var(--text)]">Target chapters</span>
          <input
            min={1}
            step={1}
            type="number"
            value={chapterCountTarget}
            onChange={(event) => setChapterCountTarget(Math.max(1, Number(event.target.value) || 1))}
          />
        </label>
        <div className="grid gap-2 rounded-[24px] border border-[color:var(--line)] bg-[color:var(--panel-soft)]/85 p-4">
          <span className="text-sm font-semibold text-[var(--text)]">Planning math</span>
          <p className="text-sm text-[var(--muted)]">
            {bookWordTarget.toLocaleString()} total words / {chapterCountTarget} chapters = about{" "}
            <strong className="text-[var(--text)]">{targetWordsPerChapter.toLocaleString()}</strong> words per chapter.
          </p>
          <p className="text-xs text-[var(--muted)]">
            Average print length: about {estimatedPages.trimMin}-{estimatedPages.trimMax} pages depending on layout density.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button disabled={planningBusy} onClick={() => void onApplyBookPlan(bookWordTarget, chapterCountTarget)}>
          {planningBusy ? "Applying plan..." : "Apply book plan"}
        </Button>
        <Button disabled={planningBusy} onClick={() => void onAddChapter()} variant="secondary">
          Add one chapter
        </Button>
      </div>
    </Card>
  );
}

function ChapterRunwayActions({
  busy,
  onGenerateAllOutlines,
}: {
  busy: boolean;
  onGenerateAllOutlines: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy} onClick={onGenerateAllOutlines}>
        {busy ? "Building outlines..." : "Build all chapter outlines with AI"}
      </Button>
    </div>
  );
}

export function StorySkeletonTab({
  busy,
  planningBusy,
  project,
  storyPlan,
  mutateSkeleton,
  onAddChapter,
  onApplyBookPlan,
  onDeleteChapter,
  onGeneratePlan,
  onGenerateAllChapterOutlines,
  onAiFieldAction,
  onSaveChapterPlan,
}: {
  busy: boolean;
  planningBusy: boolean;
  project: ProjectWorkspace;
  storyPlan: string;
  mutateSkeleton: (
    entityType: "structureBeat" | "sceneCard",
    payload: Record<string, unknown>,
    id?: string,
    method?: "POST" | "PATCH" | "DELETE",
  ) => Promise<void>;
  onAddChapter: () => Promise<void>;
  onApplyBookPlan: (bookWordTarget: number, chapterCount: number) => Promise<void>;
  onDeleteChapter: (chapterId: string) => Promise<void>;
  onGeneratePlan: () => void;
  onGenerateAllChapterOutlines: () => void;
  onAiFieldAction: (options: {
    itemId: string;
    itemTitle: string;
    fieldKey: string;
    fieldLabel: string;
    action: "develop" | "expand" | "tighten";
  }) => Promise<void>;
  onSaveChapterPlan: (
    chapterId: string,
    payload: {
      title?: string;
      purpose?: string;
      currentBeat?: string;
      targetWordCount?: number;
      desiredMood?: string;
      outline?: string;
    },
  ) => Promise<void>;
}) {
  const craft = buildCraftReport(project);

  return (
    <div className="grid gap-4">
      <Card className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-2">
            <div className="flex flex-wrap gap-2">
              {craft.sourceFramework.map((item) => (
                <Chip key={item}>{item}</Chip>
              ))}
            </div>
            <div>
              <h3 className="text-3xl">Story Skeleton</h3>
              <p className="mt-2 max-w-4xl text-sm text-[var(--muted)]">
                Build the book as structure, not just manuscript. This layer tracks turning points, scene movement, stakes, character pressure, and the promises the story is making to the reader.
              </p>
            </div>
          </div>
          <Button disabled={busy} onClick={onGeneratePlan}>
            {busy ? "Planning..." : "Generate story plan"}
          </Button>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="grid gap-4">
            <div className="grid gap-3 rounded-[24px] border border-[color:var(--line)] bg-[color:var(--panel-soft)]/85 p-4">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-xl">Pitch system</strong>
                <Chip>Logline + elevator pitch</Chip>
              </div>
              <p className="text-sm text-[var(--text)]">{craft.pitch.logline}</p>
              <ul className="grid gap-2 text-sm text-[var(--muted)]">
                {craft.pitch.elevatorPitch.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>

            <div className="grid gap-3 rounded-[24px] border border-[color:var(--line)] bg-[color:var(--panel-soft)]/85 p-4">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-xl">LOCK engine</strong>
                <Chip>{craft.lock.warnings.length ? "Needs attention" : "Healthy"}</Chip>
              </div>
              <p className="text-sm text-[var(--muted)]"><strong className="text-[var(--text)]">Lead:</strong> {craft.lock.lead}</p>
              <p className="text-sm text-[var(--muted)]"><strong className="text-[var(--text)]">Objective:</strong> {craft.lock.objective}</p>
              <p className="text-sm text-[var(--muted)]"><strong className="text-[var(--text)]">Confrontation:</strong> {craft.lock.confrontation}</p>
              <p className="text-sm text-[var(--muted)]"><strong className="text-[var(--text)]">Knockout ending:</strong> {craft.lock.knockoutEnding}</p>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="grid gap-3 rounded-[24px] border border-[color:var(--line)] bg-[color:var(--panel-soft)]/85 p-4">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-xl">Stakes system</strong>
                <Chip>Physical / Professional / Psychological</Chip>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  ["Physical", craft.stakes.physical],
                  ["Professional", craft.stakes.professional],
                  ["Psychological", craft.stakes.psychological],
                ].map(([label, score]) => (
                  <div key={label} className="rounded-[20px] border border-[color:var(--line)] bg-white/50 p-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">{label}</p>
                    <p className="mt-2 text-3xl">{score}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 rounded-[24px] border border-[color:var(--line)] bg-[color:var(--panel-soft)]/85 p-4">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-xl">Seven pillars</strong>
                <Chip>Bell-inspired craft report</Chip>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {craft.pillars.map((pillar) => (
                  <div key={pillar.id} className="rounded-[20px] border border-[color:var(--line)] bg-white/50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <strong>{pillar.label}</strong>
                      <Chip>{pillar.score}</Chip>
                    </div>
                    <p className="mt-2 text-sm text-[var(--muted)]">{pillar.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {storyPlan ? (
          <div className="rounded-[24px] border border-[color:var(--line)] bg-[color:var(--panel-soft)]/85 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <strong className="text-xl">Generated story plan</strong>
              <Chip>Compact planner</Chip>
            </div>
            <pre className="whitespace-pre-wrap text-sm text-[var(--muted)]">{storyPlan}</pre>
          </div>
        ) : null}
      </Card>

      <BookLengthPlanner
        key={`${project.bookSettings.targetBookLength}-${project.chapters.length}`}
        chapterCount={project.chapters.length}
        initialBookWordTarget={project.bookSettings.targetBookLength}
        onAddChapter={onAddChapter}
        onApplyBookPlan={onApplyBookPlan}
        planningBusy={planningBusy}
      />

      <Card className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-2xl font-semibold">Story Arc Tracker</h3>
            <p className="text-sm text-[var(--muted)]">
              Track where each arc starts, develops, escalates, stalls, or resolves across the manuscript.
            </p>
          </div>
          <Chip>{project.plotThreads.length} active arcs</Chip>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[720px] rounded-lg border border-[color:var(--line)] bg-white">
            <div
              className="grid border-b border-[color:var(--line)] bg-[color:var(--panel-soft)]"
              style={{ gridTemplateColumns: `260px repeat(${Math.max(project.chapters.length, 1)}, minmax(88px, 1fr))` }}
            >
              <div className="px-4 py-3 text-sm font-semibold text-[var(--text)]">Arc</div>
              {project.chapters.map((chapter) => (
                <div key={chapter.id} className="px-3 py-3 text-center text-sm font-medium text-[var(--muted)]">
                  Chapter {chapter.number}
                </div>
              ))}
            </div>

            {project.plotThreads.map((thread) => (
              <div
                key={thread.id}
                className="grid border-b border-[color:var(--line)] last:border-b-0"
                style={{ gridTemplateColumns: `260px repeat(${Math.max(project.chapters.length, 1)}, minmax(88px, 1fr))` }}
              >
                <div className="grid gap-1 px-4 py-3">
                  <strong className="text-sm text-[var(--text)]">{thread.title}</strong>
                  <span className="text-xs text-[var(--muted)]">{thread.summary}</span>
                </div>

                {project.chapters.map((chapter) => {
                  const marker =
                    thread.progressMarkers.find((entry) => entry.chapterNumber === chapter.number) ??
                    (thread.lastTouchedChapter === chapter.number
                      ? {
                          chapterNumber: chapter.number,
                          label: chapter.title,
                          strength: "DEVELOPED" as const,
                          notes: thread.summary,
                        }
                      : null);

                  return (
                    <div key={`${thread.id}-${chapter.id}`} className="flex items-center justify-center px-2 py-3">
                      {marker ? (
                        <div className="grid justify-items-center gap-1">
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{
                              backgroundColor:
                                marker.strength === "INTRODUCED"
                                  ? "#2f80ed"
                                  : marker.strength === "ESCALATED"
                                    ? "#c0392b"
                                    : marker.strength === "RESOLVED"
                                      ? "#1f7a45"
                                      : marker.strength === "STALLED"
                                        ? "#b08900"
                                        : "#4f46e5",
                            }}
                            title={marker.notes}
                          />
                          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                            {marker.strength}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-[var(--muted)]">-</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </Card>

      <EditableListSection
        key={`chapter-runway-${project.chapters.map((item) => item.id).join("-")}`}
        description="Plan the chapter runway here: title, purpose, beat, outline, and target words for each chapter."
        fields={[
          { key: "title", label: "Title" },
          { key: "purpose", label: "Purpose", type: "textarea" },
          { key: "currentBeat", label: "Current beat", type: "textarea" },
          { key: "targetWordCount", label: "Target words", type: "number" },
          { key: "desiredMood", label: "Desired mood", type: "textarea" },
          { key: "outline", label: "Outline", type: "textarea" },
        ]}
        items={project.chapters as unknown as Record<string, unknown>[]}
        onAdd={onAddChapter}
        aiBusyKey={planningBusy ? "busy" : null}
        onAiFieldAction={onAiFieldAction}
        onDelete={onDeleteChapter}
        onSave={(itemId, payload) =>
          onSaveChapterPlan(itemId, {
            title: String(payload.title ?? ""),
            purpose: String(payload.purpose ?? ""),
            currentBeat: String(payload.currentBeat ?? ""),
            targetWordCount: Number(payload.targetWordCount ?? project.bookSettings.targetChapterLength),
            desiredMood: String(payload.desiredMood ?? ""),
            outline: String(payload.outline ?? ""),
          })
        }
        title="Chapter runway"
        topActions={<ChapterRunwayActions busy={planningBusy || busy} onGenerateAllOutlines={onGenerateAllChapterOutlines} />}
      />

      <EditableListSection
        key={`beats-${project.structureBeats.map((item) => item.id).join("-")}`}
        description="The Structure Engine is the book's turning-point map. Use it to place the opening disturbance, doorway beats, midpoint, climax, and resolution so the plot keeps escalating in the right order."
        fields={[
          { key: "type", label: "Beat type" },
          { key: "label", label: "Label" },
          { key: "description", label: "Description", type: "textarea" },
          { key: "notes", label: "Notes", type: "textarea" },
          { key: "status", label: "Status" },
          { key: "chapterId", label: "Linked chapter ID" },
          { key: "orderIndex", label: "Order", type: "number" },
        ]}
        items={project.structureBeats as unknown as Record<string, unknown>[]}
        onAdd={() => mutateSkeleton("structureBeat", {}, undefined, "POST")}
        onAiFieldAction={onAiFieldAction}
        onDelete={(itemId) => mutateSkeleton("structureBeat", {}, itemId, "DELETE")}
        onSave={(itemId, payload) => mutateSkeleton("structureBeat", payload, itemId, "PATCH")}
        title="Structure engine"
      />

      <EditableListSection
        key={`scenes-${project.sceneCards.map((item) => item.id).join("-")}`}
                description={`Every scene card should show goal, conflict, and outcome so ${APP_NAME} can flag filler or static movement.`}
        fields={[
          { key: "title", label: "Title" },
          { key: "summary", label: "Summary", type: "textarea" },
          { key: "goal", label: "Goal", type: "textarea" },
          { key: "conflict", label: "Conflict", type: "textarea" },
          { key: "outcome", label: "Outcome", type: "textarea" },
          { key: "outcomeType", label: "Outcome type" },
          { key: "locationHint", label: "Location hint" },
          { key: "chapterId", label: "Linked chapter ID" },
          { key: "povCharacterId", label: "POV character ID" },
          { key: "orderIndex", label: "Order", type: "number" },
          { key: "frozen", label: "Frozen", type: "boolean" },
        ]}
        items={project.sceneCards as unknown as Record<string, unknown>[]}
        onAdd={() => mutateSkeleton("sceneCard", {}, undefined, "POST")}
        onAiFieldAction={onAiFieldAction}
        onDelete={(itemId) => mutateSkeleton("sceneCard", {}, itemId, "DELETE")}
        onSave={(itemId, payload) => mutateSkeleton("sceneCard", payload, itemId, "PATCH")}
        title="Scene engine"
      />
    </div>
  );
}
