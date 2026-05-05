import { CHAPTER_FIELD_SPECS, STORY_BIBLE_ENTITY_SPECS } from "@/lib/assistant-site-map";
import { cleanGeneratedText, cleanSummaryText } from "@/lib/ai-output";
import { buildContextPackage } from "@/lib/memory";
import { generateTextWithProvider } from "@/lib/openai";
import { getProjectWorkspace } from "@/lib/project-data";
import { buildPromptEnvelope } from "@/lib/prompt-templates";
import { mutateStoryBible, updateChapter } from "@/lib/story-service";
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

const chapterListFields = new Set<AssistFieldKey>([
  "keyBeats",
  "requiredInclusions",
  "forbiddenElements",
  "sceneList",
]);

function splitLines(value: string) {
  return value
    .split(/\r?\n|,/)
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

function parseJsonObject(raw: string) {
  const trimmed = raw.replace(/```json|```/gi, "").trim();
  const candidates = [trimmed];
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    candidates.push(trimmed.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      continue;
    }
  }

  return null;
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

  return {
    ...character,
    ...buildCharacterDraftPayload(draftCharacter),
  } as CharacterRecord;
}

function characterJsonNeedsRepair(parsed: Record<string, unknown> | null) {
  if (!parsed) {
    return true;
  }

  const dossier = parsed.dossier;
  if (dossier && typeof dossier === "object") {
    const freeTextCore = String((dossier as Record<string, unknown>).freeTextCore ?? "").trim();
    if (freeTextCore && looksLikeMetaOutput(freeTextCore)) {
      return true;
    }
  }

  return false;
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
    contextPackage: buildContextPackage(nextProject, chapter.id),
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
    contextPackage: buildContextPackage(nextProject, contextChapterId),
  };
}

export async function runTargetedCharacterAi(input: {
  projectId: string;
  characterId: string;
  action: "develop-dossier" | "expand-summary" | "tighten-summary";
  draftCharacter?: Record<string, unknown>;
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
  const context = buildContextPackage(
    project,
    contextChapterId,
    workingCharacter.summary || workingCharacter.dossier.freeTextCore || workingCharacter.notes,
  );

  if (input.action !== "develop-dossier") {
    const prompt = buildPromptEnvelope(
      "Update character summary",
      project,
      context,
      [
        `Target area: Story Bible -> Character Master -> ${workingCharacter.name} -> Summary.`,
        "Update only the character summary.",
        "Use all existing manuscript, planning, series, and story-bible context as binding canon.",
        input.action === "expand-summary"
          ? "Expand the summary into a fuller, more specific, more human portrait."
          : "Tighten the summary into a cleaner, shorter, sharper version without losing essential canon.",
        workingCharacter.summary
          ? "Base the result on the exact summary already written in this textbox. Preserve its core idea while improving it."
          : "The summary textbox is blank, so you may draft it freely as long as it stays canon-safe.",
        `Current summary:\n${workingCharacter.summary || "(blank)"}`,
        "Return only the final summary text.",
      ].join("\n\n"),
      "You are a sharp character editor. Return only the revised summary.",
    );
    const raw = await generateTextWithProvider(prompt, { maxOutputTokens: 700 });
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
  } else {
    const prompt = buildPromptEnvelope(
      "Develop character dossier",
      project,
      context,
      [
        `Target area: Story Bible -> Character Master -> ${workingCharacter.name}.`,
        "Deepen the character into a fuller, more human, more specific canon-safe dossier.",
        "Use the manuscript, chapter plans, story bible, memory, continuity, and series context as binding source of truth.",
        "Respect what is already written in the character textboxes. Treat those existing entries as the primary source of truth for this character.",
        "If a field already has useful content, preserve its core idea and sharpen it only when needed. Fill blanks and thin areas instead of overwriting solid existing material.",
        "Do not rewrite other characters. Do not return commentary about what you are doing.",
        "Return strict JSON only with this shape:",
        '{"summary":"","role":"","goal":"","fear":"","secret":"","wound":"","notes":"","quickProfile":{"age":"","profession":"","placeOfLiving":"","accent":"","speechPattern":""},"dossier":{"freeTextCore":""},"currentState":{"currentKnowledge":"","unknowns":"","emotionalState":"","physicalCondition":"","loyalties":"","recentChanges":"","continuityRisks":"","lastMeaningfulAppearance":""}}',
        "Only fill fields you can support from the current textboxes plus project canon. Leave a field as its current value if it is already good.",
        "Current character snapshot:",
        JSON.stringify(
          {
            name: workingCharacter.name,
            role: workingCharacter.role,
            archetype: workingCharacter.archetype,
            summary: workingCharacter.summary,
            goal: workingCharacter.goal,
            fear: workingCharacter.fear,
            secret: workingCharacter.secret,
            wound: workingCharacter.wound,
            notes: workingCharacter.notes,
            quickProfile: workingCharacter.quickProfile,
            dossier: workingCharacter.dossier,
            currentState: workingCharacter.currentState,
          },
          null,
          2,
        ),
        ].join("\n\n"),
      "You are a character architect. Return only strict JSON for the exact target character.",
    );
    const raw = await generateTextWithProvider(prompt, { maxOutputTokens: 950 });
    let parsed = raw ? parseJsonObject(raw) : null;
    if (characterJsonNeedsRepair(parsed)) {
      const repairPrompt = buildPromptEnvelope(
        "Repair character dossier JSON",
        project,
        context,
        [
          `Target area: Story Bible -> Character Master -> ${workingCharacter.name}.`,
          "Your previous answer was not valid strict JSON for this character dossier update.",
          "Return strict JSON only with this exact shape:",
          '{"summary":"","role":"","goal":"","fear":"","secret":"","wound":"","notes":"","quickProfile":{"age":"","profession":"","placeOfLiving":"","accent":"","speechPattern":""},"dossier":{"freeTextCore":""},"currentState":{"currentKnowledge":"","unknowns":"","emotionalState":"","physicalCondition":"","loyalties":"","recentChanges":"","continuityRisks":"","lastMeaningfulAppearance":""}}',
          "Respect the existing textbox content as primary canon. Preserve strong existing entries. Fill blank or thin entries only when project canon supports them.",
          "Do not explain. Do not preface. Do not include markdown fences.",
          `Rejected answer:\n${raw ?? ""}`,
          `Current character snapshot:\n${JSON.stringify(
            {
              name: workingCharacter.name,
              role: workingCharacter.role,
              summary: workingCharacter.summary,
              goal: workingCharacter.goal,
              fear: workingCharacter.fear,
              secret: workingCharacter.secret,
              wound: workingCharacter.wound,
              notes: workingCharacter.notes,
              quickProfile: workingCharacter.quickProfile,
              dossier: workingCharacter.dossier,
              currentState: workingCharacter.currentState,
            },
            null,
            2,
          )}`,
        ].join("\n\n"),
        "Return only strict JSON for the exact target character.",
      );
      const repaired = await generateTextWithProvider(repairPrompt, { maxOutputTokens: 850 });
      parsed = repaired ? parseJsonObject(repaired) : null;
    }
    const fallbackDossier = cleanGeneratedText(raw ?? "").trim();
    const mergedPayload: Record<string, unknown> = {
      ...draftCharacterPayload,
    };
    if (parsed) {
      for (const fieldKey of ["summary", "role", "goal", "fear", "secret", "wound", "notes"] as const) {
        if (typeof parsed[fieldKey] === "string" && String(parsed[fieldKey]).trim()) {
          mergedPayload[fieldKey] = cleanFieldText(fieldKey, String(parsed[fieldKey]), String((workingCharacter as unknown as Record<string, unknown>)[fieldKey] ?? ""));
        }
      }
      if (parsed.quickProfile && typeof parsed.quickProfile === "object") {
        mergedPayload.quickProfile = {
          ...workingCharacter.quickProfile,
          ...(parsed.quickProfile as Record<string, unknown>),
        };
      }
      if (parsed.dossier && typeof parsed.dossier === "object") {
        const nextDossier = parsed.dossier as Record<string, unknown>;
        const cleanedFreeTextCore = typeof nextDossier.freeTextCore === "string"
          ? cleanGeneratedText(String(nextDossier.freeTextCore)).trim()
          : "";
        mergedPayload.dossier = {
          ...workingCharacter.dossier,
          ...nextDossier,
          ...(cleanedFreeTextCore && !looksLikeMetaOutput(cleanedFreeTextCore)
            ? { freeTextCore: cleanedFreeTextCore }
            : {}),
        };
      }
      if (parsed.currentState && typeof parsed.currentState === "object") {
        mergedPayload.currentState = {
          ...workingCharacter.currentState,
          ...(parsed.currentState as Record<string, unknown>),
        };
      }
    } else if (fallbackDossier && !looksLikeMetaOutput(fallbackDossier)) {
      mergedPayload.dossier = {
        ...workingCharacter.dossier,
        freeTextCore: fallbackDossier,
      };
      if (String(workingCharacter.summary ?? "").trim().length < 40) {
        mergedPayload.summary = cleanFieldText(
          "summary",
          fallbackDossier.split(/\n+/)[0] ?? fallbackDossier,
          workingCharacter.summary,
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
  }

  const nextProject = (await getProjectWorkspace(input.projectId)) ?? project;
  return {
    project: nextProject,
    contextPackage: buildContextPackage(nextProject, contextChapterId),
  };
}
