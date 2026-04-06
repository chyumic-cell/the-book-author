"use client";

import { EditableListSection } from "@/components/storyforge/editable-list-section";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { APP_NAME } from "@/lib/brand";
import type { ProjectWorkspace } from "@/types/storyforge";

export function IdeaLabTab({
  project,
  mutateIdeaLab,
}: {
  project: ProjectWorkspace;
  mutateIdeaLab: (
    entityType: "ideaEntry" | "workingNote",
    payload: Record<string, unknown>,
    id?: string,
    method?: "POST" | "PATCH" | "DELETE",
  ) => Promise<void>;
}) {
  return (
    <div className="grid gap-4">
      <Card className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            <Chip>{project.ideaEntries.length} ideas</Chip>
            <Chip>{project.workingNotes.length} sandbox notes</Chip>
          </div>
          <div>
            <h3 className="text-3xl">Idea Lab</h3>
            <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
        Capture sparks, alternate paths, and half-formed concepts without forcing them into canon too early. This is the sandbox where {APP_NAME} can brainstorm with you without locking every idea into the book.
            </p>
          </div>
        </div>
        <div className="grid gap-3 rounded-[24px] border border-[color:var(--line)] bg-[color:var(--panel-soft)]/85 p-4">
          <strong className="text-lg">What belongs here</strong>
          <ul className="grid gap-2 text-sm text-[var(--muted)]">
            <li>What-if variants and alternate twists</li>
            <li>Loose title ideas, hooks, and pitch fragments</li>
            <li>Unused scenes, research questions, and spare imagery</li>
            <li>Anything you might want later but do not want cluttering canon yet</li>
          </ul>
        </div>
      </Card>

      <EditableListSection
        key={`ideas-${project.ideaEntries.map((item) => item.id).join("-")}`}
        description="Use the idea vault for sparks, variants, and pitch-worthy fragments."
        fields={[
          { key: "title", label: "Title" },
          { key: "type", label: "Type" },
          { key: "content", label: "Content", type: "textarea" },
          { key: "source", label: "Source" },
          { key: "tags", label: "Tags", type: "tags" },
          { key: "isFavorite", label: "Favorite", type: "boolean" },
          { key: "status", label: "Status" },
        ]}
        items={project.ideaEntries as unknown as Record<string, unknown>[]}
        onAdd={() => mutateIdeaLab("ideaEntry", {}, undefined, "POST")}
        onDelete={(itemId) => mutateIdeaLab("ideaEntry", {}, itemId, "DELETE")}
        onSave={(itemId, payload) => mutateIdeaLab("ideaEntry", payload, itemId, "PATCH")}
        title="Idea vault"
      />

      <EditableListSection
        key={`notes-${project.workingNotes.map((item) => item.id).join("-")}`}
        description="Sandbox notes can be linked to a chapter or kept loose while you experiment."
        fields={[
          { key: "title", label: "Title" },
          { key: "type", label: "Type" },
          { key: "linkedChapterId", label: "Linked chapter ID" },
          { key: "content", label: "Content", type: "textarea" },
          { key: "tags", label: "Tags", type: "tags" },
          { key: "status", label: "Status" },
        ]}
        items={project.workingNotes as unknown as Record<string, unknown>[]}
        onAdd={() => mutateIdeaLab("workingNote", {}, undefined, "POST")}
        onDelete={(itemId) => mutateIdeaLab("workingNote", {}, itemId, "DELETE")}
        onSave={(itemId, payload) => mutateIdeaLab("workingNote", payload, itemId, "PATCH")}
        title="Working notes"
      />
    </div>
  );
}
