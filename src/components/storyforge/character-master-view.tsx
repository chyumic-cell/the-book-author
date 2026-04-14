"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { requestJson } from "@/components/storyforge/workspace-helpers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import type { CharacterInterpretationSuggestion, CharacterRecord } from "@/types/storyforge";

function splitLines(value: string) {
  return value
    .split(/\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getPath(source: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") {
      return "";
    }
    return (current as Record<string, unknown>)[part];
  }, source);
}

function setPath<T extends Record<string, unknown>>(source: T, path: string, value: unknown): T {
  const clone = { ...source } as Record<string, unknown>;
  const parts = path.split(".");
  let cursor = clone;

  parts.forEach((part, index) => {
    if (index === parts.length - 1) {
      cursor[part] = value;
      return;
    }

    cursor[part] =
      cursor[part] && typeof cursor[part] === "object"
        ? { ...(cursor[part] as Record<string, unknown>) }
        : {};
    cursor = cursor[part] as Record<string, unknown>;
  });

  return clone as T;
}

function ArrayField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <Field label={label}>
      <textarea rows={3} value={value.join("\n")} onChange={(event) => onChange(splitLines(event.target.value))} />
    </Field>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="grid gap-3">
      <h5 className="text-lg font-semibold">{title}</h5>
      {children}
    </Card>
  );
}

const textSections: Array<{ title: string; items: Array<[string, string, number?]> }> = [
  {
    title: "Basic Identity",
    items: [
      ["dossier.basicIdentity.fullName", "Full name"],
      ["dossier.basicIdentity.dateOfBirth", "Date of birth"],
      ["dossier.basicIdentity.gender", "Gender"],
      ["dossier.basicIdentity.culturalBackground", "Ethnicity / cultural background", 2],
      ["dossier.basicIdentity.nationality", "Nationality"],
      ["dossier.basicIdentity.currentResidence", "Current residence"],
      ["dossier.basicIdentity.placeOfOrigin", "Place of origin"],
      ["dossier.basicIdentity.beliefSystem", "Religion / belief system", 2],
      ["dossier.basicIdentity.maritalStatus", "Marital status"],
      ["dossier.basicIdentity.familyStatus", "Family status", 2],
    ],
  },
  {
    title: "Life / Social Position",
    items: [
      ["dossier.lifePosition.workplace", "Workplace"],
      ["dossier.lifePosition.roleTitle", "Current role/job title"],
      ["dossier.lifePosition.socialClass", "Social class / economic status"],
      ["dossier.lifePosition.educationLevel", "Education level"],
      ["dossier.lifePosition.trainingBackground", "Schooling / training background", 2],
      ["dossier.lifePosition.militaryBackground", "Military/service background", 2],
      ["dossier.lifePosition.criminalRecord", "Criminal record", 2],
      ["dossier.lifePosition.politicalOrientation", "Political orientation", 2],
      ["dossier.lifePosition.reputation", "Community standing / reputation", 2],
    ],
  },
  {
    title: "Personality / Behavior",
    items: [
      ["dossier.personalityBehavior.emotionalTendencies", "Emotional tendencies", 2],
      ["dossier.personalityBehavior.socialConfidence", "Social confidence level"],
      ["dossier.personalityBehavior.introExtroStyle", "Introvert / extrovert / situational"],
      ["dossier.personalityBehavior.conflictStyle", "Conflict style", 2],
      ["dossier.personalityBehavior.decisionMaking", "Decision-making style", 2],
      ["dossier.personalityBehavior.projectedImage", "What they want people to think", 2],
      ["dossier.personalityBehavior.trueNature", "What they are actually like", 2],
      ["dossier.personalityBehavior.hiddenSelf", "What they hide", 2],
      ["dossier.personalityBehavior.embarrassmentTriggers", "What embarrasses them", 2],
      ["dossier.personalityBehavior.angerTriggers", "What angers them", 2],
      ["dossier.personalityBehavior.comfortSources", "What comforts them", 2],
      ["dossier.personalityBehavior.fearTriggers", "What they fear", 2],
      ["dossier.personalityBehavior.coreValues", "What they value most", 2],
    ],
  },
  {
    title: "Motivation / Story Function",
    items: [
      ["dossier.motivationStory.shortTermGoal", "Short-term goal", 2],
      ["dossier.motivationStory.longTermGoal", "Long-term goal", 2],
      ["dossier.motivationStory.needVsWant", "Need vs want", 2],
      ["dossier.motivationStory.internalConflict", "Main internal conflict", 2],
      ["dossier.motivationStory.externalConflict", "Main external conflict", 2],
      ["dossier.motivationStory.wound", "Wound / trauma", 2],
      ["dossier.motivationStory.stakesIfFail", "Stakes if they fail", 2],
      ["dossier.motivationStory.arcDirection", "Character arc direction", 2],
      ["dossier.motivationStory.storyRole", "Role in story", 2],
      ["dossier.motivationStory.relationshipToMainConflict", "Relationship to main conflict", 2],
    ],
  },
  {
    title: "Speech / Language Profile",
    items: [
      ["dossier.speechLanguage.dialect", "Dialect"],
      ["dossier.speechLanguage.nativeLanguage", "Native language"],
      ["dossier.speechLanguage.fluencyLevels", "Fluency levels", 2],
      ["dossier.speechLanguage.formalityLevel", "Formality level"],
      ["dossier.speechLanguage.vocabularyLevel", "Vocabulary level"],
      ["dossier.speechLanguage.educationInSpeech", "Education reflected in speech", 2],
      ["dossier.speechLanguage.sentenceLength", "Sentence length tendencies"],
      ["dossier.speechLanguage.directness", "Direct vs indirect style"],
      ["dossier.speechLanguage.pointStyle", "Around the point vs to the point", 2],
      ["dossier.speechLanguage.swearingLevel", "Swearing level"],
      ["dossier.speechLanguage.rhythm", "Speech rhythm"],
      ["dossier.speechLanguage.emotionalShifts", "Emotional speech shifts", 2],
      ["dossier.speechLanguage.angrySpeech", "How they speak when angry", 2],
      ["dossier.speechLanguage.scaredSpeech", "How they speak when scared", 2],
      ["dossier.speechLanguage.lyingSpeech", "How they speak when lying", 2],
      ["dossier.speechLanguage.persuasiveSpeech", "How they speak when persuading", 2],
      ["dossier.speechLanguage.superiorSpeech", "How they speak to superiors", 2],
      ["dossier.speechLanguage.inferiorSpeech", "How they speak to inferiors", 2],
      ["dossier.speechLanguage.lovedOnesSpeech", "How they speak to loved ones", 2],
      ["dossier.speechLanguage.avoidedTopics", "What they avoid saying directly", 2],
      ["dossier.speechLanguage.commonMisunderstandings", "Speech misunderstandings", 2],
    ],
  },
  {
    title: "Body / Presence",
    items: [
      ["dossier.bodyPresence.physicalDescription", "Physical description", 2],
      ["dossier.bodyPresence.build", "Build"],
      ["dossier.bodyPresence.clothingStyle", "Clothing style", 2],
      ["dossier.bodyPresence.grooming", "Grooming"],
      ["dossier.bodyPresence.posture", "Posture"],
      ["dossier.bodyPresence.movementStyle", "Movement style", 2],
      ["dossier.bodyPresence.eyeContact", "Eye contact behavior", 2],
      ["dossier.bodyPresence.roomEntry", "How they enter a room", 2],
      ["dossier.bodyPresence.presenceFeel", "What their presence feels like to others", 2],
    ],
  },
  {
    title: "Story Memory / Continuity",
    items: [
      ["currentState.currentKnowledge", "What this character currently knows", 2],
      ["currentState.unknowns", "What they do not know yet", 2],
      ["currentState.emotionalState", "Current emotional state", 2],
      ["currentState.physicalCondition", "Current injuries / physical condition", 2],
      ["currentState.loyalties", "Current loyalties", 2],
      ["currentState.recentChanges", "Recent changes from latest chapter", 2],
      ["currentState.continuityRisks", "Open continuity risks", 2],
      ["currentState.lastMeaningfulAppearance", "Last meaningful scene appearance", 2],
    ],
  },
];

export function CharacterMasterView({
  projectId,
  characters,
  mutateStoryBible,
}: {
  projectId: string;
  characters: CharacterRecord[];
  mutateStoryBible: (
    entityType: "character" | "relationship" | "plotThread" | "location" | "faction" | "timelineEvent",
    payload: Record<string, unknown>,
    id?: string,
    method?: "POST" | "PATCH" | "DELETE",
  ) => Promise<void>;
}) {
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(characters[0]?.id ?? null);
  const [drafts, setDrafts] = useState<Record<string, CharacterRecord>>({});
  const [deepMode, setDeepMode] = useState(true);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [suggestions, setSuggestions] = useState<CharacterInterpretationSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  useEffect(() => {
    if (!selectedCharacterId || !characters.some((character) => character.id === selectedCharacterId)) {
      setSelectedCharacterId(characters[0]?.id ?? null);
    }
  }, [characters, selectedCharacterId]);

  const character = characters.find((entry) => entry.id === selectedCharacterId) ?? null;
  const draft = character ? drafts[character.id] ?? character : null;

  function updateDraft(next: CharacterRecord) {
    if (!character) {
      return;
    }
    setDrafts((current) => ({ ...current, [character.id]: next }));
  }

  function updateValue(path: string, value: unknown) {
    if (!draft) {
      return;
    }
    updateDraft(setPath(draft as unknown as Record<string, unknown>, path, value) as unknown as CharacterRecord);
  }

  async function saveCharacter() {
    if (!draft) {
      return;
    }
    await mutateStoryBible(
      "character",
      {
        name: draft.name,
        role: draft.role,
        archetype: draft.archetype,
        summary: draft.summary,
        goal: draft.goal,
        fear: draft.fear,
        secret: draft.secret,
        wound: draft.wound,
        quirks: draft.quirks,
        notes: draft.notes,
        tags: draft.tags,
        povEligible: draft.povEligible,
        quickProfile: draft.quickProfile,
        dossier: draft.dossier,
        currentState: draft.currentState,
        customFields: draft.customFields,
        pinnedFields: draft.pinnedFields,
      },
      draft.id,
      "PATCH",
    );
    toast.success("Character dossier saved.");
  }

  async function interpretNotes() {
    if (!draft) {
      return;
    }
    setLoadingSuggestions(true);
    try {
      const data = await requestJson<{ suggestions: CharacterInterpretationSuggestion[] }>(
        `/api/projects/${projectId}/characters/${draft.id}/interpret`,
        { method: "POST" },
      );
      setSuggestions(data.suggestions);
      toast.success("Interpretation ready.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not interpret this character.");
    } finally {
      setLoadingSuggestions(false);
    }
  }

  async function addCharacter() {
    await mutateStoryBible("character", { name: "New Character", summary: "Capture the character here." }, undefined, "POST");
  }

  return (
    <Card className="grid gap-4" data-testid="character-master">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-2xl font-semibold">Character Master</h3>
          <p className="text-sm text-[var(--muted)]">
            A structured dossier that still lets you write freely and let AI organize what matters.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void addCharacter()} variant="secondary">
            New character
          </Button>
          <Button onClick={() => setDeepMode((current) => !current)} variant="ghost">
            {deepMode ? "Quick edit mode" : "Deep edit mode"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="grid gap-3" data-testid="character-master-list">
          <Card className="grid gap-3">
            <div className="grid gap-1">
              <strong className="text-base text-[var(--text)]">Characters</strong>
              <p className="text-xs text-[var(--muted)]">
                Pick a character from the dropdown when you want to open that dossier.
              </p>
            </div>
            <Field label="Character field">
              <select
                value={selectedCharacterId ?? ""}
                onChange={(event) => {
                  setSelectedCharacterId(event.target.value || null);
                  setDetailsExpanded(Boolean(event.target.value));
                }}
              >
                {characters.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </Field>
            {character ? (
              <div className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--panel-soft)]/78 p-3">
                <div className="text-sm font-semibold text-[var(--text)]">{character.name}</div>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  {character.quickProfile.profession || character.role || character.summary}
                </div>
              </div>
            ) : null}
            <Button onClick={() => setDetailsExpanded((current) => !current)} variant="ghost">
              {detailsExpanded ? "Collapse dossier" : "Expand dossier"}
            </Button>
          </Card>
        </div>

        {draft && detailsExpanded ? (
          <div className="grid gap-4">
            <Card className="grid gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Chip>{draft.quickProfile.profession || "Character"}</Chip>
                    {draft.quickProfile.accent ? <Chip>{draft.quickProfile.accent}</Chip> : null}
                    {draft.currentState.emotionalState ? <Chip>{draft.currentState.emotionalState}</Chip> : null}
                  </div>
                  <h4 className="text-xl font-semibold">{draft.name}</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={loadingSuggestions} onClick={() => void interpretNotes()} variant="secondary">
                    {loadingSuggestions ? "Interpreting..." : "Interpret notes with AI"}
                  </Button>
                  <Button onClick={() => void saveCharacter()}>Save dossier</Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                <Field label="Name">
                  <input type="text" value={draft.name} onChange={(event) => updateDraft({ ...draft, name: event.target.value })} />
                </Field>
                <Field label="Age">
                  <input type="text" value={draft.quickProfile.age} onChange={(event) => updateValue("quickProfile.age", event.target.value)} />
                </Field>
                <Field label="Profession">
                  <input type="text" value={draft.quickProfile.profession} onChange={(event) => updateValue("quickProfile.profession", event.target.value)} />
                </Field>
                <Field label="Place of living">
                  <input type="text" value={draft.quickProfile.placeOfLiving} onChange={(event) => updateValue("quickProfile.placeOfLiving", event.target.value)} />
                </Field>
                <Field label="Accent">
                  <input type="text" value={draft.quickProfile.accent} onChange={(event) => updateValue("quickProfile.accent", event.target.value)} />
                </Field>
                <Field label="Speech pattern">
                  <input type="text" value={draft.quickProfile.speechPattern} onChange={(event) => updateValue("quickProfile.speechPattern", event.target.value)} />
                </Field>
              </div>

              <Field label="Free-text core">
                <textarea rows={8} value={draft.dossier.freeTextCore} onChange={(event) => updateValue("dossier.freeTextCore", event.target.value)} />
              </Field>

              <div className="grid gap-3 md:grid-cols-2">
                <ArrayField label="Nicknames" value={draft.dossier.basicIdentity.nicknames} onChange={(next) => updateValue("dossier.basicIdentity.nicknames", next)} />
                <ArrayField label="Core traits" value={draft.dossier.personalityBehavior.coreTraits} onChange={(next) => updateValue("dossier.personalityBehavior.coreTraits", next)} />
                <ArrayField label="Virtues" value={draft.dossier.personalityBehavior.virtues} onChange={(next) => updateValue("dossier.personalityBehavior.virtues", next)} />
                <ArrayField label="Flaws" value={draft.dossier.personalityBehavior.flaws} onChange={(next) => updateValue("dossier.personalityBehavior.flaws", next)} />
                <ArrayField label="Secrets" value={draft.dossier.motivationStory.secrets} onChange={(next) => updateValue("dossier.motivationStory.secrets", next)} />
                <ArrayField label="Other languages" value={draft.dossier.speechLanguage.otherLanguages} onChange={(next) => updateValue("dossier.speechLanguage.otherLanguages", next)} />
                <ArrayField label="Speech descriptors" value={draft.dossier.speechLanguage.descriptors} onChange={(next) => updateValue("dossier.speechLanguage.descriptors", next)} />
                <ArrayField label="Repeated phrases" value={draft.dossier.speechLanguage.repeatedPhrases} onChange={(next) => updateValue("dossier.speechLanguage.repeatedPhrases", next)} />
                <ArrayField label="Favorite expressions" value={draft.dossier.speechLanguage.favoriteExpressions} onChange={(next) => updateValue("dossier.speechLanguage.favoriteExpressions", next)} />
                <ArrayField label="Distinguishing features" value={draft.dossier.bodyPresence.distinguishingFeatures} onChange={(next) => updateValue("dossier.bodyPresence.distinguishingFeatures", next)} />
                <ArrayField label="Habits / tics" value={draft.dossier.bodyPresence.habitsTics} onChange={(next) => updateValue("dossier.bodyPresence.habitsTics", next)} />
                <ArrayField label="Friends" value={draft.dossier.relationshipDynamics.friends} onChange={(next) => updateValue("dossier.relationshipDynamics.friends", next)} />
                <ArrayField label="Enemies" value={draft.dossier.relationshipDynamics.enemies} onChange={(next) => updateValue("dossier.relationshipDynamics.enemies", next)} />
                <ArrayField label="Rivals" value={draft.dossier.relationshipDynamics.rivals} onChange={(next) => updateValue("dossier.relationshipDynamics.rivals", next)} />
                <ArrayField label="Lovers / exes" value={draft.dossier.relationshipDynamics.loversExes} onChange={(next) => updateValue("dossier.relationshipDynamics.loversExes", next)} />
                <ArrayField label="Family" value={draft.dossier.relationshipDynamics.family} onChange={(next) => updateValue("dossier.relationshipDynamics.family", next)} />
              </div>

              {deepMode ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {textSections.map((section) => (
                    <Section key={section.title} title={section.title}>
                      {section.items.map(([path, label, rows]) => (
                        <Field key={path} label={label}>
                          {rows && rows > 1 ? (
                            <textarea rows={rows} value={String(getPath(draft as unknown as Record<string, unknown>, path) ?? "")} onChange={(event) => updateValue(path, event.target.value)} />
                          ) : (
                            <input type="text" value={String(getPath(draft as unknown as Record<string, unknown>, path) ?? "")} onChange={(event) => updateValue(path, event.target.value)} />
                          )}
                        </Field>
                      ))}
                    </Section>
                  ))}
                </div>
              ) : null}
            </Card>

            <Card className="grid gap-3" data-testid="character-ai-suggestions">
              <div className="flex items-center justify-between gap-3">
                <h5 className="text-lg font-semibold">AI Suggestions</h5>
                <Chip>{suggestions.length} pending</Chip>
              </div>
              {suggestions.length === 0 ? (
                <div className="rounded-md border border-dashed border-[color:var(--line)] px-3 py-4 text-sm text-[var(--muted)]">
                  Write freely in the dossier, then use AI interpretation to turn the notes into structured character data.
                </div>
              ) : (
                <div className="grid gap-3">
                  {suggestions.map((suggestion) => (
                    <div key={`${suggestion.key}-${suggestion.value}`} className="rounded-md border border-[color:var(--line)] bg-[color:var(--panel-soft)] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <strong className="text-sm text-[var(--text)]">{suggestion.label}</strong>
                        <Button
                          onClick={() => {
                            const currentValue = getPath(draft as unknown as Record<string, unknown>, suggestion.key);
                            updateValue(suggestion.key, Array.isArray(currentValue) ? splitLines(suggestion.value) : suggestion.value);
                            setSuggestions((current) => current.filter((item) => item !== suggestion));
                          }}
                          variant="secondary"
                        >
                          Apply
                        </Button>
                      </div>
                      <p className="mt-2 text-sm text-[var(--text)]">{suggestion.value}</p>
                      <p className="mt-2 text-xs text-[var(--muted)]">{suggestion.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
