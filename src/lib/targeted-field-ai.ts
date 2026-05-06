import { CHAPTER_FIELD_SPECS, STORY_BIBLE_ENTITY_SPECS } from "@/lib/assistant-site-map";
import { cleanGeneratedText, cleanSummaryText } from "@/lib/ai-output";
import {
  normalizeCharacterDossier,
  normalizeCharacterQuickProfile,
  normalizeCharacterState,
} from "@/lib/character-dossier";
import { buildContextPackage } from "@/lib/memory";
import { generateTextWithProvider } from "@/lib/openai";
import { getProjectWorkspace } from "@/lib/project-data";
import { buildPromptEnvelope } from "@/lib/prompt-templates";
import { mutateSkeleton, mutateStoryBible, updateChapter } from "@/lib/story-service";
import { compactText } from "@/lib/utils";
import type {
  AssistFieldKey,
  CharacterRecord,
  ProjectWorkspace,
} from "@/types/storyforge";

type PlanningAction = "develop" | "expand" | "tighten";
type StoryBibleEntityType =
  | "character"
  | "relationship"
  | "plotThread"
  | "location"
  | "faction"
  | "timelineEvent"
  | "workingNote";
type SkeletonEntityType = "structureBeat" | "sceneCard";

const chapterListFields = new Set<AssistFieldKey>([
  "keyBeats",
  "requiredInclusions",
  "forbiddenElements",
  "sceneList",
]);

function splitLines(value: string) {
  return value
    .split(/\r?\n|,|\|/)
    .map((entry) => entry.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
}

function cleanTitle(value: string, fallback: string) {
  const firstLine = value.split(/\r?\n/).find((line) => line.trim()) ?? "";
  const cleaned = firstLine
    .replace(/^(?:chapter\s+title|title)\s*:\s*/i, "")
    .replace(/^chapter\s+\d+\s*[:.\-–—]?\s*/i, "")
    .replace(/^(?:act|part|section|book)\s+(?:[ivxlcdm]+|\d+)\s*[:.\-–—]?\s*/i, "")
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "")
    .trim();
  return cleaned || fallback;
}

function looksLikeWeakTitle(value: string) {
  const normalized = value.trim().toLowerCase();
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  return (
    !normalized ||
    wordCount > 8 ||
    normalized.includes("user wants") ||
    normalized.includes("current title") ||
    normalized.includes("let's") ||
    normalized.includes("tackle this") ||
    normalized.includes("the chapter title") ||
    normalized.includes("they want") ||
    normalized.endsWith(".") ||
    normalized.includes(":")
  );
}

function cleanFieldText(fieldKey: string, value: string, fallback: string) {
  const base =
    fieldKey === "outline" ? cleanGeneratedText(value) : cleanSummaryText(value);
  const cleaned = base
    .replace(/^(?:summary|description|notes|outline|purpose|title|rule name|rule \/ internal logic)\s*:\s*/i, "")
    .trim();
  return cleaned || fallback;
}

function chapterFieldValue(chapter: ProjectWorkspace["chapters"][number], fieldKey: AssistFieldKey) {
  if (chapterListFields.has(fieldKey)) {
    return (chapter[fieldKey] as string[]).join("\n");
  }
  return String(chapter[fieldKey] ?? "");
}

function chapterFieldLooksThin(fieldKey: AssistFieldKey, value: string, chapterNumber: number) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  if (fieldKey === "title") {
    return normalized === `chapter ${chapterNumber}` || looksLikeWeakTitle(value);
  }
  if (fieldKey === "purpose") {
    return normalized === "advance the next major movement of the story.";
  }
  if (fieldKey === "currentBeat") {
    return normalized === "fresh pressure enters the chapter." || normalized === "inciting movement";
  }
  if (fieldKey === "desiredMood") {
    return normalized.split(/\s+/).length <= 2;
  }
  if (fieldKey === "outline") {
    return normalized.length < 180;
  }
  if (chapterListFields.has(fieldKey)) {
    return splitLines(value).length <= 1;
  }
  return normalized.length < 40;
}

function storyBibleFieldLooksThin(fieldKey: string, value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  if (fieldKey === "name" || fieldKey === "title" || fieldKey === "label") {
    return normalized.length < 3;
  }
  if (fieldKey === "summary" || fieldKey === "description" || fieldKey === "content" || fieldKey === "notes") {
    return normalized.length < 50;
  }
  if (fieldKey === "tags") {
    return splitLines(value).length === 0;
  }
  return normalized.length < 20;
}

function looksLikeMetaOutput(value: string) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.startsWith("okay") ||
    normalized.startsWith("alright") ||
    normalized.startsWith("let me") ||
    normalized.startsWith("first,") ||
    normalized.startsWith("wait,") ||
    normalized.startsWith("the user wants") ||
    normalized.includes("the user wants me") ||
    normalized.includes("i need to") ||
    normalized.includes("return only") ||
    normalized.includes("field value") ||
    normalized.includes("the instruction says") ||
    normalized.includes("looking back") ||
    normalized.includes("i should")
  );
}

function chapterFieldInstruction(fieldKey: AssistFieldKey, action: PlanningAction) {
  const actionLine =
    action === "expand"
      ? "Expand the current field into something fuller, more specific, and more useful."
      : action === "tighten"
        ? "Tighten the current field into a shorter, cleaner, sharper version without losing the real idea."
        : "Develop this field so it becomes specific, useful, and synchronized with the rest of the project.";

  const fieldLine =
    fieldKey === "title"
      ? "Return only a strong chapter title, ideally 2 to 7 words. Do not return act names, part labels, or chapter numbers."
      : fieldKey === "purpose"
        ? "Return 1 to 3 sharp sentences stating what this chapter must accomplish structurally and emotionally."
        : fieldKey === "currentBeat"
          ? "Return one strong sentence naming the immediate dramatic movement or pressure of the chapter."
          : fieldKey === "desiredMood"
            ? "Return a short mood phrase, not a paragraph."
            : fieldKey === "outline"
              ? "Return a chapter outline with 5 to 9 concrete beats. Each beat should show what happens, what pressure changes, and why the reader keeps going."
              : fieldKey === "sceneList"
                ? "Return 3 to 8 concrete scene lines. Each line should be a real scene, not a vague label."
                : chapterListFields.has(fieldKey)
                  ? "Return plain list items separated by new lines. No numbering, no labels."
                  : "Return only the final content for this exact field.";

  return [actionLine, fieldLine].join("\n");
}

async function repairMetaOutput(options: {
  project: ProjectWorkspace;
  context: ReturnType<typeof buildContextPackage>;
  task: string;
  instruction: string;
  badOutput: string;
  roleInstruction: string;
  maxOutputTokens: number;
}) {
  const repairPrompt = buildPromptEnvelope(
    options.task,
    options.project,
    options.context,
    [
      options.instruction,
      "The previous result leaked internal reasoning or instruction-following chatter.",
      "Return only the final field content now.",
      "Do not mention the user, the instruction, the field, or your reasoning.",
      `Rejected result:\n${options.badOutput}`,
    ].join("\n\n"),
    options.roleInstruction,
  );
  const repaired = await generateTextWithProvider(repairPrompt, { maxOutputTokens: options.maxOutputTokens });
  return repaired?.trim() ?? options.badOutput;
}

function resolveProjectChapter(project: ProjectWorkspace, itemId: string) {
  return project.chapters.find((chapter) => chapter.id === itemId) ?? null;
}

function normalizeChapterFieldUpdate(fieldKey: AssistFieldKey, currentValue: string, generated: string): Parameters<typeof updateChapter>[1] {
  if (fieldKey === "title") {
    return { title: cleanTitle(generated, currentValue) };
  }

  if (chapterListFields.has(fieldKey)) {
    return { [fieldKey]: splitLines(generated) } as Parameters<typeof updateChapter>[1];
  }

  return { [fieldKey]: cleanFieldText(fieldKey, generated, currentValue) } as Parameters<typeof updateChapter>[1];
}

function getEntityValue(entity: Record<string, unknown>, fieldKey: string) {
  const value = entity[fieldKey];
  if (Array.isArray(value)) {
    return value.join("\n");
  }
  return String(value ?? "");
}

function normalizeStoryBibleFieldValue(fieldKey: string, raw: string, currentValue: string) {
  const cleaned = cleanFieldText(fieldKey, raw, currentValue);
  if (fieldKey === "tags") {
    return splitLines(cleaned);
  }
  return cleaned;
}

function normalizeSkeletonFieldValue(fieldKey: string, raw: string, currentValue: string) {
  if (fieldKey === "orderIndex") {
    const numeric = Number(raw);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : Number(currentValue || 1) || 1;
  }
  if (fieldKey === "frozen") {
    return /^true|yes|1$/i.test(raw.trim());
  }
  return cleanFieldText(fieldKey, raw, currentValue);
}

function normalizeDraftFieldValue(raw: unknown) {
  if (Array.isArray(raw)) {
    return raw.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : 0;
  }
  if (typeof raw === "boolean") {
    return raw;
  }
  if (raw && typeof raw === "object") {
    return raw;
  }
  return String(raw ?? "");
}

function buildChapterDraftPatchFromRecord(draftItem?: Record<string, unknown>) {
  if (!draftItem) {
    return {};
  }

  const patch: Record<string, unknown> = {};
  for (const fieldKey of [
    "title",
    "purpose",
    "currentBeat",
    "targetWordCount",
    "desiredMood",
    "outline",
    "draft",
    "notes",
    "keyBeats",
    "requiredInclusions",
    "forbiddenElements",
    "sceneList",
  ] as const) {
    if (!(fieldKey in draftItem)) {
      continue;
    }
    const raw = draftItem[fieldKey];
    patch[fieldKey] = chapterListFields.has(fieldKey as AssistFieldKey)
      ? (Array.isArray(raw) ? raw.map((entry) => String(entry).trim()).filter(Boolean) : splitLines(String(raw ?? "")))
      : fieldKey === "targetWordCount"
        ? Number(raw ?? 0)
        : String(raw ?? "");
  }

  return patch as Parameters<typeof updateChapter>[1];
}

function mergeDraftIntoChapter(
  chapter: ProjectWorkspace["chapters"][number],
  draftItem?: Record<string, unknown>,
) {
  if (!draftItem) {
    return chapter;
  }

  return {
    ...chapter,
    ...buildChapterDraftPatchFromRecord(draftItem),
  };
}

function buildStoryBibleDraftPayload(draftItem?: Record<string, unknown>) {
  if (!draftItem) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(draftItem)
      .filter(([key]) => key !== "id")
      .map(([key, value]) => [key, normalizeDraftFieldValue(value)]),
  );
}

function mergeDraftIntoEntity(
  entity: Record<string, unknown>,
  draftItem?: Record<string, unknown>,
) {
  if (!draftItem) {
    return entity;
  }

  return {
    ...entity,
    ...buildStoryBibleDraftPayload(draftItem),
  };
}

function findSkeletonEntity(
  project: ProjectWorkspace,
  targetEntityType: SkeletonEntityType,
  itemId: string,
): Record<string, unknown> | null {
  const pool =
    targetEntityType === "structureBeat"
      ? (project.structureBeats as unknown as Record<string, unknown>[])
      : (project.sceneCards as unknown as Record<string, unknown>[]);
  return pool.find((entry) => String(entry.id) === itemId) ?? null;
}

function skeletonFieldLooksThin(fieldKey: string, value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  if (fieldKey === "label" || fieldKey === "title") {
    return normalized.length < 6;
  }
  if (fieldKey === "description" || fieldKey === "summary" || fieldKey === "notes" || fieldKey === "goal" || fieldKey === "conflict" || fieldKey === "outcome") {
    return normalized.length < 50;
  }
  return normalized.length < 12;
}

async function generateSingleSkeletonFieldValue(options: {
  project: ProjectWorkspace;
  targetEntityType: SkeletonEntityType;
  entity: Record<string, unknown>;
  itemTitle: string;
  fieldKey: string;
  fieldLabel: string;
  action: PlanningAction;
  contextChapterId: string;
}) {
  const { project, targetEntityType, entity, itemTitle, fieldKey, fieldLabel, action, contextChapterId } = options;
  const currentValue = getEntityValue(entity, fieldKey);
  const context = buildContextPackage(project, contextChapterId, currentValue);
  const thinCurrent = skeletonFieldLooksThin(fieldKey, currentValue);
  const prompt = buildPromptEnvelope(
    `Update ${targetEntityType === "structureBeat" ? "Structure Engine" : "Scene Engine"} field`,
    project,
    context,
    [
      `Target area: Story Skeleton -> ${targetEntityType === "structureBeat" ? "Structure engine" : "Scene engine"} -> ${itemTitle || String(entity.label ?? entity.title ?? "Untitled")} -> ${fieldLabel || fieldKey}.`,
      "Update only this exact field on this exact record.",
      "Use all existing project, series, story-bible, skeleton, chapter, memory, and continuity material as binding canon.",
      "Do not contradict the rest of the project. Keep everything synchronized.",
      currentValue
        ? "Base the result on what is already written in this exact textbox. Preserve the core idea and improve it."
        : "The textbox is blank, so you may generate the field freely as long as it stays canon-safe.",
      thinCurrent
        ? "The current field value is blank, generic, or placeholder-level. Replace it with specific canon-safe content."
        : "Keep the useful core of the current field value, but make it stronger and more specific.",
      action === "expand"
        ? "Expand this field into something fuller, more specific, and more useful."
        : action === "tighten"
          ? "Tighten this field into a shorter, cleaner, sharper version without losing the core idea."
          : "Develop this field so it becomes specific, useful, and structurally intelligent.",
      fieldKey === "label" || fieldKey === "title"
        ? "Return only a concise, strong label or title."
        : fieldKey === "type" || fieldKey === "status" || fieldKey === "outcomeType"
          ? "Return only the single best canonical value for this field, not commentary."
          : fieldKey === "chapterId"
            ? "Return a human chapter reference like 'Chapter 3' or 'Chapter 3: The Crossing', or leave it blank if this item should not link to a chapter."
            : fieldKey === "povCharacterId"
              ? "Return the exact character name that should own this scene, or leave it blank."
              : "Return only the final text for this exact field.",
      currentValue ? `Current field value:\n${currentValue}` : "Current field value is blank.",
      "Return only the final field value. No JSON, no labels, no commentary.",
    ].join("\n\n"),
    "You are a precise story-structure editor. Write the exact field value, not notes about what you would do.",
  );

  const raw = await generateTextWithProvider(prompt, { maxOutputTokens: 700 });
  let generated = raw?.trim();
  if (!generated) {
    return null;
  }
  if (looksLikeMetaOutput(generated)) {
    generated = await repairMetaOutput({
      project,
      context,
      task: `Repair ${targetEntityType} field`,
      instruction: `Return only the corrected value for ${fieldLabel || fieldKey}.`,
      badOutput: generated,
      roleInstruction: "Return only the corrected Story Skeleton field value.",
      maxOutputTokens: 700,
    });
  }
  return generated;
}

function buildCharacterDraftPayload(draftCharacter?: Record<string, unknown>) {
  if (!draftCharacter) {
    return {};
  }

  const payload: Record<string, unknown> = {};
  for (const fieldKey of [
    "name",
    "role",
    "archetype",
    "summary",
    "goal",
    "fear",
    "secret",
    "wound",
    "notes",
  ] as const) {
    if (fieldKey in draftCharacter) {
      payload[fieldKey] = String(draftCharacter[fieldKey] ?? "");
    }
  }
  if ("quirks" in draftCharacter) {
    payload.quirks = Array.isArray(draftCharacter.quirks)
      ? draftCharacter.quirks.map((entry) => String(entry).trim()).filter(Boolean)
      : splitLines(String(draftCharacter.quirks ?? ""));
  }
  if ("tags" in draftCharacter) {
    payload.tags = Array.isArray(draftCharacter.tags)
      ? draftCharacter.tags.map((entry) => String(entry).trim()).filter(Boolean)
      : splitLines(String(draftCharacter.tags ?? ""));
  }
  if ("povEligible" in draftCharacter) {
    payload.povEligible = Boolean(draftCharacter.povEligible);
  }
  for (const nestedKey of ["quickProfile", "dossier", "currentState", "customFields", "pinnedFields"] as const) {
    if (nestedKey in draftCharacter) {
      payload[nestedKey] = draftCharacter[nestedKey];
    }
  }

  return payload;
}

function mergeCharacterDraft(
  character: CharacterRecord,
  draftCharacter?: Record<string, unknown>,
): CharacterRecord {
  if (!draftCharacter) {
    return character;
  }

  const patch = buildCharacterDraftPayload(draftCharacter);
  return {
    ...character,
    ...patch,
    quickProfile:
      patch.quickProfile && typeof patch.quickProfile === "object"
        ? {
            ...character.quickProfile,
            ...(patch.quickProfile as Record<string, unknown>),
          }
        : character.quickProfile,
    dossier:
      patch.dossier && typeof patch.dossier === "object"
        ? {
            ...character.dossier,
            ...(patch.dossier as Record<string, unknown>),
          }
        : character.dossier,
    currentState:
      patch.currentState && typeof patch.currentState === "object"
        ? {
            ...character.currentState,
            ...(patch.currentState as Record<string, unknown>),
          }
        : character.currentState,
  } as CharacterRecord;
}

function applyCharacterPatch(
  character: CharacterRecord,
  patch: Record<string, unknown>,
): CharacterRecord {
  const nextQuickProfile =
    patch.quickProfile && typeof patch.quickProfile === "object"
      ? {
          ...character.quickProfile,
          ...(patch.quickProfile as Record<string, unknown>),
        }
      : character.quickProfile;
  const nextDossier =
    patch.dossier && typeof patch.dossier === "object"
      ? {
          ...character.dossier,
          ...(patch.dossier as Record<string, unknown>),
        }
      : character.dossier;
  const nextCurrentState =
    patch.currentState && typeof patch.currentState === "object"
      ? {
          ...character.currentState,
          ...(patch.currentState as Record<string, unknown>),
        }
      : character.currentState;

  return {
    ...character,
    ...patch,
    quickProfile: nextQuickProfile,
    dossier: nextDossier,
    currentState: nextCurrentState,
  } as CharacterRecord;
}

function mergeCharacterIntoProject(
  project: ProjectWorkspace,
  characterId: string,
  nextCharacter: CharacterRecord,
): ProjectWorkspace {
  return {
    ...project,
    characters: project.characters.map((entry) => (entry.id === characterId ? nextCharacter : entry)),
  };
}

function compactCharacterCanon(
  project: ProjectWorkspace,
  chapterId: string,
  character: CharacterRecord,
) {
  const chapter = project.chapters.find((entry) => entry.id === chapterId) ?? null;
  return [
    `Premise: ${project.premise}`,
    project.oneLineHook ? `Hook: ${project.oneLineHook}` : "",
    project.bookSettings.storyBrief ? `Story brief: ${project.bookSettings.storyBrief}` : "",
    project.bookSettings.plotDirection ? `Plot direction: ${project.bookSettings.plotDirection}` : "",
    chapter
      ? `Current chapter context: Chapter ${chapter.number} - ${chapter.title}. Purpose: ${compactText(chapter.purpose, 220)}`
      : "",
    character.name ? `Character: ${character.name}` : "",
    character.role ? `Role: ${character.role}` : "",
    character.summary ? `Current summary: ${compactText(character.summary, 220)}` : "",
    character.goal ? `Current goal: ${compactText(character.goal, 180)}` : "",
    character.notes ? `Current notes: ${compactText(character.notes, 180)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

type CharacterSectionPrompt = {
  label: string;
  shape: Record<string, unknown>;
  maxOutputTokens: number;
  guidance: string;
};

const CHARACTER_LIST_FIELD_PATHS = new Set([
  "dossier.basicIdentity.nicknames",
  "dossier.personalityBehavior.coreTraits",
  "dossier.personalityBehavior.virtues",
  "dossier.personalityBehavior.flaws",
  "dossier.motivationStory.secrets",
  "dossier.speechLanguage.otherLanguages",
  "dossier.speechLanguage.descriptors",
  "dossier.speechLanguage.repeatedPhrases",
  "dossier.speechLanguage.favoriteExpressions",
  "dossier.bodyPresence.distinguishingFeatures",
  "dossier.bodyPresence.habitsTics",
  "dossier.relationshipDynamics.friends",
  "dossier.relationshipDynamics.enemies",
  "dossier.relationshipDynamics.rivals",
  "dossier.relationshipDynamics.loversExes",
  "dossier.relationshipDynamics.family",
  "dossier.relationshipDynamics.mentors",
  "dossier.relationshipDynamics.subordinatesSuperiors",
]);

function isThinTextValue(value: unknown, minimum: number) {
  return String(value ?? "").trim().length < minimum;
}

function isThinListValue(value: unknown, minimumItems: number) {
  return !Array.isArray(value) || value.map((entry) => String(entry).trim()).filter(Boolean).length < minimumItems;
}

function buildCharacterSectionPrompts(character: CharacterRecord) {
  const sections: CharacterSectionPrompt[] = [];
  const includeAllFields = true;

  const coreShape: Record<string, unknown> = {};
  if (includeAllFields || isThinTextValue(character.summary, 80)) coreShape.summary = "";
  if (includeAllFields || isThinTextValue(character.role, 4)) coreShape.role = "";
  if (includeAllFields || isThinTextValue(character.archetype, 8)) coreShape.archetype = "";
  if (includeAllFields || isThinTextValue(character.goal, 28)) coreShape.goal = "";
  if (includeAllFields || isThinTextValue(character.fear, 18)) coreShape.fear = "";
  if (includeAllFields || isThinTextValue(character.secret, 18)) coreShape.secret = "";
  if (includeAllFields || isThinTextValue(character.wound, 18)) coreShape.wound = "";
  if (includeAllFields || isThinTextValue(character.notes, 50)) coreShape.notes = "";
  const quickProfile: Record<string, string> = {};
  if (includeAllFields || isThinTextValue(character.quickProfile.age, 2)) quickProfile.age = "";
  if (includeAllFields || isThinTextValue(character.quickProfile.profession, 4)) quickProfile.profession = "";
  if (includeAllFields || isThinTextValue(character.quickProfile.placeOfLiving, 4)) quickProfile.placeOfLiving = "";
  if (includeAllFields || isThinTextValue(character.quickProfile.accent, 3)) quickProfile.accent = "";
  if (includeAllFields || isThinTextValue(character.quickProfile.speechPattern, 14)) quickProfile.speechPattern = "";
  if (Object.keys(quickProfile).length > 0) {
    coreShape.quickProfile = quickProfile;
  }
  const basicIdentity: Record<string, unknown> = {};
  if (includeAllFields || isThinTextValue(character.dossier.basicIdentity.fullName, 3)) basicIdentity.fullName = "";
  if (includeAllFields || isThinListValue(character.dossier.basicIdentity.nicknames, 1)) basicIdentity.nicknames = [];
  if (includeAllFields || isThinTextValue(character.dossier.basicIdentity.dateOfBirth, 3)) basicIdentity.dateOfBirth = "";
  if (includeAllFields || isThinTextValue(character.dossier.basicIdentity.gender, 3)) basicIdentity.gender = "";
  if (includeAllFields || isThinTextValue(character.dossier.basicIdentity.culturalBackground, 6)) basicIdentity.culturalBackground = "";
  if (includeAllFields || isThinTextValue(character.dossier.basicIdentity.nationality, 4)) basicIdentity.nationality = "";
  if (includeAllFields || isThinTextValue(character.dossier.basicIdentity.currentResidence, 4)) basicIdentity.currentResidence = "";
  if (includeAllFields || isThinTextValue(character.dossier.basicIdentity.placeOfOrigin, 4)) basicIdentity.placeOfOrigin = "";
  if (includeAllFields || isThinTextValue(character.dossier.basicIdentity.beliefSystem, 6)) basicIdentity.beliefSystem = "";
  if (includeAllFields || isThinTextValue(character.dossier.basicIdentity.maritalStatus, 4)) basicIdentity.maritalStatus = "";
  if (includeAllFields || isThinTextValue(character.dossier.basicIdentity.familyStatus, 4)) basicIdentity.familyStatus = "";
  const lifePosition: Record<string, unknown> = {};
  if (includeAllFields || isThinTextValue(character.dossier.lifePosition.profession, 4)) lifePosition.profession = "";
  if (includeAllFields || isThinTextValue(character.dossier.lifePosition.workplace, 4)) lifePosition.workplace = "";
  if (includeAllFields || isThinTextValue(character.dossier.lifePosition.roleTitle, 4)) lifePosition.roleTitle = "";
  if (includeAllFields || isThinTextValue(character.dossier.lifePosition.socialClass, 4)) lifePosition.socialClass = "";
  if (includeAllFields || isThinTextValue(character.dossier.lifePosition.educationLevel, 4)) lifePosition.educationLevel = "";
  if (includeAllFields || isThinTextValue(character.dossier.lifePosition.trainingBackground, 6)) lifePosition.trainingBackground = "";
  if (includeAllFields || isThinTextValue(character.dossier.lifePosition.militaryBackground, 6)) lifePosition.militaryBackground = "";
  if (includeAllFields || isThinTextValue(character.dossier.lifePosition.criminalRecord, 6)) lifePosition.criminalRecord = "";
  if (includeAllFields || isThinTextValue(character.dossier.lifePosition.politicalOrientation, 6)) lifePosition.politicalOrientation = "";
  if (includeAllFields || isThinTextValue(character.dossier.lifePosition.reputation, 6)) lifePosition.reputation = "";
  if (Object.keys(coreShape).length > 0 || Object.keys(basicIdentity).length > 0 || Object.keys(lifePosition).length > 0) {
    sections.push({
      label: "identity and life position",
      maxOutputTokens: 320,
      guidance:
        "Fill the requested top-level fields plus identity and social-position facts. Keep each value compact, vivid, and app-ready.",
      shape: {
        ...coreShape,
        dossier: {
          ...(Object.keys(basicIdentity).length > 0 ? { basicIdentity } : {}),
          ...(Object.keys(lifePosition).length > 0 ? { lifePosition } : {}),
        },
      },
    });
  }

  const personalityBehavior: Record<string, unknown> = {};
  if (includeAllFields || isThinListValue(character.dossier.personalityBehavior.coreTraits, 3)) personalityBehavior.coreTraits = [];
  if (includeAllFields || isThinListValue(character.dossier.personalityBehavior.virtues, 2)) personalityBehavior.virtues = [];
  if (includeAllFields || isThinListValue(character.dossier.personalityBehavior.flaws, 2)) personalityBehavior.flaws = [];
  if (includeAllFields || isThinTextValue(character.dossier.personalityBehavior.emotionalTendencies, 12)) personalityBehavior.emotionalTendencies = "";
  if (includeAllFields || isThinTextValue(character.dossier.personalityBehavior.socialConfidence, 8)) personalityBehavior.socialConfidence = "";
  if (includeAllFields || isThinTextValue(character.dossier.personalityBehavior.introExtroStyle, 8)) personalityBehavior.introExtroStyle = "";
  if (includeAllFields || isThinTextValue(character.dossier.personalityBehavior.conflictStyle, 12)) personalityBehavior.conflictStyle = "";
  if (includeAllFields || isThinTextValue(character.dossier.personalityBehavior.decisionMaking, 12)) personalityBehavior.decisionMaking = "";
  if (includeAllFields || isThinTextValue(character.dossier.personalityBehavior.projectedImage, 12)) personalityBehavior.projectedImage = "";
  if (includeAllFields || isThinTextValue(character.dossier.personalityBehavior.trueNature, 12)) personalityBehavior.trueNature = "";
  if (includeAllFields || isThinTextValue(character.dossier.personalityBehavior.hiddenSelf, 12)) personalityBehavior.hiddenSelf = "";
  if (includeAllFields || isThinTextValue(character.dossier.personalityBehavior.embarrassmentTriggers, 10)) personalityBehavior.embarrassmentTriggers = "";
  if (includeAllFields || isThinTextValue(character.dossier.personalityBehavior.angerTriggers, 10)) personalityBehavior.angerTriggers = "";
  if (includeAllFields || isThinTextValue(character.dossier.personalityBehavior.comfortSources, 10)) personalityBehavior.comfortSources = "";
  if (includeAllFields || isThinTextValue(character.dossier.personalityBehavior.fearTriggers, 10)) personalityBehavior.fearTriggers = "";
  if (includeAllFields || isThinTextValue(character.dossier.personalityBehavior.coreValues, 12)) personalityBehavior.coreValues = "";
  const motivationStory: Record<string, unknown> = {};
  if (includeAllFields || isThinTextValue(character.dossier.motivationStory.shortTermGoal, 16)) motivationStory.shortTermGoal = "";
  if (includeAllFields || isThinTextValue(character.dossier.motivationStory.longTermGoal, 16)) motivationStory.longTermGoal = "";
  if (includeAllFields || isThinTextValue(character.dossier.motivationStory.needVsWant, 12)) motivationStory.needVsWant = "";
  if (includeAllFields || isThinTextValue(character.dossier.motivationStory.internalConflict, 16)) motivationStory.internalConflict = "";
  if (includeAllFields || isThinTextValue(character.dossier.motivationStory.externalConflict, 16)) motivationStory.externalConflict = "";
  if (includeAllFields || isThinTextValue(character.dossier.motivationStory.wound, 12)) motivationStory.wound = "";
  if (includeAllFields || isThinListValue(character.dossier.motivationStory.secrets, 1)) motivationStory.secrets = [];
  if (includeAllFields || isThinTextValue(character.dossier.motivationStory.stakesIfFail, 16)) motivationStory.stakesIfFail = "";
  if (includeAllFields || isThinTextValue(character.dossier.motivationStory.arcDirection, 12)) motivationStory.arcDirection = "";
  if (includeAllFields || isThinTextValue(character.dossier.motivationStory.storyRole, 10)) motivationStory.storyRole = "";
  if (includeAllFields || isThinTextValue(character.dossier.motivationStory.relationshipToMainConflict, 16)) motivationStory.relationshipToMainConflict = "";
  const currentState: Record<string, unknown> = {};
  if (includeAllFields || isThinTextValue(character.currentState.currentKnowledge, 16)) currentState.currentKnowledge = "";
  if (includeAllFields || isThinTextValue(character.currentState.unknowns, 12)) currentState.unknowns = "";
  if (includeAllFields || isThinTextValue(character.currentState.emotionalState, 12)) currentState.emotionalState = "";
  if (includeAllFields || isThinTextValue(character.currentState.physicalCondition, 10)) currentState.physicalCondition = "";
  if (includeAllFields || isThinTextValue(character.currentState.loyalties, 12)) currentState.loyalties = "";
  if (includeAllFields || isThinTextValue(character.currentState.recentChanges, 12)) currentState.recentChanges = "";
  if (includeAllFields || isThinTextValue(character.currentState.continuityRisks, 16)) currentState.continuityRisks = "";
  if (Object.keys(personalityBehavior).length > 0 || Object.keys(motivationStory).length > 0 || Object.keys(currentState).length > 0) {
    sections.push({
      label: "personality, motivation, and emotional state",
      maxOutputTokens: 360,
      guidance:
        "Fill the requested psychological, motivational, and state fields with concise but specific values that match the existing canon and emotional pressure.",
      shape: {
        dossier: {
          ...(Object.keys(personalityBehavior).length > 0 ? { personalityBehavior } : {}),
          ...(Object.keys(motivationStory).length > 0 ? { motivationStory } : {}),
        },
        ...(Object.keys(currentState).length > 0 ? { currentState } : {}),
      },
    });
  }

  const speechLanguage: Record<string, unknown> = {};
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.accent, 3)) speechLanguage.accent = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.dialect, 3)) speechLanguage.dialect = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.nativeLanguage, 3)) speechLanguage.nativeLanguage = "";
  if (includeAllFields || isThinListValue(character.dossier.speechLanguage.otherLanguages, 1)) speechLanguage.otherLanguages = [];
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.fluencyLevels, 10)) speechLanguage.fluencyLevels = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.formalityLevel, 8)) speechLanguage.formalityLevel = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.vocabularyLevel, 8)) speechLanguage.vocabularyLevel = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.educationInSpeech, 8)) speechLanguage.educationInSpeech = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.sentenceLength, 8)) speechLanguage.sentenceLength = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.directness, 8)) speechLanguage.directness = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.pointStyle, 8)) speechLanguage.pointStyle = "";
  if (includeAllFields || isThinListValue(character.dossier.speechLanguage.descriptors, 2)) speechLanguage.descriptors = [];
  if (includeAllFields || isThinListValue(character.dossier.speechLanguage.repeatedPhrases, 1)) speechLanguage.repeatedPhrases = [];
  if (includeAllFields || isThinListValue(character.dossier.speechLanguage.favoriteExpressions, 1)) speechLanguage.favoriteExpressions = [];
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.swearingLevel, 8)) speechLanguage.swearingLevel = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.rhythm, 8)) speechLanguage.rhythm = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.emotionalShifts, 10)) speechLanguage.emotionalShifts = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.angrySpeech, 12)) speechLanguage.angrySpeech = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.scaredSpeech, 12)) speechLanguage.scaredSpeech = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.lyingSpeech, 12)) speechLanguage.lyingSpeech = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.persuasiveSpeech, 12)) speechLanguage.persuasiveSpeech = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.superiorSpeech, 12)) speechLanguage.superiorSpeech = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.inferiorSpeech, 12)) speechLanguage.inferiorSpeech = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.lovedOnesSpeech, 12)) speechLanguage.lovedOnesSpeech = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.avoidedTopics, 10)) speechLanguage.avoidedTopics = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.commonMisunderstandings, 10)) speechLanguage.commonMisunderstandings = "";
  const bodyPresence: Record<string, unknown> = {};
  if (includeAllFields || isThinTextValue(character.dossier.bodyPresence.physicalDescription, 12)) bodyPresence.physicalDescription = "";
  if (includeAllFields || isThinTextValue(character.dossier.bodyPresence.build, 6)) bodyPresence.build = "";
  if (includeAllFields || isThinTextValue(character.dossier.bodyPresence.clothingStyle, 8)) bodyPresence.clothingStyle = "";
  if (includeAllFields || isThinTextValue(character.dossier.bodyPresence.grooming, 8)) bodyPresence.grooming = "";
  if (includeAllFields || isThinListValue(character.dossier.bodyPresence.distinguishingFeatures, 1)) bodyPresence.distinguishingFeatures = [];
  if (includeAllFields || isThinTextValue(character.dossier.bodyPresence.posture, 8)) bodyPresence.posture = "";
  if (includeAllFields || isThinTextValue(character.dossier.bodyPresence.movementStyle, 8)) bodyPresence.movementStyle = "";
  if (includeAllFields || isThinTextValue(character.dossier.bodyPresence.eyeContact, 8)) bodyPresence.eyeContact = "";
  if (includeAllFields || isThinListValue(character.dossier.bodyPresence.habitsTics, 1)) bodyPresence.habitsTics = [];
  if (includeAllFields || isThinTextValue(character.dossier.bodyPresence.roomEntry, 10)) bodyPresence.roomEntry = "";
  if (includeAllFields || isThinTextValue(character.dossier.bodyPresence.presenceFeel, 10)) bodyPresence.presenceFeel = "";
  const relationshipDynamics: Record<string, unknown> = {};
  if (includeAllFields || isThinListValue(character.dossier.relationshipDynamics.friends, 1)) relationshipDynamics.friends = [];
  if (includeAllFields || isThinListValue(character.dossier.relationshipDynamics.enemies, 1)) relationshipDynamics.enemies = [];
  if (includeAllFields || isThinListValue(character.dossier.relationshipDynamics.rivals, 1)) relationshipDynamics.rivals = [];
  if (includeAllFields || isThinListValue(character.dossier.relationshipDynamics.loversExes, 1)) relationshipDynamics.loversExes = [];
  if (includeAllFields || isThinListValue(character.dossier.relationshipDynamics.family, 1)) relationshipDynamics.family = [];
  if (includeAllFields || isThinListValue(character.dossier.relationshipDynamics.mentors, 1)) relationshipDynamics.mentors = [];
  if (includeAllFields || isThinListValue(character.dossier.relationshipDynamics.subordinatesSuperiors, 1)) relationshipDynamics.subordinatesSuperiors = [];
  if (includeAllFields || isThinTextValue(character.dossier.relationshipDynamics.trustLevels, 10)) relationshipDynamics.trustLevels = "";
  if (includeAllFields || isThinTextValue(character.dossier.relationshipDynamics.hiddenLoyalties, 10)) relationshipDynamics.hiddenLoyalties = "";
  if (includeAllFields || isThinTextValue(character.dossier.relationshipDynamics.unspokenTensions, 10)) relationshipDynamics.unspokenTensions = "";
  if (includeAllFields || isThinTextValue(character.dossier.relationshipDynamics.powerDynamics, 10)) relationshipDynamics.powerDynamics = "";
  const needsFreeTextCore = !includeAllFields && isThinTextValue(character.dossier.freeTextCore, 180);
  if (
    Object.keys(speechLanguage).length > 0 ||
    Object.keys(bodyPresence).length > 0 ||
    Object.keys(relationshipDynamics).length > 0 ||
    needsFreeTextCore
  ) {
    sections.push({
      label: "voice, body, and relationships",
      maxOutputTokens: 420,
      guidance:
        "Fill the requested voice, dialect, body-language, and relationship fields. Distinguish the character's speech and emotional behavior clearly, and keep the values brief and concrete.",
      shape: {
        dossier: {
          ...(Object.keys(speechLanguage).length > 0 ? { speechLanguage } : {}),
          ...(Object.keys(bodyPresence).length > 0 ? { bodyPresence } : {}),
          ...(Object.keys(relationshipDynamics).length > 0 ? { relationshipDynamics } : {}),
          ...(needsFreeTextCore ? { freeTextCore: "" } : {}),
        },
      },
    });
  }

  if (sections.length === 0) {
    sections.push({
      label: "dossier refresh",
      maxOutputTokens: 280,
      guidance: "Refresh the most useful parts of the dossier while preserving the strong existing canon.",
      shape: {
        summary: "",
        dossier: { freeTextCore: "" },
        currentState: { emotionalState: "" },
      },
    });
  }

  return sections;
}

function mergeCharacterDossierSections(baseDossier: CharacterRecord["dossier"], patch: Record<string, unknown>) {
  const patchDossier = patch.dossier && typeof patch.dossier === "object" ? (patch.dossier as Record<string, unknown>) : {};
  return normalizeCharacterDossier(
    {
      ...baseDossier,
      ...patchDossier,
      basicIdentity: {
        ...baseDossier.basicIdentity,
        ...((patchDossier.basicIdentity as Record<string, unknown> | undefined) ?? {}),
      },
      lifePosition: {
        ...baseDossier.lifePosition,
        ...((patchDossier.lifePosition as Record<string, unknown> | undefined) ?? {}),
      },
      personalityBehavior: {
        ...baseDossier.personalityBehavior,
        ...((patchDossier.personalityBehavior as Record<string, unknown> | undefined) ?? {}),
      },
      motivationStory: {
        ...baseDossier.motivationStory,
        ...((patchDossier.motivationStory as Record<string, unknown> | undefined) ?? {}),
      },
      speechLanguage: {
        ...baseDossier.speechLanguage,
        ...((patchDossier.speechLanguage as Record<string, unknown> | undefined) ?? {}),
      },
      bodyPresence: {
        ...baseDossier.bodyPresence,
        ...((patchDossier.bodyPresence as Record<string, unknown> | undefined) ?? {}),
      },
      relationshipDynamics: {
        ...baseDossier.relationshipDynamics,
        ...((patchDossier.relationshipDynamics as Record<string, unknown> | undefined) ?? {}),
      },
    },
    String((patchDossier.basicIdentity as Record<string, unknown> | undefined)?.fullName ?? baseDossier.basicIdentity.fullName ?? ""),
  );
}

function collectCharacterFieldPaths(shape: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(shape).flatMap(([key, value]) => {
    const nextPath = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(value)) {
      return [nextPath];
    }
    if (value && typeof value === "object") {
      return collectCharacterFieldPaths(value as Record<string, unknown>, nextPath);
    }
    return [nextPath];
  });
}

function extractCharacterShapeValues(source: unknown, shape: Record<string, unknown>): Record<string, unknown> {
  const sourceObject = source && typeof source === "object" ? (source as Record<string, unknown>) : {};
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(shape)) {
    const currentValue = sourceObject[key];
    if (Array.isArray(value)) {
      result[key] = Array.isArray(currentValue) ? currentValue : [];
      continue;
    }
    if (value && typeof value === "object") {
      result[key] = extractCharacterShapeValues(currentValue, value as Record<string, unknown>);
      continue;
    }
    result[key] = currentValue ?? "";
  }

  return result;
}

function collectEmptyCharacterFieldPaths(source: unknown, shape: Record<string, unknown>, prefix = ""): string[] {
  const sourceObject = source && typeof source === "object" ? (source as Record<string, unknown>) : {};
  return Object.entries(shape).flatMap(([key, value]) => {
    const nextPath = prefix ? `${prefix}.${key}` : key;
    const currentValue = sourceObject[key];
    if (Array.isArray(value)) {
      return splitLines(String(Array.isArray(currentValue) ? currentValue.join("|") : currentValue ?? "")).length > 0
        ? []
        : [nextPath];
    }
    if (value && typeof value === "object") {
      return collectEmptyCharacterFieldPaths(currentValue, value as Record<string, unknown>, nextPath);
    }
    return String(currentValue ?? "").trim() ? [] : [nextPath];
  });
}

function setCharacterFieldPath(target: Record<string, unknown>, path: string, value: unknown) {
  const segments = path.split(".");
  let current: Record<string, unknown> = target;
  segments.forEach((segment, index) => {
    if (index === segments.length - 1) {
      current[segment] = value;
      return;
    }
    if (!current[segment] || typeof current[segment] !== "object" || Array.isArray(current[segment])) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  });
}

function inferCharacterEmotionalStateFromRecord(character: CharacterRecord) {
  const explicit = String(character.currentState.emotionalState ?? "").trim();
  if (explicit) {
    return explicit;
  }

  const tendency = String(character.dossier.personalityBehavior.emotionalTendencies ?? "").trim();
  if (tendency) {
    return tendency;
  }

  const shifts = String(character.dossier.speechLanguage.emotionalShifts ?? "").trim();
  if (shifts) {
    return shifts;
  }

  const conflict = String(character.dossier.motivationStory.internalConflict ?? "").trim();
  const fear = String(character.fear ?? character.dossier.personalityBehavior.fearTriggers ?? "").trim();
  const goal = String(character.goal ?? character.dossier.motivationStory.shortTermGoal ?? "").trim();

  if (conflict && fear) {
    return `${conflict}; privately strained by ${fear.toLowerCase()}`;
  }
  if (conflict) {
    return conflict;
  }
  if (fear && goal) {
    return `Driven toward ${goal.toLowerCase()} but anxious about ${fear.toLowerCase()}`;
  }
  if (fear) {
    return `Guarded and pressured by ${fear.toLowerCase()}`;
  }
  if (goal) {
    return `Focused on ${goal.toLowerCase()}`;
  }

  return "";
}

function parseCharacterFieldLines(raw: string, allowedPaths: string[]) {
  const payload: Record<string, unknown> = {};
  const cleanedRaw = raw
    .replace(/```[a-z]*|```/gi, " ")
    .replace(/\r?\n/g, " ")
    .replace(/\s*\.\s*/g, ".")
    .replace(/\s+/g, " ");
  const markers = allowedPaths
    .map((path) => {
      const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = cleanedRaw.match(new RegExp(`${escaped}\\s*(?:::|=>|=)`, "i"));
      if (!match || match.index == null) {
        return null;
      }
      return {
        path,
        index: match.index,
        markerLength: match[0].length,
      };
    })
    .filter((entry): entry is { path: string; index: number; markerLength: number } => Boolean(entry))
    .sort((left, right) => left.index - right.index);

  for (const [index, marker] of markers.entries()) {
    const valueStart = marker.index + marker.markerLength;
    const valueEnd = markers[index + 1]?.index ?? cleanedRaw.length;
    const value = cleanedRaw.slice(valueStart, valueEnd).trim();
    if (!value) {
      continue;
    }
    setCharacterFieldPath(
      payload,
      marker.path,
      CHARACTER_LIST_FIELD_PATHS.has(marker.path) ? splitLines(value.replace(/\s+\w+\.$/, "")) : value,
    );
  }

  return payload;
}

function mergeCharacterAiPayload(
  baseCharacter: CharacterRecord,
  draftPayload: Record<string, unknown>,
  parsed: Record<string, unknown> | null,
  fallbackDossier: string,
) {
  const mergedPayload: Record<string, unknown> = {
    ...draftPayload,
  };
  const baseName = String(draftPayload.name ?? baseCharacter.name ?? "").trim();
  if (baseName) {
    mergedPayload.name = baseName;
  }
  const baseRole = String(draftPayload.role ?? baseCharacter.role ?? "").trim();
  if (baseRole) {
    mergedPayload.role = baseRole;
  }

  if (parsed) {
    for (const fieldKey of ["summary", "role", "goal", "fear", "secret", "wound", "notes"] as const) {
      if (typeof parsed[fieldKey] === "string" && String(parsed[fieldKey]).trim()) {
        mergedPayload[fieldKey] = cleanFieldText(
          fieldKey,
          String(parsed[fieldKey]),
          String((baseCharacter as unknown as Record<string, unknown>)[fieldKey] ?? ""),
        );
      }
    }
    if (parsed.quickProfile && typeof parsed.quickProfile === "object") {
      mergedPayload.quickProfile = normalizeCharacterQuickProfile({
        ...baseCharacter.quickProfile,
        ...(parsed.quickProfile as Record<string, unknown>),
      });
    }
    if (parsed.dossier && typeof parsed.dossier === "object") {
      const nextDossier = parsed.dossier as Record<string, unknown>;
      const cleanedFreeTextCore =
        typeof nextDossier.freeTextCore === "string"
          ? cleanGeneratedText(String(nextDossier.freeTextCore)).trim()
          : "";
      mergedPayload.dossier = mergeCharacterDossierSections(baseCharacter.dossier, {
        dossier: {
          ...nextDossier,
          ...(cleanedFreeTextCore && !looksLikeMetaOutput(cleanedFreeTextCore)
            ? { freeTextCore: cleanedFreeTextCore }
            : {}),
        },
      });
    }
    if (parsed.currentState && typeof parsed.currentState === "object") {
      mergedPayload.currentState = normalizeCharacterState({
        ...baseCharacter.currentState,
        ...(parsed.currentState as Record<string, unknown>),
      });
    }
  } else if (fallbackDossier && !looksLikeMetaOutput(fallbackDossier)) {
    const existingDossier =
      mergedPayload.dossier && typeof mergedPayload.dossier === "object"
        ? mergeCharacterDossierSections(baseCharacter.dossier, {
            dossier: mergedPayload.dossier as Record<string, unknown>,
          })
        : baseCharacter.dossier;
    mergedPayload.dossier = mergeCharacterDossierSections(existingDossier, {
      dossier: {
        freeTextCore: fallbackDossier,
      },
    });
    if (String(mergedPayload.summary ?? baseCharacter.summary ?? "").trim().length < 40) {
      mergedPayload.summary = cleanFieldText(
        "summary",
        fallbackDossier.split(/\n+/)[0] ?? fallbackDossier,
        String(mergedPayload.summary ?? baseCharacter.summary ?? ""),
      );
    }
  }

  if (!String(mergedPayload.role ?? "").trim()) {
    const inferredRole = [
      (mergedPayload.quickProfile as Record<string, unknown> | undefined)?.profession,
      ((mergedPayload.dossier as Record<string, unknown> | undefined)?.lifePosition as Record<string, unknown> | undefined)?.roleTitle,
      ((mergedPayload.dossier as Record<string, unknown> | undefined)?.lifePosition as Record<string, unknown> | undefined)?.profession,
    ]
      .map((entry) => String(entry ?? "").trim())
      .find(Boolean);
    if (inferredRole) {
      mergedPayload.role = inferredRole;
    }
  }

  const previewCharacter = applyCharacterPatch(baseCharacter, mergedPayload);
  const inferredEmotion = inferCharacterEmotionalStateFromRecord(previewCharacter);
  if (inferredEmotion) {
    mergedPayload.currentState = normalizeCharacterState({
      ...previewCharacter.currentState,
      emotionalState: inferredEmotion,
    });
  }

  const nextQuickProfile =
    mergedPayload.quickProfile && typeof mergedPayload.quickProfile === "object"
      ? { ...(mergedPayload.quickProfile as Record<string, unknown>) }
      : {};
  const nextDossier =
    mergedPayload.dossier && typeof mergedPayload.dossier === "object"
      ? mergeCharacterDossierSections(baseCharacter.dossier, { dossier: mergedPayload.dossier as Record<string, unknown> })
      : baseCharacter.dossier;

  if (!String(nextQuickProfile.accent ?? "").trim() && nextDossier.speechLanguage.accent) {
    nextQuickProfile.accent = nextDossier.speechLanguage.accent;
  }
  if (!String(nextQuickProfile.speechPattern ?? "").trim()) {
    const speechPattern =
      nextDossier.speechLanguage.descriptors.join(", ") ||
      nextDossier.speechLanguage.directness ||
      nextDossier.speechLanguage.rhythm;
    if (speechPattern) {
      nextQuickProfile.speechPattern = speechPattern;
    }
  }
  if (Object.keys(nextQuickProfile).length > 0) {
    mergedPayload.quickProfile = normalizeCharacterQuickProfile({
      ...baseCharacter.quickProfile,
      ...nextQuickProfile,
    });
  }

  return mergedPayload;
}

async function generateSinglePlanningFieldValue(options: {
  project: ProjectWorkspace;
  chapter: ProjectWorkspace["chapters"][number];
  fieldKey: AssistFieldKey;
  fieldLabel: string;
  action: Exclude<PlanningAction, "develop"> | "develop";
}) {
  const { project, chapter, fieldKey, fieldLabel, action } = options;
  const currentValue = chapterFieldValue(chapter, fieldKey);
  const context = buildContextPackage(project, chapter.id, currentValue || chapter.draft || chapter.outline);
  const previousChapter = project.chapters.find((entry) => entry.number === chapter.number - 1) ?? null;
  const nextChapter = project.chapters.find((entry) => entry.number === chapter.number + 1) ?? null;
  const fieldSpec = CHAPTER_FIELD_SPECS.find((field) => field.key === fieldKey);
  const thinCurrent = chapterFieldLooksThin(fieldKey, currentValue, chapter.number);
  const prompt = buildPromptEnvelope(
    `Update ${fieldLabel || fieldSpec?.label || fieldKey}`,
    project,
    context,
    [
      `Target area: Story Skeleton -> Chapter Runway -> ${chapter.title || `Chapter ${chapter.number}`} -> ${fieldLabel || fieldKey}.`,
      "Update only this one field. Do not write to notes. Do not write to the manuscript unless the target field is the manuscript.",
      "Use all existing project, series, story-bible, skeleton, chapter, memory, and continuity material as binding canon.",
      "Do not contradict already written or already planned material. Extend, refine, reconcile, or sharpen it.",
      currentValue
        ? "Base the result on what is already written in this exact textbox. Preserve its core idea and improve that existing text instead of wandering away from it."
        : "The textbox is blank, so you may generate the field freely as long as it stays canon-safe.",
      thinCurrent
        ? "The current field value is blank, generic, or placeholder-level. Replace it with specific canon-safe content. Do not repeat the placeholder wording."
        : "Keep the useful core of the current field value, but make it stronger and more specific.",
      chapterFieldInstruction(fieldKey, action),
      fieldSpec ? `Field purpose: ${fieldSpec.description}\nExample shape: ${fieldSpec.example}` : "",
      previousChapter
        ? `Previous chapter context: Chapter ${previousChapter.number} - ${previousChapter.title}. Purpose: ${previousChapter.purpose}`
        : "",
      nextChapter
        ? `Next chapter target: Chapter ${nextChapter.number} - ${nextChapter.title}. Purpose: ${nextChapter.purpose}`
        : "",
      currentValue ? `Current field value:\n${currentValue}` : "Current field value is blank.",
      "Return only the final text to store in this field. No explanations, no labels, no markdown fences.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    "You are a precise outlining and planning partner. Write directly into the target planning field, not around it.",
  );

  const raw = await generateTextWithProvider(prompt, { maxOutputTokens: fieldKey === "outline" ? 1400 : 900 });
  let generated = raw?.trim();
  if (!generated) {
    return null;
  }
  if (fieldKey !== "title" && looksLikeMetaOutput(generated)) {
    generated = await repairMetaOutput({
      project,
      context,
      task: `Repair ${fieldLabel || fieldSpec?.label || fieldKey}`,
      instruction: chapterFieldInstruction(fieldKey, action),
      badOutput: generated,
      roleInstruction: "Return only the corrected field content.",
      maxOutputTokens: fieldKey === "outline" ? 1400 : 900,
    });
  }
  if (fieldKey === "title") {
    const cleanedTitle = cleanTitle(generated, currentValue);
    if (looksLikeWeakTitle(cleanedTitle)) {
      const repairPrompt = buildPromptEnvelope(
        "Repair chapter title",
        project,
        context,
        [
          `Target chapter: Chapter ${chapter.number}.`,
          "The previous result was not a usable chapter title.",
          "Return only a commercially strong chapter title, 2 to 6 words.",
          "No explanation. No reasoning. No labels. No punctuation at the end.",
          `Story premise: ${project.premise}`,
          `Chapter purpose: ${chapter.purpose}`,
          `Chapter outline: ${chapter.outline}`,
          `Rejected result: ${generated}`,
        ].join("\n\n"),
        "Return only the final title.",
      );
      const repaired = await generateTextWithProvider(repairPrompt, { maxOutputTokens: 80 });
      generated = repaired?.trim() || generated;
    }
  }

  return generated;
}

async function generateSingleStoryBibleFieldValue(options: {
  project: ProjectWorkspace;
  entityType: StoryBibleEntityType;
  entity: Record<string, unknown>;
  itemTitle: string;
  fieldKey: string;
  fieldLabel: string;
  action: Exclude<PlanningAction, "develop"> | "develop";
  contextChapterId: string;
}) {
  const { project, entityType, entity, itemTitle, fieldKey, fieldLabel, action, contextChapterId } = options;
  const spec = STORY_BIBLE_ENTITY_SPECS.find((entry) => entry.entityType === entityType);
  const fieldSpec = spec?.fields.find((field) => field.key === fieldKey);
  const currentValue = getEntityValue(entity, fieldKey);
  const context = buildContextPackage(project, contextChapterId, currentValue);
  const thinCurrent = storyBibleFieldLooksThin(fieldKey, currentValue);
  const prompt = buildPromptEnvelope(
    `Update ${spec?.label ?? "Story Bible field"}`,
    project,
    context,
    [
      `Target area: Story Bible -> ${spec?.label ?? "Entry"} -> ${itemTitle || String(entity.name ?? entity.title ?? entity.label ?? "Untitled")} -> ${fieldLabel || fieldKey}.`,
      "Update only this exact field on this exact record.",
      "Use all existing project, series, story-bible, skeleton, chapter, memory, and continuity material as binding canon.",
      "Do not invent contradictions. Improve what already exists and keep it synchronized with the rest of the project.",
      currentValue
        ? "Base the result on what is already written in this exact textbox. Preserve its core idea and improve that existing text instead of drifting into a different record."
        : "The textbox is blank, so you may generate the field freely as long as it stays canon-safe.",
      thinCurrent
        ? "The current field value is blank, generic, or thin. Replace it with specific canon-safe content instead of repeating the placeholder."
        : "Keep the useful core of the current field value, but make it stronger and more specific.",
      action === "expand"
        ? "Expand this field into something fuller, more specific, and more useful."
        : action === "tighten"
          ? "Tighten this field into a shorter, cleaner, sharper version without losing the core idea."
          : "Develop this field so it becomes specific, useful, and canon-safe.",
      fieldSpec ? `Field purpose: ${fieldSpec.description}\nExample shape: ${fieldSpec.example}` : "",
      currentValue ? `Current field value:\n${currentValue}` : "Current field value is blank.",
      "Return only the final value for this field. No commentary, no JSON, no labels.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    "You are a canon-safe story bible editor. Write the exact field value, not notes about it.",
  );

  const raw = await generateTextWithProvider(prompt, { maxOutputTokens: 900 });
  let generated = raw?.trim();
  if (!generated) {
    return null;
  }
  if (looksLikeMetaOutput(generated)) {
    generated = await repairMetaOutput({
      project,
      context,
      task: `Repair ${spec?.label ?? "Story Bible"} field`,
      instruction: [
        `Target area: Story Bible -> ${spec?.label ?? "Entry"} -> ${itemTitle || String(entity.name ?? entity.title ?? entity.label ?? "Untitled")} -> ${fieldLabel || fieldKey}.`,
        "Update only this exact field on this exact record.",
        action === "expand"
          ? "Expand this field into something fuller, more specific, and more useful."
          : action === "tighten"
            ? "Tighten this field into a shorter, cleaner, sharper version without losing the core idea."
            : "Develop this field so it becomes specific, useful, and canon-safe.",
        "Return only the final value for this field.",
      ].join("\n\n"),
      badOutput: generated,
      roleInstruction: "Return only the corrected Story Bible field value.",
      maxOutputTokens: 900,
    });
  }
  return generated;
}

function findStoryBibleEntity(project: ProjectWorkspace, itemId: string): {
  entityType: StoryBibleEntityType;
  entity: Record<string, unknown>;
} | null {
  const groups: Array<[StoryBibleEntityType, Record<string, unknown>[]]> = [
    ["character", project.characters as unknown as Record<string, unknown>[]],
    ["relationship", project.relationships as unknown as Record<string, unknown>[]],
    ["plotThread", project.plotThreads as unknown as Record<string, unknown>[]],
    ["location", project.locations as unknown as Record<string, unknown>[]],
    ["faction", project.factions as unknown as Record<string, unknown>[]],
    ["timelineEvent", project.timelineEvents as unknown as Record<string, unknown>[]],
    ["workingNote", project.workingNotes as unknown as Record<string, unknown>[]],
  ];

  for (const [entityType, entities] of groups) {
    const entity = entities.find((entry) => String(entry.id) === itemId);
    if (entity) {
      return { entityType, entity };
    }
  }

  return null;
}

function lastUsefulChapterId(project: ProjectWorkspace) {
  return (
    project.chapters.findLast((chapter) => chapter.draft.trim() || chapter.outline.trim())?.id ??
    project.chapters.at(0)?.id ??
    null
  );
}

export async function runTargetedPlanningFieldAi(input: {
  projectId: string;
  itemId: string;
  itemTitle: string;
  fieldKey: AssistFieldKey;
  fieldLabel: string;
  action: PlanningAction;
  currentValue?: string;
  draftItem?: Record<string, unknown>;
}) {
  const project = await getProjectWorkspace(input.projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  const chapter = resolveProjectChapter(project, input.itemId);
  if (!chapter) {
    throw new Error("Chapter not found.");
  }

  const workingChapter = mergeDraftIntoChapter(chapter, input.draftItem);
  const currentValue = input.currentValue?.trim()
    ? input.currentValue
    : chapterFieldValue(workingChapter, input.fieldKey);

  const generated = await generateSinglePlanningFieldValue({
    project,
    chapter: workingChapter,
    fieldKey: input.fieldKey,
    fieldLabel: input.fieldLabel,
    action: input.action,
  });
  if (!generated) {
    throw new Error("AI did not return any visible planning text.");
  }

  await updateChapter(chapter.id, {
    ...buildChapterDraftPatchFromRecord(input.draftItem),
    ...normalizeChapterFieldUpdate(input.fieldKey, currentValue, generated),
  });
  const nextProject = (await getProjectWorkspace(input.projectId)) ?? project;
  return {
    project: nextProject,
    contextPackage: null,
  };
}

export async function runTargetedSkeletonFieldAi(input: {
  projectId: string;
  targetEntityType: SkeletonEntityType;
  itemId: string;
  itemTitle: string;
  fieldKey: string;
  fieldLabel: string;
  action: PlanningAction;
  currentValue?: string;
  draftItem?: Record<string, unknown>;
}) {
  const project = await getProjectWorkspace(input.projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  const entity = findSkeletonEntity(project, input.targetEntityType, input.itemId);
  if (!entity) {
    throw new Error(input.targetEntityType === "structureBeat" ? "Structure beat not found." : "Scene card not found.");
  }

  const contextChapterId = lastUsefulChapterId(project);
  if (!contextChapterId) {
    throw new Error("Project has no chapter context yet.");
  }

  const workingEntity = mergeDraftIntoEntity(entity, input.draftItem);
  const currentValue = input.currentValue?.trim() ? input.currentValue : getEntityValue(workingEntity, input.fieldKey);

  const generated = await generateSingleSkeletonFieldValue({
    project,
    targetEntityType: input.targetEntityType,
    entity: workingEntity,
    itemTitle: input.itemTitle,
    fieldKey: input.fieldKey,
    fieldLabel: input.fieldLabel,
    action: input.action,
    contextChapterId,
  });
  if (!generated) {
    throw new Error("AI did not return any visible Story Skeleton text.");
  }

  await mutateSkeleton(
    project.id,
    {
      entityType: input.targetEntityType,
      id: input.itemId,
      payload: {
        ...buildStoryBibleDraftPayload(input.draftItem),
        [input.fieldKey]: normalizeSkeletonFieldValue(input.fieldKey, generated, currentValue),
      },
    },
    "PATCH",
  );

  const nextProject = (await getProjectWorkspace(input.projectId)) ?? project;
  return {
    project: nextProject,
    contextPackage: null,
  };
}

export async function runTargetedStoryBibleFieldAi(input: {
  projectId: string;
  itemId: string;
  itemTitle: string;
  fieldKey: string;
  fieldLabel: string;
  action: PlanningAction;
  currentValue?: string;
  draftItem?: Record<string, unknown>;
}) {
  const project = await getProjectWorkspace(input.projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  const match = findStoryBibleEntity(project, input.itemId);
  if (!match) {
    throw new Error("Story Bible record not found.");
  }

  const contextChapterId = lastUsefulChapterId(project);
  if (!contextChapterId) {
    throw new Error("Project has no chapter context yet.");
  }

  const workingEntity = mergeDraftIntoEntity(match.entity, input.draftItem);
  const currentValue = input.currentValue?.trim()
    ? input.currentValue
    : getEntityValue(workingEntity, input.fieldKey);

  const generated = await generateSingleStoryBibleFieldValue({
    project,
    entityType: match.entityType,
    entity: workingEntity,
    itemTitle: input.itemTitle,
    fieldKey: input.fieldKey,
    fieldLabel: input.fieldLabel,
    action: input.action,
    contextChapterId,
  });
  if (!generated) {
    throw new Error("AI did not return any visible Story Bible text.");
  }

  await mutateStoryBible(
    project.id,
      {
        entityType: match.entityType,
        id: input.itemId,
        payload: {
          ...buildStoryBibleDraftPayload(input.draftItem),
          [input.fieldKey]: normalizeStoryBibleFieldValue(input.fieldKey, generated, currentValue),
        },
      },
    "PATCH",
  );

  const nextProject = (await getProjectWorkspace(input.projectId)) ?? project;
  return {
    project: nextProject,
    contextPackage: null,
  };
}

export async function runTargetedCharacterAi(input: {
  projectId: string;
  characterId: string;
  action: "develop-dossier" | "expand-summary" | "tighten-summary";
  draftCharacter?: Record<string, unknown>;
  instruction?: string;
}) {
  const project = await getProjectWorkspace(input.projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  const character = project.characters.find((entry) => entry.id === input.characterId);
  if (!character) {
    throw new Error("Character not found.");
  }

  const contextChapterId = lastUsefulChapterId(project);
  if (!contextChapterId) {
    throw new Error("Project has no chapter context yet.");
  }

  const workingCharacter = mergeCharacterDraft(character, input.draftCharacter);
  const draftCharacterPayload = buildCharacterDraftPayload(input.draftCharacter);
  const compactCanon = compactCharacterCanon(project, contextChapterId, workingCharacter);
  let nextCharacter = workingCharacter;

  if (input.action !== "develop-dossier") {
    const prompt = [
      "You are a sharp character editor.",
      compactCanon,
      `Target area: Story Bible -> Character Master -> ${workingCharacter.name || "Unnamed character"} -> Summary.`,
      input.action === "expand-summary"
        ? "Expand the summary into a fuller, more specific, more human portrait."
        : "Tighten the summary into a cleaner, shorter, sharper version without losing essential canon.",
      workingCharacter.summary
        ? "Base the result on the exact summary already written in this textbox. Preserve its core idea while improving it."
        : "The summary textbox is blank, so you may draft it freely as long as it stays canon-safe.",
      input.instruction ? `Additional request context:\n${input.instruction}` : "",
      `Current summary:\n${workingCharacter.summary || "(blank)"}`,
      "Return only the final summary text. No labels. No commentary.",
    ]
      .filter(Boolean)
      .join("\n\n");
    const raw = await generateTextWithProvider(prompt, { maxOutputTokens: 260 });
    const summary = raw?.trim();
    if (!summary) {
      throw new Error("AI did not return any visible character summary.");
    }
    await mutateStoryBible(
      project.id,
      {
        entityType: "character",
        id: character.id,
        payload: {
          ...draftCharacterPayload,
          summary: cleanFieldText("summary", summary, workingCharacter.summary),
        },
      },
      "PATCH",
    );
    nextCharacter = applyCharacterPatch(workingCharacter, {
      ...draftCharacterPayload,
      summary: cleanFieldText("summary", summary, workingCharacter.summary),
    });
  } else {
    const sectionPrompts = buildCharacterSectionPrompts(workingCharacter);
    let aggregatePayload: Record<string, unknown> = { ...draftCharacterPayload };
    let fallbackDossier = "";
    const sectionResults = await Promise.all(
      sectionPrompts.map(async (section) => {
        const fieldPaths = collectCharacterFieldPaths(section.shape);
        const sectionCharacter = applyCharacterPatch(workingCharacter, aggregatePayload);
        const sectionSnapshot = {
          name: sectionCharacter.name,
          ...extractCharacterShapeValues(sectionCharacter, section.shape),
        };
        const prompt = [
          "You are a fast character architect.",
          compactCanon,
          `Target area: Story Bible -> Character Master -> ${workingCharacter.name || "Unnamed character"} -> ${section.label}.`,
          "Respect what is already written in the visible character textboxes. Treat those entries as primary canon.",
          "Fill every requested field for this section. When a field already has useful text, preserve its core idea and sharpen it instead of changing it arbitrarily.",
          "Keep values compact, concrete, and immediately usable inside the app.",
          "Use short lists for array fields and short, vivid phrases for string fields.",
          "Do not output commentary.",
          "Every requested field path must appear exactly once in your answer, even if the value is short.",
          "Do not collapse multiple requested fields into one paragraph. Emit one path line per field.",
          "Return exactly one line per requested field using this format: path :: value",
          "For list fields, separate items with | on the same line.",
          input.instruction ? `Additional request context:\n${input.instruction}` : "",
          section.guidance,
          `Requested field paths:\n- ${fieldPaths.join("\n- ")}`,
          `Current values for these fields:\n${JSON.stringify(sectionSnapshot, null, 2)}`,
        ]
          .filter(Boolean)
          .join("\n\n");
        const raw = await generateTextWithProvider(prompt, { maxOutputTokens: section.maxOutputTokens });
        let parsed = raw ? parseCharacterFieldLines(raw, fieldPaths) : null;
        if (!parsed || Object.keys(parsed).length === 0) {
          const repairPrompt = [
            "Repair the character field lines.",
            compactCanon,
            `Target area: Story Bible -> Character Master -> ${workingCharacter.name || "Unnamed character"} -> ${section.label}.`,
            "Return exactly one line per requested field using the format path :: value.",
            "For list fields, separate items with |.",
            `Requested field paths:\n- ${fieldPaths.join("\n- ")}`,
            input.instruction ? `Additional request context:\n${input.instruction}` : "",
            `Rejected answer:\n${raw ?? ""}`,
          ]
            .filter(Boolean)
            .join("\n\n");
          const repaired = await generateTextWithProvider(repairPrompt, { maxOutputTokens: section.maxOutputTokens });
          parsed = repaired ? parseCharacterFieldLines(repaired, fieldPaths) : null;
          return { parsed, raw: repaired ?? raw ?? "" };
        }
        return { parsed, raw: raw ?? "" };
      }),
    );

    for (const result of sectionResults) {
      const resultRaw = cleanGeneratedText(result.raw ?? "").trim();
      if (resultRaw.length > fallbackDossier.length) {
        fallbackDossier = resultRaw;
      }
      aggregatePayload = mergeCharacterAiPayload(
        applyCharacterPatch(workingCharacter, aggregatePayload),
        aggregatePayload,
        result.parsed,
        "",
      );
    }

    const mergedPayload = mergeCharacterAiPayload(
      workingCharacter,
      aggregatePayload,
      null,
      fallbackDossier,
    );
    const previewCharacter = applyCharacterPatch(workingCharacter, mergedPayload);
    const missingPaths = sectionPrompts.flatMap((section) =>
      collectEmptyCharacterFieldPaths(
        {
          summary: previewCharacter.summary,
          role: previewCharacter.role,
          archetype: previewCharacter.archetype,
          goal: previewCharacter.goal,
          fear: previewCharacter.fear,
          secret: previewCharacter.secret,
          wound: previewCharacter.wound,
          notes: previewCharacter.notes,
          quickProfile: previewCharacter.quickProfile,
          dossier: previewCharacter.dossier,
          currentState: previewCharacter.currentState,
        },
        section.shape,
      ),
    );
    if (missingPaths.length > 0) {
      const repairPrompt = [
        "You are repairing a character dossier.",
        compactCanon,
        `Target area: Story Bible -> Character Master -> ${workingCharacter.name || "Unnamed character"} -> missing fields.`,
        "Return exactly one line per requested field using this format: path :: value",
        "For list fields, separate items with | on the same line.",
        "Do not output commentary.",
        "Fill only the missing fields listed below. Keep everything consistent with the current saved character values.",
        input.instruction ? `Additional request context:\n${input.instruction}` : "",
        `Missing field paths:\n- ${missingPaths.join("\n- ")}`,
        `Current character values:\n${JSON.stringify(
          {
            name: previewCharacter.name,
            summary: previewCharacter.summary,
            role: previewCharacter.role,
            archetype: previewCharacter.archetype,
            goal: previewCharacter.goal,
            fear: previewCharacter.fear,
            secret: previewCharacter.secret,
            wound: previewCharacter.wound,
            notes: previewCharacter.notes,
            quickProfile: previewCharacter.quickProfile,
            dossier: previewCharacter.dossier,
            currentState: previewCharacter.currentState,
          },
          null,
          2,
        )}`,
      ]
        .filter(Boolean)
        .join("\n\n");
      const repairRaw = await generateTextWithProvider(repairPrompt, { maxOutputTokens: 280 });
      const repairParsed = repairRaw ? parseCharacterFieldLines(repairRaw, missingPaths) : null;
      if (repairParsed && Object.keys(repairParsed).length > 0) {
        Object.assign(
          mergedPayload,
          mergeCharacterAiPayload(previewCharacter, mergedPayload, repairParsed, ""),
        );
      }
    }
    if (Object.keys(mergedPayload).length === 0) {
      throw new Error("AI did not return usable character dossier content.");
    }
    await mutateStoryBible(
      project.id,
      {
        entityType: "character",
        id: character.id,
        payload: mergedPayload,
      },
      "PATCH",
    );
    nextCharacter = applyCharacterPatch(workingCharacter, mergedPayload);
  }

  let nextProject: ProjectWorkspace;
  try {
    nextProject = (await getProjectWorkspace(input.projectId)) ?? mergeCharacterIntoProject(project, character.id, nextCharacter);
  } catch {
    nextProject = mergeCharacterIntoProject(project, character.id, nextCharacter);
  }
  return {
    project: nextProject,
    contextPackage: null,
  };
}
