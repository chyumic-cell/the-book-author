"use client";

import { useMemo, useState } from "react";

import { CharacterMasterView } from "@/components/storyforge/character-master-view";
import { CharacterRelationshipWeb } from "@/components/storyforge/character-relationship-web";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { EditableListSection } from "@/components/storyforge/editable-list-section";
import { BOOK_RULE_TAG, ensureBookRuleTags, isBookRuleNote } from "@/lib/book-rules";
import type { CharacterRecord, ProjectWorkspace } from "@/types/storyforge";
import type { EditableAiAction } from "@/components/storyforge/editable-list-section";

export function StoryBibleTab({
  project,
  mutateStoryBible,
  onAiFieldAction,
  onCharacterAiAction,
}: {
  project: ProjectWorkspace;
  mutateStoryBible: (
    entityType: "character" | "relationship" | "plotThread" | "location" | "faction" | "timelineEvent" | "workingNote",
    payload: Record<string, unknown>,
    id?: string,
    method?: "POST" | "PATCH" | "DELETE",
  ) => Promise<void>;
  onAiFieldAction: (options: {
    itemId: string;
    itemTitle: string;
    fieldKey: string;
    fieldLabel: string;
    action: EditableAiAction;
    currentValue: string;
    draftItem: Record<string, unknown>;
  }) => Promise<void>;
  onCharacterAiAction: (options: {
    characterId: string;
    action: "develop-dossier" | "expand-summary" | "tighten-summary";
    draftCharacter: CharacterRecord;
  }) => Promise<void>;
}) {
  const baseRelationshipDrafts = useMemo(
    () =>
      Object.fromEntries(
        project.relationships.map((relationship) => [
          relationship.id,
          {
            sourceCharacterId: relationship.sourceCharacterId,
            targetCharacterId: relationship.targetCharacterId,
            kind: relationship.kind,
            description: relationship.description,
            tension: relationship.tension,
            status: relationship.status,
          },
        ]),
      ),
    [project.relationships],
  );
  const [relationshipDraftOverrides, setRelationshipDraftOverrides] = useState<
    Record<
      string,
      {
        sourceCharacterId: string;
        targetCharacterId: string;
        kind: string;
        description: string;
        tension: string;
        status: string;
      }
    >
  >({});
  const relationshipDrafts = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(baseRelationshipDrafts).map(([relationshipId, draft]) => [
          relationshipId,
          {
            ...draft,
            ...(relationshipDraftOverrides[relationshipId] ?? {}),
          },
        ]),
      ),
    [baseRelationshipDrafts, relationshipDraftOverrides],
  );
  const bookRules = useMemo(
    () => project.workingNotes.filter((note) => isBookRuleNote(note)),
    [project.workingNotes],
  );

  async function handleAddRelationship() {
    if (project.characters.length < 2) {
      return;
    }

    await mutateStoryBible(
      "relationship",
      {
        sourceCharacterId: project.characters[0]?.id,
        targetCharacterId: project.characters[1]?.id,
        kind: "ALLY",
        description: "Describe the dynamic between these characters.",
        tension: "",
        status: "ACTIVE",
      },
      undefined,
      "POST",
    );
  }

  return (
    <div className="grid gap-4">
      <CharacterMasterView
        characters={project.characters}
        mutateStoryBible={mutateStoryBible}
        onAiAction={onCharacterAiAction}
        projectId={project.id}
      />

      <EditableListSection
        key={`book-rules-${bookRules.map((item) => item.id).join("-")}`}
        description="Store off-page canon here: magic systems, organization rules, social customs, technology constraints, ritual logic, or any world rule the AI must understand without forcing you to explain it directly in the prose."
        fields={[
          { key: "title", label: "Rule name" },
          { key: "content", label: "Rule / internal logic", type: "textarea" },
          { key: "tags", label: "Tags", type: "tags" },
          { key: "status", label: "Status" },
        ]}
        items={bookRules as unknown as Record<string, unknown>[]}
        onAdd={() =>
          mutateStoryBible(
            "workingNote",
            {
              title: "New book rule",
              content: "Explain the world rule, system logic, or institutional process here.",
              type: "RESEARCH",
              tags: [BOOK_RULE_TAG],
              status: "ACTIVE",
            },
            undefined,
            "POST",
          )
        }
        onAiFieldAction={onAiFieldAction}
        onDelete={(itemId) => mutateStoryBible("workingNote", {}, itemId, "DELETE")}
        onSave={(itemId, payload) =>
          mutateStoryBible(
            "workingNote",
            {
              ...payload,
              type: "RESEARCH",
              tags: ensureBookRuleTags(Array.isArray(payload.tags) ? payload.tags.map(String) : [BOOK_RULE_TAG]),
            },
            itemId,
            "PATCH",
          )
        }
        title="Book rules"
      />

      <EditableListSection
        key={`threads-${project.plotThreads.map((item) => item.id).join("-")}`}
        description="Track unresolved promises, active tension, and likely payoff lines."
        fields={[
          { key: "title", label: "Title" },
          { key: "summary", label: "Summary", type: "textarea" },
          { key: "status", label: "Status" },
          { key: "heat", label: "Heat", type: "number" },
          { key: "promisedPayoff", label: "Promised payoff", type: "textarea" },
          { key: "lastTouchedChapter", label: "Last touched chapter", type: "number" },
        ]}
        items={project.plotThreads as unknown as Record<string, unknown>[]}
        onAdd={() => mutateStoryBible("plotThread", {}, undefined, "POST")}
        onAiFieldAction={onAiFieldAction}
        onDelete={(itemId) => mutateStoryBible("plotThread", {}, itemId, "DELETE")}
        onSave={(itemId, payload) => mutateStoryBible("plotThread", payload, itemId, "PATCH")}
        title="Plot threads and mysteries"
      />

      <EditableListSection
        key={`locations-${project.locations.map((item) => item.id).join("-")}`}
        description="Locations and atmosphere shape retrieval as much as plot does."
        fields={[
          { key: "name", label: "Name" },
          { key: "summary", label: "Summary", type: "textarea" },
          { key: "atmosphere", label: "Atmosphere" },
          { key: "rules", label: "Rules", type: "textarea" },
          { key: "notes", label: "Notes", type: "textarea" },
          { key: "tags", label: "Tags", type: "tags" },
        ]}
        items={project.locations as unknown as Record<string, unknown>[]}
        onAdd={() => mutateStoryBible("location", {}, undefined, "POST")}
        onAiFieldAction={onAiFieldAction}
        onDelete={(itemId) => mutateStoryBible("location", {}, itemId, "DELETE")}
        onSave={(itemId, payload) => mutateStoryBible("location", payload, itemId, "PATCH")}
        title="Locations"
      />

      <EditableListSection
        key={`factions-${project.factions.map((item) => item.id).join("-")}`}
        description="Factions influence pressure, resources, and off-screen causality."
        fields={[
          { key: "name", label: "Name" },
          { key: "summary", label: "Summary", type: "textarea" },
          { key: "agenda", label: "Agenda", type: "textarea" },
          { key: "resources", label: "Resources", type: "textarea" },
          { key: "notes", label: "Notes", type: "textarea" },
          { key: "tags", label: "Tags", type: "tags" },
        ]}
        items={project.factions as unknown as Record<string, unknown>[]}
        onAdd={() => mutateStoryBible("faction", {}, undefined, "POST")}
        onAiFieldAction={onAiFieldAction}
        onDelete={(itemId) => mutateStoryBible("faction", {}, itemId, "DELETE")}
        onSave={(itemId, payload) => mutateStoryBible("faction", payload, itemId, "PATCH")}
        title="Factions"
      />

      <EditableListSection
        key={`timeline-${project.timelineEvents.map((item) => item.id).join("-")}`}
        description="Timeline events support causality and make the continuity engine less guessy."
        fields={[
          { key: "label", label: "Label" },
          { key: "description", label: "Description", type: "textarea" },
          { key: "orderIndex", label: "Order", type: "number" },
          { key: "occursAtChapter", label: "Occurs at chapter", type: "number" },
        ]}
        items={project.timelineEvents as unknown as Record<string, unknown>[]}
        onAdd={() => mutateStoryBible("timelineEvent", {}, undefined, "POST")}
        onAiFieldAction={onAiFieldAction}
        onDelete={(itemId) => mutateStoryBible("timelineEvent", {}, itemId, "DELETE")}
        onSave={(itemId, payload) => mutateStoryBible("timelineEvent", payload, itemId, "PATCH")}
        title="Timeline"
      />

      <Card className="grid gap-4" data-testid="relationship-manager">
        <div>
          <h3 className="text-2xl">Relationship map</h3>
          <p className="text-sm text-[var(--muted)]">
            Relationship cards act as durable continuity anchors for trust, rivalry, romance, and power shifts.
          </p>
        </div>
        <CharacterRelationshipWeb characters={project.characters} relationships={project.relationships} />
        <div className="flex items-center justify-between gap-4">
          <div className="grid gap-1">
            <strong className="text-lg">Relationship manager</strong>
            <p className="text-sm text-[var(--muted)]">
              Keep the web honest by updating the exact dynamic, tension, and status between characters.
            </p>
          </div>
          <Button disabled={project.characters.length < 2} onClick={() => void handleAddRelationship()} variant="secondary">
            Add relationship
          </Button>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {project.relationships.map((relationship) => (
            <div key={relationship.id} className="grid gap-3 rounded-[24px] border border-[color:var(--line)] bg-[color:var(--panel-soft)]/78 p-4">
              <div className="flex items-center justify-between gap-3">
                <strong>
                  {relationship.sourceCharacterName} {"->"} {relationship.targetCharacterName}
                </strong>
                <Chip>{relationship.kind}</Chip>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="From">
                  <select
                    value={relationshipDrafts[relationship.id]?.sourceCharacterId ?? relationship.sourceCharacterId}
                    onChange={(event) =>
                      setRelationshipDraftOverrides((current) => ({
                        ...current,
                        [relationship.id]: {
                          ...(current[relationship.id] ?? relationship),
                          sourceCharacterId: event.target.value,
                        },
                      }))
                    }
                  >
                    {project.characters.map((character) => (
                      <option key={character.id} value={character.id}>
                        {character.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="To">
                  <select
                    value={relationshipDrafts[relationship.id]?.targetCharacterId ?? relationship.targetCharacterId}
                    onChange={(event) =>
                      setRelationshipDraftOverrides((current) => ({
                        ...current,
                        [relationship.id]: {
                          ...(current[relationship.id] ?? relationship),
                          targetCharacterId: event.target.value,
                        },
                      }))
                    }
                  >
                    {project.characters.map((character) => (
                      <option key={character.id} value={character.id}>
                        {character.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Relationship type">
                  <select
                    value={relationshipDrafts[relationship.id]?.kind ?? relationship.kind}
                    onChange={(event) =>
                      setRelationshipDraftOverrides((current) => ({
                        ...current,
                        [relationship.id]: {
                          ...(current[relationship.id] ?? relationship),
                          kind: event.target.value,
                        },
                      }))
                    }
                  >
                    {["ALLY", "ROMANTIC", "RIVAL", "FAMILY", "MENTOR", "ENEMY", "POLITICAL", "MYSTERY"].map((kind) => (
                      <option key={kind} value={kind}>
                        {kind}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Status">
                  <input
                    type="text"
                    value={relationshipDrafts[relationship.id]?.status ?? relationship.status}
                    onChange={(event) =>
                      setRelationshipDraftOverrides((current) => ({
                        ...current,
                        [relationship.id]: {
                          ...(current[relationship.id] ?? relationship),
                          status: event.target.value,
                        },
                      }))
                    }
                  />
                </Field>
              </div>
              <Field label="Description">
                <textarea
                  rows={3}
                  value={relationshipDrafts[relationship.id]?.description ?? relationship.description}
                  onChange={(event) =>
                    setRelationshipDraftOverrides((current) => ({
                      ...current,
                      [relationship.id]: {
                        ...(current[relationship.id] ?? relationship),
                        description: event.target.value,
                      },
                    }))
                  }
                />
              </Field>
              <Field label="Tension / friction">
                <input
                  type="text"
                  value={relationshipDrafts[relationship.id]?.tension ?? relationship.tension}
                  onChange={(event) =>
                    setRelationshipDraftOverrides((current) => ({
                      ...current,
                      [relationship.id]: {
                        ...(current[relationship.id] ?? relationship),
                        tension: event.target.value,
                      },
                    }))
                  }
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() =>
                    mutateStoryBible("relationship", relationshipDrafts[relationship.id] ?? relationship, relationship.id, "PATCH")
                  }
                  variant="secondary"
                >
                  Save relationship
                </Button>
                <Button onClick={() => mutateStoryBible("relationship", {}, relationship.id, "DELETE")} variant="ghost">
                  Delete relationship
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
