import { CHAPTER_FIELD_SPECS, STORY_BIBLE_ENTITY_SPECS } from "@/lib/assistant-site-map";
import { cleanGeneratedText, cleanSummaryText } from "@/lib/ai-output";
import { buildContextPackage } from "@/lib/memory";
import { generateTextWithProvider, interpretCharacterProfile } from "@/lib/openai";
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

const characterArrayPaths = new Set([
  "quirks",
  "tags",
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
]);

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

function setNestedValue(target: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".");
  let cursor = target;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) {
      cursor[part] = value;
      return;
    }
    const next = cursor[part];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  });
}

function buildCharacterAutofillPayload(
  suggestions: Array<{ key: string; value: string }>,
  currentCharacter: CharacterRecord,
) {
  const payload: Record<string, unknown> = {};

  for (const suggestion of suggestions) {
    const key = suggestion.key.trim();
    const value = suggestion.value.trim();
    if (!key || !value) {
      continue;
    }

    setNestedValue(
      payload,
      key,
      characterArrayPaths.has(key) ? splitLines(value) : value,
    );
  }

  const quickProfile = (payload.quickProfile as Record<string, unknown> | undefined) ?? null;
  const dossier = (payload.dossier as Record<string, unknown> | undefined) ?? null;
  const motivationStory =
    dossier && typeof dossier === "object"
      ? ((dossier.motivationStory as Record<string, unknown> | undefined) ?? null)
      : null;

  const inferredProfession =
    (quickProfile && typeof quickProfile.profession === "string" ? String(quickProfile.profession).trim() : "") ||
    currentCharacter.quickProfile.profession.trim() ||
    currentCharacter.dossier.lifePosition.profession.trim() ||
    currentCharacter.role.trim() ||
    "";

  if (!String(payload.role ?? "").trim() && inferredProfession) {
    payload.role = inferredProfession;
  }

  if (!String(payload.goal ?? "").trim() && motivationStory && typeof motivationStory.shortTermGoal === "string") {
    payload.goal = String(motivationStory.shortTermGoal).trim();
  }

  if (inferredProfession) {
    if (!quickProfile || typeof quickProfile !== "object") {
      payload.quickProfile = { profession: inferredProfession };
    } else if (!String(quickProfile.profession ?? "").trim()) {
      quickProfile.profession = inferredProfession;
    }
  }

  return payload;
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
}) {
  const project = await getProjectWorkspace(input.projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  const chapter = resolveProjectChapter(project, input.itemId);
  if (!chapter) {
    throw new Error("Chapter not found.");
  }

  const currentValue =
    chapterListFields.has(input.fieldKey)
      ? (chapter[input.fieldKey] as string[]).join("\n")
      : String(chapter[input.fieldKey] ?? "");
  const context = buildContextPackage(project, chapter.id, currentValue || chapter.draft || chapter.outline);
  const previousChapter = project.chapters.find((entry) => entry.number === chapter.number - 1) ?? null;
  const nextChapter = project.chapters.find((entry) => entry.number === chapter.number + 1) ?? null;
  const fieldSpec = CHAPTER_FIELD_SPECS.find((field) => field.key === input.fieldKey);
  const prompt = buildPromptEnvelope(
    `Update ${input.fieldLabel || fieldSpec?.label || input.fieldKey}`,
    project,
    context,
    [
      `Target area: Story Skeleton -> Chapter Runway -> ${input.itemTitle || chapter.title || `Chapter ${chapter.number}`} -> ${input.fieldLabel || input.fieldKey}.`,
      "Update only this one field. Do not write to notes. Do not write to the manuscript unless the target field is the manuscript.",
      "Use all existing project, series, story-bible, skeleton, chapter, memory, and continuity material as binding canon.",
      "Do not contradict already written or already planned material. Extend, refine, reconcile, or sharpen it.",
      chapterFieldInstruction(input.fieldKey, input.action),
      fieldSpec
        ? `Field purpose: ${fieldSpec.description}\nExample shape: ${fieldSpec.example}`
        : "",
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

  const raw = await generateTextWithProvider(prompt, { maxOutputTokens: input.fieldKey === "outline" ? 1400 : 900 });
  let generated = raw?.trim();
  if (!generated) {
    throw new Error("AI did not return any visible planning text.");
  }

  if (input.fieldKey !== "title" && looksLikeMetaOutput(generated)) {
    generated = await repairMetaOutput({
      project,
      context,
      task: `Repair ${input.fieldLabel || fieldSpec?.label || input.fieldKey}`,
      instruction: chapterFieldInstruction(input.fieldKey, input.action),
      badOutput: generated,
      roleInstruction: "Return only the corrected field content.",
      maxOutputTokens: input.fieldKey === "outline" ? 1400 : 900,
    });
  }

  if (input.fieldKey === "title") {
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

  await updateChapter(chapter.id, normalizeChapterFieldUpdate(input.fieldKey, currentValue, generated));
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
}) {
  const project = await getProjectWorkspace(input.projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  const match = findStoryBibleEntity(project, input.itemId);
  if (!match) {
    throw new Error("Story Bible record not found.");
  }

  const spec = STORY_BIBLE_ENTITY_SPECS.find((entry) => entry.entityType === match.entityType);
  const fieldSpec = spec?.fields.find((field) => field.key === input.fieldKey);
  const contextChapterId = lastUsefulChapterId(project);
  if (!contextChapterId) {
    throw new Error("Project has no chapter context yet.");
  }

  const currentValue = getEntityValue(match.entity, input.fieldKey);
  const context = buildContextPackage(project, contextChapterId, currentValue);
  const prompt = buildPromptEnvelope(
    `Update ${spec?.label ?? "Story Bible field"}`,
    project,
    context,
    [
      `Target area: Story Bible -> ${spec?.label ?? "Entry"} -> ${input.itemTitle || String(match.entity.name ?? match.entity.title ?? match.entity.label ?? "Untitled")} -> ${input.fieldLabel || input.fieldKey}.`,
      "Update only this exact field on this exact record.",
      "Use all existing project, series, story-bible, skeleton, chapter, memory, and continuity material as binding canon.",
      "Do not invent contradictions. Improve what already exists and keep it synchronized with the rest of the project.",
      input.action === "expand"
        ? "Expand this field into something fuller, more specific, and more useful."
        : input.action === "tighten"
          ? "Tighten this field into a shorter, cleaner, sharper version without losing the core idea."
          : "Develop this field so it becomes specific, useful, and canon-safe.",
      fieldSpec
        ? `Field purpose: ${fieldSpec.description}\nExample shape: ${fieldSpec.example}`
        : "",
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
    throw new Error("AI did not return any visible Story Bible text.");
  }

  if (looksLikeMetaOutput(generated)) {
    generated = await repairMetaOutput({
      project,
      context,
      task: `Repair ${spec?.label ?? "Story Bible"} field`,
      instruction: [
        `Target area: Story Bible -> ${spec?.label ?? "Entry"} -> ${input.itemTitle || String(match.entity.name ?? match.entity.title ?? match.entity.label ?? "Untitled")} -> ${input.fieldLabel || input.fieldKey}.`,
        "Update only this exact field on this exact record.",
        input.action === "expand"
          ? "Expand this field into something fuller, more specific, and more useful."
          : input.action === "tighten"
            ? "Tighten this field into a shorter, cleaner, sharper version without losing the core idea."
            : "Develop this field so it becomes specific, useful, and canon-safe.",
        "Return only the final value for this field.",
      ].join("\n\n"),
      badOutput: generated,
      roleInstruction: "Return only the corrected Story Bible field value.",
      maxOutputTokens: 900,
    });
  }

  await mutateStoryBible(
    project.id,
    {
      entityType: match.entityType,
      id: input.itemId,
      payload: {
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

function buildCharacterDevelopPayload(parsed: Record<string, unknown>, fallback: CharacterRecord) {
  const payload: Record<string, unknown> = {};
  if (typeof parsed.summary === "string" && parsed.summary.trim()) {
    payload.summary = cleanFieldText("summary", parsed.summary, fallback.summary);
  }
  if (parsed.quickProfile && typeof parsed.quickProfile === "object") {
    payload.quickProfile = parsed.quickProfile;
  }
  if (parsed.dossier && typeof parsed.dossier === "object") {
    payload.dossier = parsed.dossier;
  }
  if (parsed.currentState && typeof parsed.currentState === "object") {
    payload.currentState = parsed.currentState;
  }
  return payload;
}

export async function runTargetedCharacterAi(input: {
  projectId: string;
  characterId: string;
  action: "develop-dossier" | "expand-summary" | "tighten-summary";
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

  const context = buildContextPackage(project, contextChapterId, character.summary || character.dossier.freeTextCore);

  if (input.action !== "develop-dossier") {
    const prompt = buildPromptEnvelope(
      "Update character summary",
      project,
      context,
      [
        `Target area: Story Bible -> Character Master -> ${character.name} -> Summary.`,
        "Update only the character summary.",
        "Use all existing manuscript, planning, series, and story-bible context as binding canon.",
        input.action === "expand-summary"
          ? "Expand the summary into a fuller, more specific, more human portrait."
          : "Tighten the summary into a cleaner, shorter, sharper version without losing essential canon.",
        `Current summary:\n${character.summary || "(blank)"}`,
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
          summary: cleanFieldText("summary", summary, character.summary),
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
        `Target area: Story Bible -> Character Master -> ${character.name}.`,
        "Deepen the character into a fuller, more human, more specific canon-safe dossier.",
        "Use the manuscript, chapter plans, story bible, memory, continuity, and series context as binding source of truth.",
        "Do not rewrite other characters. Do not return commentary about what you are doing.",
        "Write a rich internal character dossier in plain prose.",
        "Include background, present pressure, goals, fear, wound, loyalties, contradictions, voice habits, and the current emotional state.",
        "Return only the dossier prose.",
        "Current character snapshot:",
        JSON.stringify(
          {
            name: character.name,
            role: character.role,
            archetype: character.archetype,
            summary: character.summary,
            quickProfile: character.quickProfile,
            dossier: character.dossier,
            currentState: character.currentState,
          },
          null,
            2,
          ),
        ].join("\n\n"),
      "You are a character architect. Return only the character dossier prose for the exact target character.",
    );
    const raw = await generateTextWithProvider(prompt, { maxOutputTokens: 1800 });
    const developedDossier = cleanGeneratedText(raw ?? "").trim();
    if (!developedDossier) {
      throw new Error("AI did not return usable character dossier prose.");
    }
    await mutateStoryBible(
      project.id,
      {
        entityType: "character",
        id: character.id,
        payload: {
          dossier: {
            ...character.dossier,
            freeTextCore: developedDossier,
          },
        },
      },
      "PATCH",
    );
    const refreshedProject = (await getProjectWorkspace(input.projectId)) ?? project;
    const refreshedCharacter =
      refreshedProject.characters.find((entry) => entry.id === character.id) ?? character;
    const quickProfilePrompt = buildPromptEnvelope(
      "Extract quick character profile",
      refreshedProject,
      context,
      [
        `Character: ${character.name}.`,
        "Return strict JSON only.",
        '{"age":"","profession":"","placeOfLiving":"","accent":"","speechPattern":""}',
        "Fill the fields from the dossier and project context. Leave a field blank only if the canon truly does not support a reasonable answer.",
        `Dossier prose:\n${developedDossier}`,
      ].join("\n\n"),
      "Return only JSON for the quick profile.",
    );
    const quickProfileRaw = await generateTextWithProvider(quickProfilePrompt, { maxOutputTokens: 220 });
    const quickProfileParsed = quickProfileRaw ? parseJsonObject(quickProfileRaw) : null;
    const currentStatePrompt = buildPromptEnvelope(
      "Extract current character state",
      refreshedProject,
      context,
      [
        `Character: ${character.name}.`,
        "Return strict JSON only.",
        '{"currentKnowledge":"","unknowns":"","emotionalState":"","physicalCondition":"","loyalties":"","recentChanges":"","continuityRisks":"","lastMeaningfulAppearance":""}',
        "Infer the current state from the dossier and current project canon. Keep it concise and specific.",
        `Dossier prose:\n${developedDossier}`,
      ].join("\n\n"),
      "Return only JSON for the current state.",
    );
    const currentStateRaw = await generateTextWithProvider(currentStatePrompt, { maxOutputTokens: 320 });
    const currentStateParsed = currentStateRaw ? parseJsonObject(currentStateRaw) : null;
    const suggestions = await interpretCharacterProfile(project.id, character.id);
    const autofillPayload = buildCharacterAutofillPayload(suggestions, refreshedCharacter);
    const payload: Record<string, unknown> = {
      dossier: {
        ...refreshedCharacter.dossier,
        freeTextCore: developedDossier,
      },
    };
    if (quickProfileParsed) {
      payload.quickProfile = quickProfileParsed;
    }
    if (currentStateParsed) {
      payload.currentState = currentStateParsed;
    }
    if (String(refreshedCharacter.summary ?? "").trim().length < 40) {
      payload.summary = cleanFieldText("summary", developedDossier.split(/\n+/)[0] ?? developedDossier, refreshedCharacter.summary);
    }
    const mergedPayload: Record<string, unknown> = {
      ...autofillPayload,
      ...payload,
      quickProfile: {
        ...((autofillPayload.quickProfile as Record<string, unknown> | undefined) ?? {}),
        ...((payload.quickProfile as Record<string, unknown> | undefined) ?? {}),
      },
      dossier: {
        ...((autofillPayload.dossier as Record<string, unknown> | undefined) ?? {}),
        ...((payload.dossier as Record<string, unknown> | undefined) ?? {}),
      },
      currentState: {
        ...((autofillPayload.currentState as Record<string, unknown> | undefined) ?? {}),
        ...((payload.currentState as Record<string, unknown> | undefined) ?? {}),
      },
    };
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
