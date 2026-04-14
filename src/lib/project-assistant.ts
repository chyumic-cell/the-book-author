import {
  BOOK_SETUP_FIELD_SPECS,
  CHAPTER_FIELD_SPECS,
  STYLE_PROFILE_FIELD_SPECS,
  STORY_BIBLE_ENTITY_SPECS,
  buildAssistantRoutingGuide,
  buildAssistantSiteMap,
} from "@/lib/assistant-site-map";
import { APP_NAME } from "@/lib/brand";
import { buildContextPackage } from "@/lib/memory";
import { cleanGeneratedText, cleanSummaryText, sanitizeManuscriptText } from "@/lib/ai-output";
import { generateTextWithProvider } from "@/lib/openai";
import { buildPromptEnvelope } from "@/lib/prompt-templates";
import { getChapterById, getProjectWorkspace } from "@/lib/project-data";
import { syncChapterToStoryState } from "@/lib/story-sync";
import { mutateIdeaLab, mutateSkeleton, mutateStoryBible, updateChapter, updateProject } from "@/lib/story-service";
import type {
  AiRole,
  AssistFieldKey,
  BookSettingsRecord,
  ContextPackage,
  ProjectChatActionRecord,
  ProjectChatScope,
  ProjectWorkspace,
  StoryForgeTab,
  StyleProfileRecord,
} from "@/types/storyforge";

type AssistantActionKind = ProjectChatActionRecord["kind"];
type AssistantStoryBibleEntityType =
  | "character"
  | "relationship"
  | "plotThread"
  | "location"
  | "faction"
  | "timelineEvent";
type AssistantBookSetupFieldKey = keyof BookSettingsRecord;
type AssistantStyleFieldKey = keyof StyleProfileRecord;

type AssistantPlanAction = {
  kind: AssistantActionKind;
  title?: string;
  content?: string;
  chapterId?: string;
  chapterNumber?: number;
  fieldKey?: AssistFieldKey;
  structureType?: string;
  sceneGoal?: string;
  sceneConflict?: string;
  sceneOutcome?: string;
  outcomeType?: string;
  locationHint?: string;
  summary?: string;
  payload?: Record<string, unknown>;
  entityType?: AssistantStoryBibleEntityType;
  entityId?: string;
  entityMatch?: string;
};

type AssistantPlan = {
  reply: string;
  actions: AssistantPlanAction[];
  nextTab: StoryForgeTab | null;
};

function normalizeScope(scope: ProjectChatScope) {
  return scope === "AUTO" ? "PROJECT" : scope;
}

function truncateText(value: string, maxLength: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength)}...`;
}

function fieldLabel(fieldKey: AssistFieldKey) {
  switch (fieldKey) {
    case "title":
      return "chapter title";
    case "purpose":
      return "chapter purpose";
    case "currentBeat":
      return "current beat";
    case "keyBeats":
      return "key beats";
    case "requiredInclusions":
      return "required inclusions";
    case "forbiddenElements":
      return "forbidden elements";
    case "desiredMood":
      return "desired mood";
    case "sceneList":
      return "scene list";
    case "outline":
      return "chapter outline";
    case "draft":
      return "manuscript";
    case "notes":
      return "chapter notes";
    default:
      return "chapter field";
  }
}

function summarizeProject(project: ProjectWorkspace, chapterId: string | null) {
  const chapter = getChapterById(project, chapterId);

  return {
    title: project.title,
    premise: project.premise,
    storyBrief: project.bookSettings.storyBrief,
    plotDirection: project.bookSettings.plotDirection,
    activeChapter: chapter
      ? {
          id: chapter.id,
          number: chapter.number,
          title: chapter.title,
          purpose: chapter.purpose,
          currentBeat: chapter.currentBeat,
          targetWordCount: chapter.targetWordCount,
          desiredMood: chapter.desiredMood,
          outline: truncateText(chapter.outline, 700),
          draftExcerpt: truncateText(chapter.draft, 900),
          notesExcerpt: truncateText(chapter.notes, 360),
          wordCount: chapter.wordCount,
        }
      : null,
    chapters: project.chapters.slice(0, 40).map((entry) => ({
      id: entry.id,
      number: entry.number,
      title: entry.title,
      purpose: truncateText(entry.purpose, 180),
      currentBeat: truncateText(entry.currentBeat, 140),
      targetWordCount: entry.targetWordCount,
      desiredMood: entry.desiredMood,
      outlineExcerpt: truncateText(entry.outline, 220),
      wordCount: entry.wordCount,
      status: entry.status,
      latestSummary: truncateText(entry.summaries[0]?.summary ?? "", 160),
    })),
    plotThreads: project.plotThreads.slice(0, 3).map((thread) => ({
      title: thread.title,
      summary: thread.summary,
      payoff: thread.promisedPayoff,
    })),
    structureBeats: project.structureBeats.slice(0, 4).map((beat) => ({
      type: beat.type,
      label: beat.label,
      description: beat.description,
    })),
    ideaEntries: project.ideaEntries.slice(0, 3).map((idea) => ({
      title: idea.title,
      type: idea.type,
    })),
    characters: project.characters.slice(0, 8).map((entry) => ({
      name: entry.name,
      role: entry.role,
      summary: truncateText(entry.summary, 120),
    })),
  };
}

function buildAssistantCanonSnapshot(project: ProjectWorkspace, chapterId: string | null) {
  const contextChapterId = resolveContextChapterId(project, chapterId);
  if (!contextChapterId) {
    return {
      projectCore: {
        title: project.title,
        premise: truncateText(project.premise, 220),
        oneLineHook: truncateText(project.oneLineHook, 160),
      },
      bookSetup: {
        genre: project.bookSettings.genre,
        tone: project.bookSettings.tone,
        audience: project.bookSettings.audience,
        pointOfView: project.bookSettings.pointOfView,
        tense: project.bookSettings.tense,
        storyBrief: truncateText(project.bookSettings.storyBrief, 260),
        plotDirection: truncateText(project.bookSettings.plotDirection, 260),
        pacingNotes: truncateText(project.bookSettings.pacingNotes, 180),
        targetChapterLength: project.bookSettings.targetChapterLength,
        targetBookLength: project.bookSettings.targetBookLength,
        themes: project.bookSettings.themes.slice(0, 6),
        comparableTitles: project.bookSettings.comparableTitles.slice(0, 5),
      },
      styleProfile: {
        guidanceIntensity: project.styleProfile.guidanceIntensity,
        proseDensity: project.styleProfile.proseDensity,
        pacing: project.styleProfile.pacing,
        darkness: project.styleProfile.darkness,
        romanceIntensity: project.styleProfile.romanceIntensity,
        humorLevel: project.styleProfile.humorLevel,
        actionFrequency: project.styleProfile.actionFrequency,
        mysteryDensity: project.styleProfile.mysteryDensity,
        dialogueDescriptionRatio: project.styleProfile.dialogueDescriptionRatio,
        literaryCommercialBalance: project.styleProfile.literaryCommercialBalance,
        aestheticGuide: truncateText(project.styleProfile.aestheticGuide, 180),
        styleGuide: truncateText(project.styleProfile.styleGuide, 220),
        voiceRules: project.styleProfile.voiceRules.slice(0, 8),
      },
      series: project.bookSettings.seriesName || null,
      storyBible: [],
      skeleton: [],
      memory: [],
      continuity: [],
    };
  }

  const context = buildContextPackage(project, contextChapterId);
  return {
    projectCore: {
      title: project.title,
      premise: truncateText(project.premise, 220),
      oneLineHook: truncateText(project.oneLineHook, 160),
    },
    bookSetup: {
      genre: project.bookSettings.genre,
      tone: project.bookSettings.tone,
      audience: project.bookSettings.audience,
      pointOfView: project.bookSettings.pointOfView,
      tense: project.bookSettings.tense,
      storyBrief: truncateText(project.bookSettings.storyBrief, 260),
      plotDirection: truncateText(project.bookSettings.plotDirection, 260),
      pacingNotes: truncateText(project.bookSettings.pacingNotes, 180),
      targetChapterLength: project.bookSettings.targetChapterLength,
      targetBookLength: project.bookSettings.targetBookLength,
      themes: project.bookSettings.themes.slice(0, 6),
      comparableTitles: project.bookSettings.comparableTitles.slice(0, 5),
    },
    styleProfile: {
      guidanceIntensity: project.styleProfile.guidanceIntensity,
      proseDensity: project.styleProfile.proseDensity,
      pacing: project.styleProfile.pacing,
      darkness: project.styleProfile.darkness,
      romanceIntensity: project.styleProfile.romanceIntensity,
      humorLevel: project.styleProfile.humorLevel,
      actionFrequency: project.styleProfile.actionFrequency,
      mysteryDensity: project.styleProfile.mysteryDensity,
      dialogueDescriptionRatio: project.styleProfile.dialogueDescriptionRatio,
      literaryCommercialBalance: project.styleProfile.literaryCommercialBalance,
      aestheticGuide: truncateText(project.styleProfile.aestheticGuide, 180),
      styleGuide: truncateText(project.styleProfile.styleGuide, 220),
      voiceRules: project.styleProfile.voiceRules.slice(0, 8),
    },
    activeChapterId: contextChapterId,
    chapterBlueprint: context.chapterBlueprint.slice(0, 8),
    seriesCanon: context.seriesContext.slice(0, 6),
    storyBibleCanon: context.storyBibleContext.slice(0, 8),
    dialogueVoiceCanon: context.dialogueVoiceContext.slice(0, 6),
    skeletonCanon: context.storySkeletonContext.slice(0, 8),
    longTermMemory: context.relevantLongTermMemory.slice(0, 6).map((item) => ({
      title: item.title,
      content: truncateText(item.content, 180),
    })),
    shortTermMemory: context.recentShortTermMemory.slice(0, 5).map((item) => ({
      title: item.title,
      content: truncateText(item.content, 160),
    })),
    activePlotThreads: context.activePlotThreads.slice(0, 5).map((thread) => ({
      title: thread.title,
      summary: truncateText(thread.summary, 160),
      payoff: truncateText(thread.promisedPayoff ?? "", 120),
    })),
    continuityConstraints: context.continuityConstraints.slice(0, 6).map((issue) => ({
      title: issue.title,
      description: truncateText(issue.description, 170),
    })),
  };
}

function escapeJsonBlock(value: string) {
  return value.replace(/```json|```/gi, "").trim();
}

function parsePlan(raw: string): AssistantPlan | null {
  const trimmed = escapeJsonBlock(raw);
  const candidates = [trimmed];
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    candidates.push(trimmed.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Partial<AssistantPlan>;
      if (typeof parsed.reply === "string" && Array.isArray(parsed.actions)) {
        return {
          reply: parsed.reply,
          actions: parsed.actions as AssistantPlanAction[],
          nextTab: (parsed.nextTab as StoryForgeTab | null | undefined) ?? null,
        };
      }
    } catch {
      continue;
    }
  }

  return null;
}

function parseJsonObject(raw: string) {
  const trimmed = escapeJsonBlock(raw);
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

function resolveContextChapterId(project: ProjectWorkspace, preferredChapterId?: string | null) {
  if (preferredChapterId) {
    const chapter = getChapterById(project, preferredChapterId);
    if (chapter) {
      return chapter.id;
    }
  }

  return project.chapters[0]?.id ?? null;
}

function inferStructureType(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("opening")) {
    return "OPENING_DISTURBANCE";
  }
  if (lower.includes("first doorway")) {
    return "FIRST_DOORWAY";
  }
  if (lower.includes("midpoint")) {
    return "MIDPOINT";
  }
  if (lower.includes("second doorway")) {
    return "SECOND_DOORWAY";
  }
  if (lower.includes("climax")) {
    return "CLIMAX";
  }
  if (lower.includes("resolution")) {
    return "RESOLUTION";
  }

  return "MIDPOINT";
}

const validActionKinds = new Set<AssistantActionKind>([
  "CREATE_IDEA_ENTRY",
  "CREATE_WORKING_NOTE",
  "CREATE_STRUCTURE_BEAT",
  "CREATE_SCENE_CARD",
  "APPEND_CHAPTER_NOTES",
  "APPEND_CHAPTER_DRAFT",
  "UPDATE_CHAPTER_FIELD",
  "APPEND_CHAPTER_FIELD",
  "UPDATE_CHAPTER_PURPOSE",
  "UPDATE_BOOK_SETUP",
  "UPDATE_STYLE_PROFILE",
  "UPSERT_STORY_BIBLE_ENTITY",
  "UPDATE_PLOT_DIRECTION",
  "UPDATE_STORY_BRIEF",
]);

const outlinePlanningFieldKeys = new Set<AssistFieldKey>([
  "title",
  "purpose",
  "currentBeat",
  "outline",
  "keyBeats",
  "requiredInclusions",
  "forbiddenElements",
  "desiredMood",
  "sceneList",
]);

const BOOK_SETUP_ARRAY_FIELDS = new Set<AssistantBookSetupFieldKey>(["themes", "comparableTitles"]);
const BOOK_SETUP_NUMBER_FIELDS = new Set<AssistantBookSetupFieldKey>([
  "seriesOrder",
  "targetChapterLength",
  "targetBookLength",
  "romanceLevel",
  "darknessLevel",
]);
const STYLE_PROFILE_NUMBER_FIELDS = new Set<AssistantStyleFieldKey>([
  "proseDensity",
  "pacing",
  "darkness",
  "romanceIntensity",
  "humorLevel",
  "actionFrequency",
  "mysteryDensity",
  "dialogueDescriptionRatio",
  "literaryCommercialBalance",
]);
const STYLE_PROFILE_ARRAY_FIELDS = new Set<AssistantStyleFieldKey>(["voiceRules"]);
const BOOK_SETUP_FIELD_KEYS = new Set<AssistantBookSetupFieldKey>(
  BOOK_SETUP_FIELD_SPECS.map((field) => field.key as AssistantBookSetupFieldKey),
);
const STYLE_PROFILE_FIELD_KEYS = new Set<AssistantStyleFieldKey>(
  STYLE_PROFILE_FIELD_SPECS.map((field) => field.key as AssistantStyleFieldKey),
);
const STORY_BIBLE_ENTITY_TYPES = new Set<AssistantStoryBibleEntityType>(
  STORY_BIBLE_ENTITY_SPECS.map((entity) => entity.entityType),
);

const CHAPTER_LIST_FIELDS = new Set<AssistFieldKey>([
  "keyBeats",
  "requiredInclusions",
  "forbiddenElements",
  "sceneList",
]);

const chapterPlanningFieldKeys = new Set<AssistFieldKey>([
  "title",
  "purpose",
  "currentBeat",
  "keyBeats",
  "requiredInclusions",
  "forbiddenElements",
  "desiredMood",
  "sceneList",
  "outline",
]);

type AssistantIntent = {
  wantsOutline: boolean;
  wantsTitles: boolean;
  wantsPurpose: boolean;
  wantsCurrentBeat: boolean;
  wantsKeyBeats: boolean;
  wantsSceneList: boolean;
  wantsRequiredInclusions: boolean;
  wantsForbiddenElements: boolean;
  wantsDesiredMood: boolean;
  wantsNotes: boolean;
  wantsDraft: boolean;
  wantsStoryBrief: boolean;
  wantsPlotDirection: boolean;
  wantsAllChapters: boolean;
  wantsBookSetup: boolean;
  wantsStyleProfile: boolean;
  wantsStoryBible: boolean;
  wantsCharacterWork: boolean;
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function cleanPlanText(value: string | undefined) {
  return value ? normalizeWhitespace(value) : "";
}

function resolveActionChapter(
  project: ProjectWorkspace,
  action: Pick<AssistantPlanAction, "chapterId" | "chapterNumber">,
  fallbackChapterId?: string | null,
) {
  return (
    (action.chapterId ? getChapterById(project, action.chapterId) : null) ??
    (typeof action.chapterNumber === "number"
      ? project.chapters.find((chapter) => chapter.number === action.chapterNumber) ?? null
      : null) ??
    (fallbackChapterId ? getChapterById(project, fallbackChapterId) : null)
  );
}

function actionTargetsChapter(
  action: Pick<AssistantPlanAction, "chapterId" | "chapterNumber">,
  chapter: ProjectWorkspace["chapters"][number],
) {
  return action.chapterId === chapter.id || action.chapterNumber === chapter.number;
}

function shouldGenerateActionContent(action: AssistantPlanAction, message: string, minimumLength = 12) {
  const content = action.content?.trim() ?? "";
  const fieldKey = action.fieldKey ?? (action.kind === "APPEND_CHAPTER_DRAFT" ? "draft" : undefined);
  return (
    !content ||
    content.length < minimumLength ||
    content.toLowerCase() === message.trim().toLowerCase() ||
    looksLikeRawInstruction(content, message) ||
    (fieldKey ? looksLikeWeakChapterFieldValue(fieldKey, content) : false)
  );
}

function cleanTitleText(value: string, fallback = "") {
  const firstLine =
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => Boolean(line) && !line.startsWith("{") && !line.startsWith("[")) ?? "";
  const cleaned = firstLine
    .replace(/^(?:chapter\s+title|title)\s*:\s*/i, "")
    .replace(/^chapter\s+\d+\s*[:.\-–—]?\s*/i, "")
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "")
    .trim();

  return cleaned || fallback.trim();
}

function cleanShortFieldText(fieldKey: AssistFieldKey, value: string, fallback = "") {
  const cleaned = cleanSummaryText(value)
    .replace(new RegExp(`^${fieldLabel(fieldKey).replace(/\s+/g, "\\s+")}\\s*:\\s*`, "i"), "")
    .replace(/^(?:summary|purpose|beat|mood)\s*:\s*/i, "")
    .trim();

  return cleaned || fallback.trim();
}

function cleanOutlineText(value: string, fallback = "") {
  const cleaned = cleanGeneratedText(value)
    .replace(/^(?:chapter\s+\d+\s*)?outline\s*:\s*/i, "")
    .trim();

  return cleaned || fallback.trim();
}

function countStructuredLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
    .filter(Boolean).length;
}

function looksLikeWeakTitle(value: string) {
  const stripped = value
    .split(/\r?\n/)[0]
    ?.replace(/^(?:chapter\s+title|title)\s*:\s*/i, "")
    .replace(/^chapter\s+\d+\s*[:.\-–—]?\s*/i, "")
    .replace(/^(?:act|part|section|book)\s+(?:[ivxlcdm]+|\d+)\s*[:.\-–—]?\s*/i, "")
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "")
    .trim();

  if (!stripped) {
    return true;
  }

  if (
    /^chapter\s+\d+$/i.test(stripped) ||
    /^(?:untitled|new title|title|placeholder)$/i.test(stripped) ||
    /^(?:act|part|section|book)\b/i.test(stripped)
  ) {
    return true;
  }

  return stripped.length < 3;
}

function looksLikeWeakChapterFieldValue(fieldKey: AssistFieldKey, value: string) {
  switch (fieldKey) {
    case "title":
      return looksLikeWeakTitle(value);
    case "outline":
      return cleanOutlineText(value).trim().length < 80 || countStructuredLines(value) < 4;
    case "purpose":
    case "currentBeat":
      return cleanShortFieldText(fieldKey, value).trim().length < 18;
    case "desiredMood":
      return cleanShortFieldText(fieldKey, value).trim().length < 6;
    case "sceneList":
    case "keyBeats":
    case "requiredInclusions":
    case "forbiddenElements":
      return cleanStringList(value).length < 2;
    default:
      return false;
  }
}

function cleanChapterFieldContent(
  project: ProjectWorkspace,
  chapter: ProjectWorkspace["chapters"][number],
  fieldKey: AssistFieldKey,
  value: string,
  fallback = "",
) {
  switch (fieldKey) {
    case "title":
      return cleanTitleText(value, fallback);
    case "purpose":
    case "currentBeat":
    case "desiredMood":
      return cleanShortFieldText(fieldKey, value, fallback);
    case "outline":
      return cleanOutlineText(value, fallback);
    case "draft":
      return sanitizeManuscriptText(value, {
        chapterTitle: chapter.title,
        chapterNumber: chapter.number,
        previousChapterDrafts: project.chapters
          .filter((entry) => entry.number < chapter.number)
          .map((entry) => entry.draft)
          .filter(Boolean),
      }).text;
    default:
      return cleanGeneratedText(value).trim() || fallback.trim();
  }
}

function structuredFieldValueToText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => structuredFieldValueToText(entry))
      .filter(Boolean)
      .join("\n");
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => {
        const nested = structuredFieldValueToText(entry);
        if (!nested) {
          return "";
        }

        return Array.isArray(entry) || (entry && typeof entry === "object") ? `${key}: ${nested}` : nested;
      })
      .filter(Boolean)
      .join("\n");
  }

  return value == null ? "" : String(value).trim();
}

function cleanStringList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry).trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\n|,/)
      .map((entry) => entry.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
      .filter(Boolean);
  }

  return [];
}

function coerceNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }

  return null;
}

function normalizeBookSetupPayload(
  payload: Record<string, unknown> | undefined,
  current: BookSettingsRecord,
): Partial<BookSettingsRecord> {
  if (!payload) {
    return {};
  }

  const next: Partial<BookSettingsRecord> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!BOOK_SETUP_FIELD_KEYS.has(key as AssistantBookSetupFieldKey)) {
      continue;
    }

    const typedKey = key as AssistantBookSetupFieldKey;
    if (BOOK_SETUP_ARRAY_FIELDS.has(typedKey)) {
      next[typedKey] = cleanStringList(value) as never;
      continue;
    }

    if (BOOK_SETUP_NUMBER_FIELDS.has(typedKey)) {
      const numeric = coerceNumber(value);
      if (typedKey === "seriesOrder") {
        next.seriesOrder = numeric;
      } else if (numeric !== null) {
        next[typedKey] = numeric as never;
      }
      continue;
    }

    if (typedKey === "authorName" || typedKey === "seriesName") {
      next[typedKey] = String(value ?? "").trim() as never;
      continue;
    }

    const text = structuredFieldValueToText(value);
    next[typedKey] = (text || current[typedKey] || "") as never;
  }

  return next;
}

function normalizeStyleProfilePayload(
  payload: Record<string, unknown> | undefined,
  current: StyleProfileRecord,
): Partial<StyleProfileRecord> {
  if (!payload) {
    return {};
  }

  const next: Partial<StyleProfileRecord> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!STYLE_PROFILE_FIELD_KEYS.has(key as AssistantStyleFieldKey)) {
      continue;
    }

    const typedKey = key as AssistantStyleFieldKey;
    if (STYLE_PROFILE_ARRAY_FIELDS.has(typedKey)) {
      next[typedKey] = cleanStringList(value) as never;
      continue;
    }

    if (STYLE_PROFILE_NUMBER_FIELDS.has(typedKey)) {
      const numeric = coerceNumber(value);
      if (numeric !== null) {
        next[typedKey] = Math.max(0, Math.min(10, numeric)) as never;
      }
      continue;
    }

    if (typedKey === "guidanceIntensity") {
      const normalized = String(value ?? "").trim().toUpperCase();
      if (normalized === "LIGHT" || normalized === "STRONG" || normalized === "AGGRESSIVE") {
        next.guidanceIntensity = normalized;
      }
      continue;
    }

    const text = structuredFieldValueToText(value);
    next[typedKey] = (text || current[typedKey] || "") as never;
  }

  return next;
}

function payloadHasKeys(payload: Record<string, unknown> | undefined, keys: readonly string[]) {
  if (!payload) {
    return false;
  }

  return keys.some((key) => {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value.some((entry) => String(entry ?? "").trim());
    }

    if (value && typeof value === "object") {
      return !payloadLooksEmpty(value as Record<string, unknown>);
    }

    return Boolean(String(value ?? "").trim());
  });
}

function payloadLooksEmpty(payload: Record<string, unknown> | undefined): boolean {
  if (!payload) {
    return true;
  }

  const values = Object.values(payload);
  return values.length === 0 || values.every((value) => {
    if (Array.isArray(value)) {
      return value.length === 0 || value.every((entry) => !String(entry ?? "").trim());
    }

    if (value && typeof value === "object") {
      return payloadLooksEmpty(value as Record<string, unknown>);
    }

    return !String(value ?? "").trim();
  });
}

function cleanTextPayloadValue(value: unknown) {
  if (Array.isArray(value)) {
    return cleanStringList(value);
  }

  if (value && typeof value === "object") {
    return value;
  }

  return cleanGeneratedText(String(value ?? "").trim());
}

function cleanStoryBiblePayload(
  payload: Record<string, unknown> | undefined,
  entityType: AssistantStoryBibleEntityType,
) {
  if (!payload) {
    return {};
  }

  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) {
      continue;
    }

    if (entityType === "relationship" && (key === "sourceCharacterId" || key === "targetCharacterId")) {
      next[key] = String(value ?? "").trim();
      continue;
    }

    if (key === "tags" || key === "quirks" || key === "coreTraits" || key === "virtues" || key === "flaws") {
      next[key] = cleanStringList(value);
      continue;
    }

    next[key] = cleanTextPayloadValue(value);
  }

  return next;
}

function inferAssistantIntent(message: string, scope: ProjectChatScope): AssistantIntent {
  const lower = message.toLowerCase();
  const explicitlyRejectsNotes =
    /(?:do not|don't|not|instead of|rather than)[^.]{0,40}\bnotes?\b/.test(lower) ||
    /(?:don'?t|do not)\s+write[^.]{0,40}\bnotes?\b/.test(lower);
  const wantsBookSetup =
    scope === "PROJECT" ||
    lower.includes("book setup") ||
    lower.includes("author name") ||
    lower.includes("series name") ||
    lower.includes("book number in series") ||
    lower.includes("story brief") ||
    lower.includes("plot direction") ||
    lower.includes("genre") ||
    lower.includes("audience") ||
    lower.includes("point of view") ||
    lower.includes("prose style") ||
    lower.includes("pacing notes") ||
    lower.includes("comparable titles") ||
    lower.includes("target book length") ||
    lower.includes("target chapter length") ||
    lower.includes("themes");
  const wantsStyleProfile =
    lower.includes("style guide") ||
    lower.includes("voice rules") ||
    lower.includes("aesthetic guide") ||
    lower.includes("prose density") ||
    lower.includes("dialogue / description") ||
    lower.includes("dialogue description") ||
    lower.includes("literary / commercial") ||
    lower.includes("guidance intensity") ||
    lower.includes("pacing") ||
    lower.includes("darkness") ||
    lower.includes("romance intensity") ||
    lower.includes("humor level") ||
    lower.includes("action frequency") ||
    lower.includes("mystery density");
  const wantsStoryBible =
    scope === "STORY_BIBLE" ||
    lower.includes("story bible") ||
    lower.includes("character dossier") ||
    lower.includes("character master") ||
    lower.includes("character") ||
    lower.includes("plot thread") ||
    lower.includes("location") ||
    lower.includes("faction") ||
    lower.includes("timeline");

  return {
    wantsOutline:
      lower.includes("outline") ||
      lower.includes("outlines") ||
      lower.includes("plot summary") ||
      lower.includes("plot summaries") ||
      lower.includes("chapter summary") ||
      lower.includes("chapter summaries") ||
      lower.includes("synopsis") ||
      lower.includes("beat sheet") ||
      lower.includes("plan out"),
    wantsTitles:
      lower.includes("chapter title") ||
      lower.includes("chapter titles") ||
      lower.includes("chapter name") ||
      lower.includes("chapter names") ||
      lower.includes("give each chapter a name") ||
      lower.includes("give each chapter a strong title") ||
      (lower.includes("title") && lower.includes("each chapter")) ||
      (lower.includes("title") && lower.includes("all chapters")),
    wantsCurrentBeat:
      lower.includes("current beat") ||
      lower.includes("current beats") ||
      lower.includes("chapter beat") ||
      lower.includes("chapter beats"),
    wantsKeyBeats:
      lower.includes("key beats") ||
      lower.includes("major beats") ||
      lower.includes("big beats"),
    wantsSceneList:
      lower.includes("scene list") ||
      lower.includes("scene lists") ||
      lower.includes("scene-by-scene") ||
      lower.includes("scene by scene"),
    wantsRequiredInclusions:
      lower.includes("required inclusions") ||
      lower.includes("must include") ||
      lower.includes("need to include"),
    wantsForbiddenElements:
      lower.includes("forbidden elements") ||
      lower.includes("must not include") ||
      lower.includes("avoid in this chapter"),
    wantsDesiredMood:
      lower.includes("desired mood") ||
      lower.includes("chapter mood"),
    wantsPurpose:
      lower.includes("purpose") ||
      lower.includes("plot summary") ||
      lower.includes("plot summaries") ||
      lower.includes("chapter summary") ||
      lower.includes("chapter summaries") ||
      lower.includes("what each chapter should do") ||
      lower.includes("what this chapter should do"),
    wantsNotes:
      !explicitlyRejectsNotes &&
      (lower.includes("note") ||
        lower.includes("notes") ||
        lower.includes("remember this") ||
        lower.includes("save this")),
    wantsDraft:
      lower.includes("manuscript") ||
      lower.includes("draft") ||
      lower.includes("write the chapter") ||
      lower.includes("write prose") ||
      lower.includes("write the scene"),
    wantsStoryBrief: lower.includes("story brief"),
    wantsPlotDirection: lower.includes("plot direction"),
    wantsAllChapters:
      lower.includes("all chapters") ||
      lower.includes("each chapter") ||
      lower.includes("every chapter") ||
      (scope === "SKELETON" &&
        (lower.includes("chapter outlines") ||
          lower.includes("the chapters") ||
          lower.includes("give them an outline") ||
          lower.includes("plan them out"))),
    wantsBookSetup,
    wantsStyleProfile,
    wantsStoryBible,
    wantsCharacterWork:
      lower.includes("character dossier") ||
      lower.includes("character master") ||
      lower.includes("speech pattern") ||
      lower.includes("voice profile") ||
      lower.includes("motivation") ||
      lower.includes("relationship"),
  };
}

function looksLikeRawInstruction(content: string, message: string) {
  const cleanedContent = normalizeWhitespace(content).toLowerCase();
  const cleanedMessage = normalizeWhitespace(message).toLowerCase();
  if (!cleanedContent) {
    return true;
  }

  return (
    cleanedContent === cleanedMessage ||
    cleanedContent.includes(cleanedMessage) ||
    cleanedMessage.includes(cleanedContent)
  );
}

function findStoryBibleEntity(
  project: ProjectWorkspace,
  entityType: AssistantStoryBibleEntityType,
  entityId?: string,
  entityMatch?: string,
  payload?: Record<string, unknown>,
) {
  const normalizedMatch = (entityMatch ?? "").trim().toLowerCase();
  const payloadName = typeof payload?.name === "string" ? payload.name.trim().toLowerCase() : "";
  const payloadTitle = typeof payload?.title === "string" ? payload.title.trim().toLowerCase() : "";
  const payloadLabel = typeof payload?.label === "string" ? payload.label.trim().toLowerCase() : "";

  if (entityType === "character") {
    return (
      (entityId ? project.characters.find((entry) => entry.id === entityId) : null) ??
      (normalizedMatch
        ? project.characters.find((entry) => entry.name.trim().toLowerCase() === normalizedMatch) ?? null
        : null) ??
      (payloadName ? project.characters.find((entry) => entry.name.trim().toLowerCase() === payloadName) ?? null : null)
    );
  }

  if (entityType === "plotThread") {
    return (
      (entityId ? project.plotThreads.find((entry) => entry.id === entityId) : null) ??
      (normalizedMatch
        ? project.plotThreads.find((entry) => entry.title.trim().toLowerCase() === normalizedMatch) ?? null
        : null) ??
      (payloadTitle ? project.plotThreads.find((entry) => entry.title.trim().toLowerCase() === payloadTitle) ?? null : null)
    );
  }

  if (entityType === "location") {
    return (
      (entityId ? project.locations.find((entry) => entry.id === entityId) : null) ??
      (normalizedMatch
        ? project.locations.find((entry) => entry.name.trim().toLowerCase() === normalizedMatch) ?? null
        : null) ??
      (payloadName ? project.locations.find((entry) => entry.name.trim().toLowerCase() === payloadName) ?? null : null)
    );
  }

  if (entityType === "faction") {
    return (
      (entityId ? project.factions.find((entry) => entry.id === entityId) : null) ??
      (normalizedMatch
        ? project.factions.find((entry) => entry.name.trim().toLowerCase() === normalizedMatch) ?? null
        : null) ??
      (payloadName ? project.factions.find((entry) => entry.name.trim().toLowerCase() === payloadName) ?? null : null)
    );
  }

  if (entityType === "timelineEvent") {
    return (
      (entityId ? project.timelineEvents.find((entry) => entry.id === entityId) : null) ??
      (normalizedMatch
        ? project.timelineEvents.find((entry) => entry.label.trim().toLowerCase() === normalizedMatch) ?? null
        : null) ??
      (payloadLabel ? project.timelineEvents.find((entry) => entry.label.trim().toLowerCase() === payloadLabel) ?? null : null)
    );
  }

  if (entityType === "relationship") {
    return (
      (entityId ? project.relationships.find((entry) => entry.id === entityId) : null) ??
      (normalizedMatch
        ? project.relationships.find((entry) => {
            const relationshipKey = `${entry.sourceCharacterName} ${entry.targetCharacterName} ${entry.kind}`.toLowerCase();
            return relationshipKey.includes(normalizedMatch);
          }) ?? null
        : null)
    );
  }

  return null;
}

function storyBibleTargetLabel(entityType: AssistantStoryBibleEntityType, entity: unknown, payload?: Record<string, unknown>) {
  if (entityType === "character") {
    const name =
      (entity && typeof entity === "object" && "name" in entity ? String((entity as { name?: unknown }).name ?? "") : "") ||
      String(payload?.name ?? "").trim();
    return name ? `Character: ${name}` : "Story bible character";
  }

  if (entityType === "plotThread") {
    const title =
      (entity && typeof entity === "object" && "title" in entity ? String((entity as { title?: unknown }).title ?? "") : "") ||
      String(payload?.title ?? "").trim();
    return title ? `Plot thread: ${title}` : "Story bible plot thread";
  }

  if (entityType === "location") {
    const name =
      (entity && typeof entity === "object" && "name" in entity ? String((entity as { name?: unknown }).name ?? "") : "") ||
      String(payload?.name ?? "").trim();
    return name ? `Location: ${name}` : "Story bible location";
  }

  if (entityType === "faction") {
    const name =
      (entity && typeof entity === "object" && "name" in entity ? String((entity as { name?: unknown }).name ?? "") : "") ||
      String(payload?.name ?? "").trim();
    return name ? `Faction: ${name}` : "Story bible faction";
  }

  if (entityType === "timelineEvent") {
    const label =
      (entity && typeof entity === "object" && "label" in entity ? String((entity as { label?: unknown }).label ?? "") : "") ||
      String(payload?.label ?? "").trim();
    return label ? `Timeline: ${label}` : "Story bible timeline";
  }

  return "Relationship";
}

function resolveCharacterIdByName(project: ProjectWorkspace, value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }

  return (
    project.characters.find(
      (character) =>
        character.id === value ||
        character.name.trim().toLowerCase() === normalized,
    )?.id ?? String(value ?? "").trim()
  );
}

function extractNamedEntityLabel(message: string) {
  const patterns = [
    /(?:named|called)\s+["“]?([A-Z][A-Za-z0-9'’ -]{1,80})["”]?/i,
    /(?:character|location|faction|thread|event)\s+["“]?([A-Z][A-Za-z0-9'’ -]{1,80})["”]?/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      return match[1].trim().replace(/[.,;:!?]+$/, "");
    }
  }

  return "";
}

function cleanExtractedEntityLabel(value: string) {
  return value
    .replace(/^["“'`]+|["”'`]+$/g, "")
    .replace(/[.,;:!?]+$/, "")
    .split(/\s+(?:and|with|who|that|which|where|plus|as)\b/i)[0]
    .trim();
}

function extractEntityLabelFromMessage(message: string, entityType: AssistantStoryBibleEntityType) {
  const patternsByType: Record<AssistantStoryBibleEntityType, RegExp[]> = {
    character: [
      /character(?:\s+entry)?\s+(?:named|called)\s+["“]?([^"\n]{2,100})["”]?/i,
      /(?:named|called)\s+["“]?([^"\n]{2,100})["”]?\s+(?:as\s+)?a\s+character/i,
    ],
    relationship: [
      /relationship(?:\s+entry)?\s+(?:named|called)\s+["“]?([^"\n]{2,100})["”]?/i,
    ],
    plotThread: [
      /(?:plot\s+thread|thread|arc)(?:\s+entry)?\s+(?:named|called)\s+["“]?([^"\n]{2,100})["”]?/i,
      /(?:named|called)\s+["“]?([^"\n]{2,100})["”]?\s+(?:as\s+)?a\s+(?:plot\s+thread|thread|arc)/i,
    ],
    location: [
      /(?:location|place)(?:\s+entry)?\s+(?:named|called)\s+["“]?([^"\n]{2,100})["”]?/i,
      /(?:named|called)\s+["“]?([^"\n]{2,100})["”]?\s+(?:as\s+)?a\s+(?:location|place)/i,
    ],
    faction: [
      /faction(?:\s+entry)?\s+(?:named|called)\s+["“]?([^"\n]{2,100})["”]?/i,
      /(?:named|called)\s+["“]?([^"\n]{2,100})["”]?\s+(?:as\s+)?a\s+faction/i,
    ],
    timelineEvent: [
      /(?:timeline\s+event|event)(?:\s+entry)?\s+(?:named|called)\s+["“]?([^"\n]{2,100})["”]?/i,
      /(?:named|called)\s+["“]?([^"\n]{2,100})["”]?\s+(?:as\s+)?a\s+(?:timeline\s+event|event)/i,
    ],
  };

  for (const pattern of patternsByType[entityType]) {
    const match = message.match(pattern);
    if (match?.[1]) {
      const cleaned = cleanExtractedEntityLabel(match[1]);
      if (cleaned) {
        return cleaned;
      }
    }
  }

  const lowerMessage = message.toLowerCase();
  const prefix =
    entityType === "character"
      ? "character "
      : entityType === "location"
        ? "location "
        : entityType === "faction"
          ? "faction "
          : entityType === "plotThread"
            ? "plot thread "
            : entityType === "timelineEvent"
              ? "event "
              : "";
  if (prefix) {
    const prefixIndex = lowerMessage.indexOf(prefix);
    if (prefixIndex >= 0) {
      const afterPrefix = message.slice(prefixIndex + prefix.length);
      const simpleLabel = cleanExtractedEntityLabel(afterPrefix);
      if (simpleLabel) {
        return simpleLabel;
      }
    }
  }

  return extractNamedEntityLabel(message);
}

function getStoryBibleIdentityField(entityType: AssistantStoryBibleEntityType) {
  switch (entityType) {
    case "character":
    case "location":
    case "faction":
      return "name";
    case "plotThread":
      return "title";
    case "timelineEvent":
      return "label";
    default:
      return null;
  }
}

function ensureStoryBibleIdentityValue(
  entityType: AssistantStoryBibleEntityType,
  payload: Record<string, unknown>,
  label: string,
  existingEntity?: Record<string, unknown> | null,
) {
  const identityField = getStoryBibleIdentityField(entityType);
  if (!identityField) {
    return payload;
  }

  const next = { ...payload };
  const currentValue = String(next[identityField] ?? "").trim();
  const currentLooksPlaceholder =
    !currentValue ||
    /^new\s+(?:character|location|faction|plot thread|timeline event)$/i.test(currentValue) ||
    /^untitled$/i.test(currentValue);
  const fallbackValue =
    (!currentLooksPlaceholder ? currentValue : "") ||
    label.trim() ||
    String(existingEntity?.[identityField] ?? "").trim() ||
    (identityField === "name" ? String(existingEntity?.name ?? "").trim() : "");

  if (fallbackValue) {
    next[identityField] = fallbackValue;
  }

  return next;
}

function buildEmergencyPlanningFallback(
  chapter: ProjectWorkspace["chapters"][number],
  fieldKey: AssistFieldKey,
) {
  if (fieldKey === "outline") {
    const purpose = cleanShortFieldText("purpose", chapter.purpose, "Push the story into a stronger next movement.");
    const beat = cleanShortFieldText("currentBeat", chapter.currentBeat, "Fresh pressure enters the chapter.");
    return [
      `1. Open with immediate pressure around ${beat.toLowerCase()}.`,
      `2. Clarify the chapter objective: ${purpose}.`,
      "3. Introduce resistance that complicates the plan instead of simply slowing it down.",
      "4. Force a sharper choice, revelation, or setback that changes the chapter's direction.",
      "5. Escalate the cost so the chapter cannot end where it began.",
      "6. Close on a concrete turn, unanswered pressure point, or cliff-edge carry-forward.",
    ].join("\n");
  }

  if (fieldKey === "currentBeat") {
    return chapter.currentBeat.trim() || "Pressure rises and the chapter's objective starts to shift.";
  }

  if (fieldKey === "purpose") {
    return chapter.purpose.trim() || "Advance the next major movement of the story while increasing pressure and consequence.";
  }

  if (fieldKey === "title") {
    return chapter.title.trim() && !/^chapter\s+\d+$/i.test(chapter.title.trim())
      ? chapter.title.trim()
      : `The ${chapter.number === 1 ? "Opening Breach" : `Turning Point ${chapter.number}`}`;
  }

  return "";
}

function planClearlyNeedsWritableActions(input: {
  message: string;
  scope: ProjectChatScope;
  applyChanges: boolean;
  intent: AssistantIntent;
}) {
  if (!input.applyChanges) {
    return false;
  }

  if (input.scope !== "AUTO") {
    return true;
  }

  if (
    input.intent.wantsAllChapters ||
    input.intent.wantsOutline ||
    input.intent.wantsTitles ||
    input.intent.wantsPurpose ||
    input.intent.wantsDraft ||
    input.intent.wantsNotes ||
    input.intent.wantsBookSetup ||
    input.intent.wantsStyleProfile ||
    input.intent.wantsStoryBible
  ) {
    return true;
  }

  return /\b(add|apply|build|change|create|draft|expand|fill|generate|give|improve|outline|plan|rewrite|set|update|write)\b/i.test(
    input.message,
  );
}

function planHasChapterFieldAction(plan: AssistantPlan, fieldKey: AssistFieldKey) {
  return plan.actions.some(
    (action) => action.kind === "UPDATE_CHAPTER_FIELD" && action.fieldKey === fieldKey,
  );
}

function getRequestedPlanningFieldKeys(intent: AssistantIntent, scope: ProjectChatScope) {
  const fields = new Set<AssistFieldKey>();

  if (intent.wantsTitles) fields.add("title");
  if (intent.wantsPurpose) fields.add("purpose");
  if (intent.wantsCurrentBeat) fields.add("currentBeat");
  if (intent.wantsKeyBeats) fields.add("keyBeats");
  if (intent.wantsRequiredInclusions) fields.add("requiredInclusions");
  if (intent.wantsForbiddenElements) fields.add("forbiddenElements");
  if (intent.wantsDesiredMood) fields.add("desiredMood");
  if (intent.wantsSceneList) fields.add("sceneList");
  if (intent.wantsOutline) fields.add("outline");

  if (fields.size === 0 && scope === "SKELETON" && intent.wantsAllChapters) {
    fields.add("title");
    fields.add("purpose");
    fields.add("currentBeat");
    fields.add("outline");
  }

  return fields;
}

function livePlanNeedsFallback(input: {
  message: string;
  scope: ProjectChatScope;
  applyChanges: boolean;
  intent: AssistantIntent;
  livePlan: AssistantPlan | null;
}) {
  const { livePlan } = input;
  if (!livePlan) {
    return true;
  }

  if (!planClearlyNeedsWritableActions(input)) {
    return false;
  }

  if (livePlan.actions.length === 0) {
    return true;
  }

  const needsPlanningFields =
    input.scope === "SKELETON" ||
    input.intent.wantsAllChapters ||
    input.intent.wantsOutline ||
    input.intent.wantsTitles ||
    input.intent.wantsPurpose ||
    input.intent.wantsCurrentBeat ||
    input.intent.wantsSceneList ||
    input.intent.wantsKeyBeats ||
    input.intent.wantsRequiredInclusions ||
    input.intent.wantsForbiddenElements ||
    input.intent.wantsDesiredMood;

  if (
    needsPlanningFields &&
    !livePlan.actions.some(
      (action) =>
        action.kind === "UPDATE_CHAPTER_FIELD" &&
        !!action.fieldKey &&
        chapterPlanningFieldKeys.has(action.fieldKey),
    )
  ) {
    return true;
  }

  if (input.intent.wantsTitles && !planHasChapterFieldAction(livePlan, "title")) {
    return true;
  }

  if (input.intent.wantsOutline && !planHasChapterFieldAction(livePlan, "outline")) {
    return true;
  }

  if (input.intent.wantsPurpose && !planHasChapterFieldAction(livePlan, "purpose")) {
    return true;
  }

  if (input.intent.wantsCurrentBeat && !planHasChapterFieldAction(livePlan, "currentBeat")) {
    return true;
  }

  if (input.intent.wantsSceneList && !planHasChapterFieldAction(livePlan, "sceneList")) {
    return true;
  }

  if (input.intent.wantsKeyBeats && !planHasChapterFieldAction(livePlan, "keyBeats")) {
    return true;
  }

  if (input.intent.wantsRequiredInclusions && !planHasChapterFieldAction(livePlan, "requiredInclusions")) {
    return true;
  }

  if (input.intent.wantsForbiddenElements && !planHasChapterFieldAction(livePlan, "forbiddenElements")) {
    return true;
  }

  if (input.intent.wantsDesiredMood && !planHasChapterFieldAction(livePlan, "desiredMood")) {
    return true;
  }

  if (
    (input.scope === "STORY_BIBLE" || input.intent.wantsStoryBible) &&
    !livePlan.actions.some((action) => action.kind === "UPSERT_STORY_BIBLE_ENTITY")
  ) {
    return true;
  }

  if (input.intent.wantsBookSetup && !livePlan.actions.some((action) => action.kind === "UPDATE_BOOK_SETUP")) {
    return true;
  }

  if (input.intent.wantsStyleProfile && !livePlan.actions.some((action) => action.kind === "UPDATE_STYLE_PROFILE")) {
    return true;
  }

  return false;
}

function buildAssistantActionExamples() {
  return [
    "Examples:",
    '- User: "Go to the story skeleton and give each chapter a title and outline."',
    '  Good actions: [{"kind":"UPDATE_CHAPTER_FIELD","chapterNumber":1,"fieldKey":"title","content":""},{"kind":"UPDATE_CHAPTER_FIELD","chapterNumber":1,"fieldKey":"outline","content":""},{"kind":"UPDATE_CHAPTER_FIELD","chapterNumber":2,"fieldKey":"title","content":""},{"kind":"UPDATE_CHAPTER_FIELD","chapterNumber":2,"fieldKey":"outline","content":""}]',
    '- User: "In the story bible create a location called Black Weir and a character called Mara Vale."',
    '  Good actions: [{"kind":"UPSERT_STORY_BIBLE_ENTITY","entityType":"location","entityMatch":"Black Weir","payload":{}},{"kind":"UPSERT_STORY_BIBLE_ENTITY","entityType":"character","entityMatch":"Mara Vale","payload":{}}]',
    '- User: "Update the Book Setup story brief and plot direction."',
    '  Good actions: [{"kind":"UPDATE_BOOK_SETUP","payload":{"storyBrief":"","plotDirection":""}}]',
    '- User: "Raise the prose density and rewrite the voice rules."',
    '  Good actions: [{"kind":"UPDATE_STYLE_PROFILE","payload":{"proseDensity":null,"voiceRules":[]}}]',
    '- User: "Rewrite the manuscript in the selected chapter so it opens with a stronger hook."',
    '  Good actions: [{"kind":"UPDATE_CHAPTER_FIELD","fieldKey":"draft","chapterId":"selected-chapter-id","content":""}]',
  ].join("\n");
}

function sanitizePlanActions(input: {
  actions: AssistantPlanAction[];
  message: string;
  scope: ProjectChatScope;
  applyChanges: boolean;
  project: ProjectWorkspace;
}) {
  if (!input.applyChanges) {
    return [];
  }

  const intent = inferAssistantIntent(input.message, input.scope);
  const requestedPlanningFields = getRequestedPlanningFieldKeys(intent, input.scope);
  const allowsSkeletonObjects = /structure beat|scene card|midpoint|first doorway|second doorway|opening disturbance|climax|resolution/.test(
    input.message.toLowerCase(),
  );
  const cleaned = input.actions
    .filter((action): action is AssistantPlanAction => validActionKinds.has(action.kind))
    .map((action) => {
      const normalizedAction =
        action.kind === "UPDATE_CHAPTER_PURPOSE"
          ? { ...action, kind: "UPDATE_CHAPTER_FIELD" as const, fieldKey: "purpose" as const }
          : action;
      const shouldDeferFieldWriting =
        normalizedAction.kind === "UPDATE_CHAPTER_FIELD" &&
        normalizedAction.fieldKey &&
        chapterPlanningFieldKeys.has(normalizedAction.fieldKey) &&
        (input.scope === "SKELETON" ||
          intent.wantsAllChapters ||
          intent.wantsOutline ||
          intent.wantsTitles ||
          intent.wantsPurpose);

      return {
        ...normalizedAction,
        title: cleanPlanText(normalizedAction.title),
        content: shouldDeferFieldWriting ? "" : cleanPlanText(normalizedAction.content),
        summary: cleanPlanText(normalizedAction.summary),
        sceneGoal: cleanPlanText(normalizedAction.sceneGoal),
        sceneConflict: cleanPlanText(normalizedAction.sceneConflict),
        sceneOutcome: cleanPlanText(normalizedAction.sceneOutcome),
        locationHint: cleanPlanText(normalizedAction.locationHint),
      };
    })
    .filter((action) => {
      if (
        input.scope === "STORY_BIBLE" &&
        !intent.wantsDraft &&
        !intent.wantsOutline &&
        !intent.wantsTitles &&
        !intent.wantsPurpose &&
        (action.kind === "APPEND_CHAPTER_NOTES" ||
          action.kind === "APPEND_CHAPTER_DRAFT" ||
          action.kind === "UPDATE_CHAPTER_FIELD" ||
          action.kind === "APPEND_CHAPTER_FIELD" ||
          action.kind === "UPDATE_CHAPTER_PURPOSE")
      ) {
        return false;
      }

      if (
        (input.scope === "PROJECT" || intent.wantsBookSetup || intent.wantsStyleProfile) &&
        (action.kind === "APPEND_CHAPTER_NOTES" || action.kind === "CREATE_WORKING_NOTE")
      ) {
        return false;
      }

      if (!intent.wantsNotes && action.kind === "APPEND_CHAPTER_NOTES") {
        return false;
      }

      if ((input.scope === "SKELETON" || intent.wantsOutline) && action.kind === "APPEND_CHAPTER_DRAFT") {
        return false;
      }

      if (
        (input.scope === "SKELETON" || intent.wantsOutline) &&
        action.kind === "UPDATE_CHAPTER_FIELD" &&
        action.fieldKey === "draft"
      ) {
        return false;
      }

      if (
        intent.wantsOutline &&
        (action.kind === "UPDATE_CHAPTER_FIELD" || action.kind === "APPEND_CHAPTER_FIELD") &&
        action.fieldKey &&
        !outlinePlanningFieldKeys.has(action.fieldKey)
      ) {
        return false;
      }

      if (
        intent.wantsOutline &&
        action.kind === "APPEND_CHAPTER_FIELD" &&
        action.fieldKey === "outline"
      ) {
        return false;
      }

      if (
        requestedPlanningFields.size > 0 &&
        (input.scope === "SKELETON" || intent.wantsAllChapters || intent.wantsOutline || intent.wantsTitles) &&
        (action.kind === "UPDATE_CHAPTER_FIELD" || action.kind === "APPEND_CHAPTER_FIELD") &&
        action.fieldKey &&
        chapterPlanningFieldKeys.has(action.fieldKey) &&
        !requestedPlanningFields.has(action.fieldKey)
      ) {
        return false;
      }

      if (
        (intent.wantsOutline || intent.wantsTitles || intent.wantsAllChapters) &&
        !allowsSkeletonObjects &&
        (action.kind === "CREATE_STRUCTURE_BEAT" || action.kind === "CREATE_SCENE_CARD")
      ) {
        return false;
      }

      if (
        intent.wantsAllChapters &&
        action.kind === "UPDATE_CHAPTER_FIELD" &&
        action.fieldKey &&
        chapterPlanningFieldKeys.has(action.fieldKey) &&
        !action.chapterId &&
        typeof action.chapterNumber !== "number"
      ) {
        return false;
      }

      return true;
    })
    .slice(0, 48);

  if (!intent.wantsAllChapters) {
    return cleaned;
  }

  const supplemental: AssistantPlanAction[] = [];
  for (const chapter of input.project.chapters) {
    if (
      intent.wantsTitles &&
      !cleaned.some(
        (action) =>
          action.kind === "UPDATE_CHAPTER_FIELD" &&
          action.fieldKey === "title" &&
          actionTargetsChapter(action, chapter),
      )
    ) {
      supplemental.push({
        kind: "UPDATE_CHAPTER_FIELD",
        chapterId: chapter.id,
        chapterNumber: chapter.number,
        fieldKey: "title",
        content: "",
        summary: `Generate a strong title for Chapter ${chapter.number}.`,
      });
    }

    if (
      intent.wantsPurpose &&
      !cleaned.some(
        (action) =>
          action.kind === "UPDATE_CHAPTER_FIELD" &&
          action.fieldKey === "purpose" &&
          actionTargetsChapter(action, chapter),
      )
    ) {
      supplemental.push({
        kind: "UPDATE_CHAPTER_FIELD",
        chapterId: chapter.id,
        chapterNumber: chapter.number,
        fieldKey: "purpose",
        content: "",
        summary: `Clarify what Chapter ${chapter.number} must accomplish.`,
      });
    }

    if (
      intent.wantsOutline &&
      !cleaned.some(
        (action) =>
          action.kind === "UPDATE_CHAPTER_FIELD" &&
          action.fieldKey === "outline" &&
          actionTargetsChapter(action, chapter),
      )
    ) {
      supplemental.push({
        kind: "UPDATE_CHAPTER_FIELD",
        chapterId: chapter.id,
        chapterNumber: chapter.number,
        fieldKey: "outline",
        content: "",
        summary: `Generate a strong, commercially gripping outline for Chapter ${chapter.number}.`,
      });
    }

    if (
      intent.wantsCurrentBeat &&
      !cleaned.some(
        (action) =>
          action.kind === "UPDATE_CHAPTER_FIELD" &&
          action.fieldKey === "currentBeat" &&
          actionTargetsChapter(action, chapter),
      )
    ) {
      supplemental.push({
        kind: "UPDATE_CHAPTER_FIELD",
        chapterId: chapter.id,
        chapterNumber: chapter.number,
        fieldKey: "currentBeat",
        content: "",
        summary: `Sharpen the immediate dramatic beat for Chapter ${chapter.number}.`,
      });
    }

    if (
      intent.wantsSceneList &&
      !cleaned.some(
        (action) =>
          action.kind === "UPDATE_CHAPTER_FIELD" &&
          action.fieldKey === "sceneList" &&
          actionTargetsChapter(action, chapter),
      )
    ) {
      supplemental.push({
        kind: "UPDATE_CHAPTER_FIELD",
        chapterId: chapter.id,
        chapterNumber: chapter.number,
        fieldKey: "sceneList",
        content: "",
        summary: `Build a scene-by-scene lane for Chapter ${chapter.number}.`,
      });
    }

    if (
      intent.wantsKeyBeats &&
      !cleaned.some(
        (action) =>
          action.kind === "UPDATE_CHAPTER_FIELD" &&
          action.fieldKey === "keyBeats" &&
          actionTargetsChapter(action, chapter),
      )
    ) {
      supplemental.push({
        kind: "UPDATE_CHAPTER_FIELD",
        chapterId: chapter.id,
        chapterNumber: chapter.number,
        fieldKey: "keyBeats",
        content: "",
        summary: `List the key beats that should land in Chapter ${chapter.number}.`,
      });
    }

    if (
      intent.wantsRequiredInclusions &&
      !cleaned.some(
        (action) =>
          action.kind === "UPDATE_CHAPTER_FIELD" &&
          action.fieldKey === "requiredInclusions" &&
          actionTargetsChapter(action, chapter),
      )
    ) {
      supplemental.push({
        kind: "UPDATE_CHAPTER_FIELD",
        chapterId: chapter.id,
        chapterNumber: chapter.number,
        fieldKey: "requiredInclusions",
        content: "",
        summary: `List the must-have elements for Chapter ${chapter.number}.`,
      });
    }

    if (
      intent.wantsForbiddenElements &&
      !cleaned.some(
        (action) =>
          action.kind === "UPDATE_CHAPTER_FIELD" &&
          action.fieldKey === "forbiddenElements" &&
          actionTargetsChapter(action, chapter),
      )
    ) {
      supplemental.push({
        kind: "UPDATE_CHAPTER_FIELD",
        chapterId: chapter.id,
        chapterNumber: chapter.number,
        fieldKey: "forbiddenElements",
        content: "",
        summary: `List the things Chapter ${chapter.number} must avoid.`,
      });
    }

    if (
      intent.wantsDesiredMood &&
      !cleaned.some(
        (action) =>
          action.kind === "UPDATE_CHAPTER_FIELD" &&
          action.fieldKey === "desiredMood" &&
          actionTargetsChapter(action, chapter),
      )
    ) {
      supplemental.push({
        kind: "UPDATE_CHAPTER_FIELD",
        chapterId: chapter.id,
        chapterNumber: chapter.number,
        fieldKey: "desiredMood",
        content: "",
        summary: `Set the desired mood for Chapter ${chapter.number}.`,
      });
    }
  }

  return [...cleaned, ...supplemental].slice(0, 64);
}

function buildFallbackPlan(input: {
  message: string;
  role: AiRole;
  scope: ProjectChatScope;
  applyChanges: boolean;
  chapterId: string | null;
  project: ProjectWorkspace;
}): AssistantPlan {
  const lower = input.message.toLowerCase();
  const intent = inferAssistantIntent(input.message, input.scope);
  const actions: AssistantPlanAction[] = [];
  let nextTab: StoryForgeTab | null = null;

  if (input.applyChanges) {
    if (
      input.scope === "SKELETON" &&
      (
        intent.wantsAllChapters ||
        intent.wantsOutline ||
        intent.wantsTitles ||
        intent.wantsPurpose ||
        intent.wantsCurrentBeat ||
        intent.wantsKeyBeats ||
        intent.wantsSceneList ||
        intent.wantsRequiredInclusions ||
        intent.wantsForbiddenElements ||
        intent.wantsDesiredMood
      )
    ) {
      for (const chapter of input.project.chapters) {
        if (intent.wantsTitles) {
          actions.push({
            kind: "UPDATE_CHAPTER_FIELD",
            chapterId: chapter.id,
            chapterNumber: chapter.number,
            fieldKey: "title",
            content: "",
            summary: `Generate a distinct commercial title for Chapter ${chapter.number}.`,
          });
        }

        if (intent.wantsPurpose) {
          actions.push({
            kind: "UPDATE_CHAPTER_FIELD",
            chapterId: chapter.id,
            chapterNumber: chapter.number,
            fieldKey: "purpose",
            content: "",
            summary: `Clarify what Chapter ${chapter.number} must accomplish.`,
          });
        }

        if (intent.wantsCurrentBeat) {
          actions.push({
            kind: "UPDATE_CHAPTER_FIELD",
            chapterId: chapter.id,
            chapterNumber: chapter.number,
            fieldKey: "currentBeat",
            content: "",
            summary: `Sharpen the immediate dramatic beat for Chapter ${chapter.number}.`,
          });
        }

        if (intent.wantsKeyBeats) {
          actions.push({
            kind: "UPDATE_CHAPTER_FIELD",
            chapterId: chapter.id,
            chapterNumber: chapter.number,
            fieldKey: "keyBeats",
            content: "",
            summary: `List the key beats that should land in Chapter ${chapter.number}.`,
          });
        }

        if (intent.wantsSceneList) {
          actions.push({
            kind: "UPDATE_CHAPTER_FIELD",
            chapterId: chapter.id,
            chapterNumber: chapter.number,
            fieldKey: "sceneList",
            content: "",
            summary: `Build a scene-by-scene lane for Chapter ${chapter.number}.`,
          });
        }

        if (intent.wantsRequiredInclusions) {
          actions.push({
            kind: "UPDATE_CHAPTER_FIELD",
            chapterId: chapter.id,
            chapterNumber: chapter.number,
            fieldKey: "requiredInclusions",
            content: "",
            summary: `List the must-have elements for Chapter ${chapter.number}.`,
          });
        }

        if (intent.wantsForbiddenElements) {
          actions.push({
            kind: "UPDATE_CHAPTER_FIELD",
            chapterId: chapter.id,
            chapterNumber: chapter.number,
            fieldKey: "forbiddenElements",
            content: "",
            summary: `List the things Chapter ${chapter.number} must avoid.`,
          });
        }

        if (intent.wantsDesiredMood) {
          actions.push({
            kind: "UPDATE_CHAPTER_FIELD",
            chapterId: chapter.id,
            chapterNumber: chapter.number,
            fieldKey: "desiredMood",
            content: "",
            summary: `Set the desired mood for Chapter ${chapter.number}.`,
          });
        }

        if (intent.wantsOutline) {
          actions.push({
            kind: "UPDATE_CHAPTER_FIELD",
            chapterId: chapter.id,
            chapterNumber: chapter.number,
            fieldKey: "outline",
            content: "",
            summary: `Generate a strong, causally escalating outline for Chapter ${chapter.number}.`,
          });
        }
      }
      nextTab = "skeleton";
    }

    if (
      input.scope === "IDEA_LAB" ||
      lower.includes("idea") ||
      lower.includes("brainstorm") ||
      lower.includes("what if")
    ) {
      actions.push({
        kind: "CREATE_IDEA_ENTRY",
        title: input.message.slice(0, 72),
        content: input.message,
        summary: "Saved the request as a new idea vault entry so it can be developed later.",
      });
      nextTab = "ideaLab";
    }

    if (
      actions.length === 0 &&
      (input.scope === "SKELETON" || lower.includes("midpoint") || lower.includes("doorway") || lower.includes("climax") || lower.includes("beat"))
    ) {
      actions.push({
        kind: "CREATE_STRUCTURE_BEAT",
        title: input.message.slice(0, 80),
        content: input.message,
        structureType: inferStructureType(input.message),
        chapterId: input.chapterId ?? undefined,
        summary: "Mapped the request into the story skeleton as a structure beat.",
      });
      nextTab = "skeleton";
    }

    if (
      actions.length === 0 &&
      input.scope === "SKELETON" &&
      (lower.includes("scene") || lower.includes("goal") || lower.includes("conflict"))
    ) {
      actions.push({
        kind: "CREATE_SCENE_CARD",
        title: input.message.slice(0, 80),
        content: input.message,
        chapterId: input.chapterId ?? undefined,
        sceneGoal: lower.includes("goal") ? input.message : "Clarify what the POV wants in this moment.",
        sceneConflict: lower.includes("conflict") ? input.message : "Introduce resistance that changes the scene.",
        sceneOutcome: "End on a changed condition that pushes the next move.",
        summary: "Added a scene card so the idea becomes usable structure.",
      });
      nextTab = "skeleton";
    }

    if (intent.wantsBookSetup) {
      const payload: Record<string, unknown> = {};
      if (intent.wantsStoryBrief) {
        payload.storyBrief = "";
      }
      if (intent.wantsPlotDirection) {
        payload.plotDirection = "";
      }
      if (lower.includes("theme")) {
        payload.themes = [];
      }
      if (lower.includes("author name")) {
        payload.authorName = "";
      }
      if (lower.includes("series name")) {
        payload.seriesName = "";
      }
      if (lower.includes("book number in series")) {
        payload.seriesOrder = null;
      }
      if (lower.includes("genre")) {
        payload.genre = "";
      }
      if (lower.includes("audience")) {
        payload.audience = "";
      }
      if (lower.includes("point of view")) {
        payload.pointOfView = "";
      }
      if (lower.includes("tense")) {
        payload.tense = "";
      }
      if (lower.includes("chapter length")) {
        payload.targetChapterLength = null;
      }
      if (lower.includes("book length")) {
        payload.targetBookLength = null;
      }
      if (lower.includes("pacing notes")) {
        payload.pacingNotes = "";
      }
      if (lower.includes("prose style")) {
        payload.proseStyle = "";
      }
      if (lower.includes("comparable titles")) {
        payload.comparableTitles = [];
      }

      if (Object.keys(payload).length > 0) {
        actions.push({
          kind: "UPDATE_BOOK_SETUP",
          payload,
          summary: "Updated the Book Setup fields that match your instruction.",
        });
        nextTab = "setup";
      }
    }

    if (intent.wantsStyleProfile) {
      const payload: Record<string, unknown> = {};
      if (lower.includes("guidance intensity")) payload.guidanceIntensity = "";
      if (lower.includes("prose density")) payload.proseDensity = null;
      if (lower.includes("pacing")) payload.pacing = null;
      if (lower.includes("darkness")) payload.darkness = null;
      if (lower.includes("romance intensity")) payload.romanceIntensity = null;
      if (lower.includes("humor level")) payload.humorLevel = null;
      if (lower.includes("action frequency")) payload.actionFrequency = null;
      if (lower.includes("mystery density")) payload.mysteryDensity = null;
      if (lower.includes("dialogue / description") || lower.includes("dialogue description")) payload.dialogueDescriptionRatio = null;
      if (lower.includes("literary / commercial")) payload.literaryCommercialBalance = null;
      if (lower.includes("style guide")) payload.styleGuide = "";
      if (lower.includes("voice rules")) payload.voiceRules = [];
      if (lower.includes("aesthetic guide")) payload.aestheticGuide = "";

      if (Object.keys(payload).length > 0) {
        actions.push({
          kind: "UPDATE_STYLE_PROFILE",
          payload,
          summary: "Updated the style settings that match your instruction.",
        });
        nextTab = "settings";
      }
    }

    if (intent.wantsStoryBible) {
      const storyBibleActions: AssistantPlanAction[] = [];

      if (lower.includes("character")) {
        storyBibleActions.push({
          kind: "UPSERT_STORY_BIBLE_ENTITY",
          entityType: "character",
          entityMatch: extractEntityLabelFromMessage(input.message, "character"),
          payload: {},
          summary: "Updated the most relevant character entry in the story bible.",
        });
      }

      if (lower.includes("relationship")) {
        storyBibleActions.push({
          kind: "UPSERT_STORY_BIBLE_ENTITY",
          entityType: "relationship",
          entityMatch: extractEntityLabelFromMessage(input.message, "relationship"),
          payload: {},
          summary: "Updated the relevant relationship entry in the story bible.",
        });
      }

      if (lower.includes("plot thread") || lower.includes("arc")) {
        storyBibleActions.push({
          kind: "UPSERT_STORY_BIBLE_ENTITY",
          entityType: "plotThread",
          entityMatch: extractEntityLabelFromMessage(input.message, "plotThread"),
          payload: {},
          summary: "Updated the relevant plot thread in the story bible.",
        });
      }

      if (lower.includes("location") || lower.includes("place")) {
        storyBibleActions.push({
          kind: "UPSERT_STORY_BIBLE_ENTITY",
          entityType: "location",
          entityMatch: extractEntityLabelFromMessage(input.message, "location"),
          payload: {},
          summary: "Updated the relevant location entry in the story bible.",
        });
      }

      if (lower.includes("faction")) {
        storyBibleActions.push({
          kind: "UPSERT_STORY_BIBLE_ENTITY",
          entityType: "faction",
          entityMatch: extractEntityLabelFromMessage(input.message, "faction"),
          payload: {},
          summary: "Updated the relevant faction entry in the story bible.",
        });
      }

      if (lower.includes("timeline")) {
        storyBibleActions.push({
          kind: "UPSERT_STORY_BIBLE_ENTITY",
          entityType: "timelineEvent",
          entityMatch: extractEntityLabelFromMessage(input.message, "timelineEvent"),
          payload: {},
          summary: "Updated the relevant timeline entry in the story bible.",
        });
      }

      if (storyBibleActions.length > 0) {
        actions.push(...storyBibleActions);
        nextTab = "bible";
      } else if (input.scope === "STORY_BIBLE" && extractNamedEntityLabel(input.message)) {
        const fallbackEntityLabel = extractNamedEntityLabel(input.message);
        actions.push({
          kind: "UPSERT_STORY_BIBLE_ENTITY",
          entityType: "character",
          entityMatch: fallbackEntityLabel,
          payload: {},
          summary: "Updated the most relevant story bible entry from your instruction.",
        });
        nextTab = "bible";
      }
    }

    if (
      (input.scope === "CHAPTER" || lower.includes("chapter") || lower.includes("draft") || lower.includes("book")) &&
      !(input.scope === "SKELETON" && (intent.wantsAllChapters || intent.wantsOutline || intent.wantsTitles || intent.wantsPurpose))
    ) {
      if (lower.includes("purpose")) {
        actions.push({
          kind: "UPDATE_CHAPTER_PURPOSE",
          chapterId: input.chapterId ?? undefined,
          content: input.message,
          summary: "Updated the selected chapter purpose from your instruction.",
        });
      } else if (lower.includes("outline")) {
        actions.push({
          kind: lower.includes("append") || lower.includes("add")
            ? "APPEND_CHAPTER_FIELD"
            : "UPDATE_CHAPTER_FIELD",
          chapterId: input.chapterId ?? undefined,
          fieldKey: "outline",
          content: input.message,
          summary: lower.includes("append") || lower.includes("add")
            ? "Added the request to the selected chapter outline."
            : "Updated the selected chapter outline from your instruction.",
        });
      } else if (
        lower.includes("manuscript") ||
        lower.includes("draft") ||
        lower.includes("scene") ||
        lower.includes("paragraph") ||
        lower.includes("write this")
      ) {
        actions.push({
          kind:
            lower.includes("replace") || lower.includes("rewrite") || lower.includes("change")
              ? "UPDATE_CHAPTER_FIELD"
              : "APPEND_CHAPTER_FIELD",
          chapterId: input.chapterId ?? undefined,
          fieldKey: "draft",
          content: input.message,
          summary:
            lower.includes("replace") || lower.includes("rewrite") || lower.includes("change")
              ? "Updated the selected chapter manuscript from your instruction."
              : "Added new prose to the selected chapter manuscript.",
        });
      } else if (lower.includes("notes")) {
        actions.push({
          kind: lower.includes("replace") || lower.includes("rewrite") ? "UPDATE_CHAPTER_FIELD" : "APPEND_CHAPTER_FIELD",
          chapterId: input.chapterId ?? undefined,
          fieldKey: "notes",
          content: input.message,
          summary: "Updated the selected chapter notes from your instruction.",
        });
      } else if (lower.includes("draft") || lower.includes("paragraph") || lower.includes("write this")) {
        actions.push({
          kind: "APPEND_CHAPTER_DRAFT",
          chapterId: input.chapterId ?? undefined,
          content: input.message,
          summary: "Appended your instruction into the chapter draft as new prose material to revise from.",
        });
      } else {
        actions.push({
          kind: "APPEND_CHAPTER_NOTES",
          chapterId: input.chapterId ?? undefined,
          content: input.message,
          summary: "Saved your instruction in the selected chapter notes so it stays attached to the manuscript.",
        });
      }
      nextTab = "chapters";
    }

    if (lower.includes("plot direction")) {
      actions.push({
        kind: "UPDATE_PLOT_DIRECTION",
        content: input.message,
        summary: "Updated the project's plot direction so future retrieval reflects the new intent.",
      });
      nextTab = "setup";
    }

    if (lower.includes("story brief")) {
      actions.push({
        kind: "UPDATE_STORY_BRIEF",
        content: input.message,
        summary: "Updated the project story brief so the long-lived intent stays current.",
      });
      nextTab = "setup";
    }
  }

  if (actions.length > 0) {
    return {
      reply:
        input.role === "WRITING_COACH"
          ? "I made the requested project updates and kept the changes scoped so you can keep steering the story."
      : `I translated that plain-language request into structured ${APP_NAME} updates so it affects the right layer of the book.`,
      actions,
      nextTab,
    };
  }

  return {
    reply: [
      "I can help with that in plain language.",
      "If you want me to change the project directly, tell me what layer to touch, like:",
      '- "Add this as an idea vault note."',
      '- "Turn this into a midpoint beat."',
      '- "Put this in the selected chapter notes."',
      '- "Update the plot direction with this new ending idea."',
    ].join("\n"),
    actions: [],
    nextTab: null,
  };
}

async function buildLivePlan(input: {
  message: string;
  role: AiRole;
  scope: ProjectChatScope;
  applyChanges: boolean;
  chapterId: string | null;
  project: ProjectWorkspace;
}): Promise<AssistantPlan | null> {
  const intent = inferAssistantIntent(input.message, input.scope);
  const prompt = [
    `You are ${APP_NAME}'s plain-language project copilot.`,
    "Think in two stages: first decide exactly which app fields should change, then decide what each field should contain.",
    "Speak clearly and directly. Do not sound robotic or verbose.",
    "You are expected to understand the app's full workspace, not just the current text box.",
    "Treat already-filled project fields, chapter fields, story-bible entries, skeleton entries, memory, continuity issues, and series canon as active source-of-truth context.",
    "Do not ignore existing filled fields or overwrite them casually. Extend, refine, reconcile, or continue them unless the user explicitly asks to replace them.",
    "Your routing must preserve continuity across the current project and, when present, the wider series.",
    "Only propose actions that are clearly supported by the user's request.",
    "When the user asks to change writing directly, target the actual writable chapter field instead of saving the instruction as a note.",
    input.applyChanges
      ? "The user wants changes applied when the request clearly asks for them."
      : "The user wants advice only. Do not emit any actions.",
    `Current AI role: ${input.role}.`,
    `Current scope: ${normalizeScope(input.scope)}.`,
    `Detected intent: ${JSON.stringify(intent)}.`,
    "Supported actions:",
    "- CREATE_IDEA_ENTRY",
    "- CREATE_WORKING_NOTE",
    "- CREATE_STRUCTURE_BEAT",
    "- CREATE_SCENE_CARD",
    "- APPEND_CHAPTER_NOTES",
    "- APPEND_CHAPTER_DRAFT",
    "- UPDATE_CHAPTER_FIELD",
    "- APPEND_CHAPTER_FIELD",
    "- UPDATE_CHAPTER_PURPOSE",
    "- UPDATE_BOOK_SETUP",
    "- UPDATE_STYLE_PROFILE",
    "- UPSERT_STORY_BIBLE_ENTITY",
    "- UPDATE_PLOT_DIRECTION",
    "- UPDATE_STORY_BRIEF",
    "You may emit many actions in one response when the request affects multiple chapters or multiple planning layers.",
    "Use UPDATE_CHAPTER_FIELD or APPEND_CHAPTER_FIELD for writable chapter surfaces such as draft, outline, notes, title, purpose, currentBeat, desiredMood, keyBeats, requiredInclusions, forbiddenElements, and sceneList.",
    "Use UPDATE_BOOK_SETUP for Book Setup fields such as storyBrief, plotDirection, genre, audience, POV, tense, target lengths, pacing notes, prose style, themes, comparable titles, author name, or series fields.",
    "Use UPDATE_STYLE_PROFILE for style sliders and written style instructions such as proseDensity, pacing, darkness, dialogueDescriptionRatio, literaryCommercialBalance, aestheticGuide, styleGuide, or voiceRules.",
    "Use UPSERT_STORY_BIBLE_ENTITY for Characters, Relationships, Plot Threads, Locations, Factions, and Timeline entries.",
    "Use chapterNumber when you need to target a specific chapter but do not know its chapterId.",
    "For chapter-writing actions, include fieldKey.",
    "For UPDATE_BOOK_SETUP and UPDATE_STYLE_PROFILE, include payload as a JSON object containing only the fields to change.",
    "For UPSERT_STORY_BIBLE_ENTITY, include entityType and payload. If you are updating an existing entity, include entityId or entityMatch when possible.",
    "If the user asks to add prose to the manuscript, use fieldKey draft.",
    "If the user asks to update or add to the outline, use fieldKey outline.",
    "If the user asks for chapter outlines, chapter names, chapter purposes, story skeleton planning, or book planning, prefer chapter title/purpose/currentBeat/outline/sceneList actions and skeleton actions.",
    "If the user asks to plan all chapters or each chapter, emit one action per chapter that needs updating.",
    "Do not create structure beats or scene cards unless the user explicitly asks for beats, scene cards, or structural milestones.",
    "Do not use APPEND_CHAPTER_NOTES or CREATE_WORKING_NOTE unless the user explicitly wants notes, reminders, or saved instructions.",
    "Do not write to draft/manuscript when the request is about planning, outlines, chapter titles, skeletons, setup, or bible work.",
    "If you are unsure which field should hold the content, leave content blank and still emit the correct structured action so a second writing step can generate the field safely.",
    "If the user asks for direct edits to the selected chapter text, prefer UPDATE_CHAPTER_FIELD on draft or outline instead of notes.",
    "If the user asks to improve or flesh out a character, location, faction, plot thread, or timeline item, prefer UPSERT_STORY_BIBLE_ENTITY rather than chapter notes.",
    "If the user asks for chapter titles, title fields must be real chapter titles. Never treat act names, part labels, or section labels as chapter titles.",
    "If the user asks for outlines, put them in outline fields, not notes, not scene cards, and not act headers.",
    "If the user asks to fill several parts of the app at once, emit every needed action in one plan rather than choosing only one surface.",
    `If you emit a chapter field action, content should be the exact text to store when you can confidently provide it. If not, leave content blank and ${APP_NAME} will generate it.`,
    buildAssistantRoutingGuide(),
    buildAssistantActionExamples(),
    "Return strict JSON only with this shape:",
    '{"reply":"plain response","actions":[{"kind":"CREATE_IDEA_ENTRY","title":"...","content":"...","chapterId":"optional","chapterNumber":1,"fieldKey":"optional","structureType":"optional","sceneGoal":"optional","sceneConflict":"optional","sceneOutcome":"optional","outcomeType":"optional","locationHint":"optional","summary":"...","payload":{"optional":"json"},"entityType":"character|relationship|plotThread|location|faction|timelineEvent","entityId":"optional","entityMatch":"optional"}],"nextTab":"ideaLab|setup|skeleton|chapters|bible|memory|continuity|settings|null"}',
    "Full writable site map:",
    buildAssistantSiteMap(input.project),
    "Canonical project + series snapshot:",
    JSON.stringify(buildAssistantCanonSnapshot(input.project, input.chapterId), null, 2),
    "Project snapshot:",
    JSON.stringify(summarizeProject(input.project, input.chapterId), null, 2),
    "User message:",
    input.message,
  ].join("\n\n");

  const raw = await generateTextWithProvider(prompt, { maxOutputTokens: 2200 });
  if (!raw) {
    return null;
  }

  const parsed = parsePlan(raw);
  if (!parsed) {
    return null;
  }

  return {
    ...parsed,
    actions: sanitizePlanActions({
      actions: parsed.actions,
      message: input.message,
      scope: input.scope,
      applyChanges: input.applyChanges,
      project: input.project,
    }),
  };
}

async function materializeChapterFieldAction(input: {
  project: ProjectWorkspace;
  role: AiRole;
  message: string;
  chapterId: string | null;
  action: AssistantPlanAction;
}) {
  const fieldKey = input.action.fieldKey ?? (input.action.kind === "APPEND_CHAPTER_DRAFT" ? "draft" : undefined);
  const resolvedChapter = resolveActionChapter(input.project, input.action, input.chapterId);
  const resolvedChapterId = resolvedChapter?.id ?? null;
  if (!fieldKey || !resolvedChapterId) {
    return input.action;
  }

  const chapter = resolvedChapter;
  if (!chapter) {
    return input.action;
  }

  const currentFieldValue =
    fieldKey === "keyBeats" ||
    fieldKey === "requiredInclusions" ||
    fieldKey === "forbiddenElements" ||
    fieldKey === "sceneList"
      ? (chapter[fieldKey] as string[]).join("\n")
      : String(chapter[fieldKey] ?? "");

  const shouldGenerate = shouldGenerateActionContent(input.action, input.message, fieldKey === "title" ? 3 : 12);

  if (!shouldGenerate) {
    return input.action;
  }

  const mode =
    input.action.kind === "APPEND_CHAPTER_FIELD" || input.action.kind === "APPEND_CHAPTER_DRAFT"
      ? "append"
      : "replace";
  const fieldContext = buildContextPackage(input.project, resolvedChapterId, currentFieldValue || truncateText(chapter.draft, 1200));
  const previousChapter = input.project.chapters.find((entry) => entry.number === chapter.number - 1) ?? null;
  const nextChapter = input.project.chapters.find((entry) => entry.number === chapter.number + 1) ?? null;
  const fieldSpecificInstruction =
    fieldKey === "title"
      ? "Return only a strong chapter title, ideally 2 to 7 words. Do not include labels, act names, part names, chapter numbers, or quotation marks."
      : fieldKey === "purpose"
        ? "Return a compact 1 to 3 sentence statement of what this chapter must accomplish structurally and emotionally."
        : fieldKey === "currentBeat"
          ? "Return one sharp sentence describing the immediate dramatic movement of the chapter."
        : fieldKey === "desiredMood"
          ? "Return a short mood phrase, not a full paragraph."
        : fieldKey === "outline"
              ? "Return a commercially strong chapter outline with 5 to 9 concrete beats. Make it causally specific, escalating, and end with forward pull. Do not add commentary outside the outline."
              : fieldKey === "sceneList"
                ? "Return a scene-by-scene list with 3 to 8 distinct scenes. Each line should name a concrete scene, not a vague act label."
                : fieldKey === "keyBeats"
                  ? "Return 3 to 7 concrete key beats, each on its own line."
                : CHAPTER_LIST_FIELDS.has(fieldKey)
                  ? "Return plain list items separated by new lines. No numbering, no bullets, no labels."
                  : fieldKey === "draft"
                    ? "Return polished fiction prose that fits this exact chapter and preserves canon."
                  : `Return clean final content for the ${fieldLabel(fieldKey)}.`;
  const fieldPrompt = buildPromptEnvelope(
    `Update ${fieldLabel(fieldKey)}`,
    input.project,
    fieldContext,
    [
      `Target field: ${fieldLabel(fieldKey)}.`,
      `Target chapter: Chapter ${chapter.number} - ${chapter.title}.`,
      `Mode: ${mode}.`,
      "Honor the project's style dials and written style notes while generating this field, especially the dialogue-versus-description balance.",
      "Treat already-filled project, series, story-bible, skeleton, memory, and chapter fields as binding canon for this generation.",
      "Do not contradict or casually overwrite the existing field if it already contains valid canon. Refine or continue it in a way that stays synchronized with the rest of the project.",
      "Return only the text to store in the target field. Do not add labels, explanations, markdown fences, or commentary.",
      mode === "append"
        ? "Write only the new text that should be appended. Do not repeat the existing field."
        : "Write the full replacement content for the field.",
      fieldSpecificInstruction,
      previousChapter
        ? `Previous chapter: Chapter ${previousChapter.number} - ${previousChapter.title}. Summary: ${truncateText(previousChapter.summaries[0]?.summary ?? previousChapter.outline ?? "", 180)}`
        : "This is the opening chapter or no previous chapter summary is available.",
      nextChapter
        ? `Next chapter target: Chapter ${nextChapter.number} - ${nextChapter.title}. Purpose: ${truncateText(nextChapter.purpose, 160)}`
        : "This is the last current chapter or no next chapter target is available.",
      "Current field content:",
      currentFieldValue || "(empty)",
      "User instruction:",
      input.message,
    ].join("\n\n"),
    `Current AI role: ${input.role}.`,
  );

  const generationBudget = fieldKey === "draft" ? 1800 : fieldKey === "outline" ? 900 : 700;
  let generated = await generateTextWithProvider(fieldPrompt, {
    maxOutputTokens: generationBudget,
  });
  let cleanedContent = generated?.trim()
    ? cleanChapterFieldContent(input.project, chapter, fieldKey, generated.trim(), currentFieldValue)
    : "";
  const needsPlanningRetry = chapterPlanningFieldKeys.has(fieldKey) && looksLikeWeakChapterFieldValue(fieldKey, cleanedContent);

  if ((!cleanedContent || needsPlanningRetry) && chapterPlanningFieldKeys.has(fieldKey)) {
    const retryPrompt = buildPromptEnvelope(
      `Retry ${fieldLabel(fieldKey)}`,
      input.project,
      fieldContext,
      [
        `Return only the final ${fieldLabel(fieldKey)} for Chapter ${chapter.number}.`,
        fieldKey === "title"
          ? "Return a distinct, commercially strong chapter title in 2 to 7 words. Do not return an act, part, or section heading."
          : fieldKey === "outline"
            ? "Return a fully populated outline with 5 to 9 concrete escalating beats."
            : fieldSpecificInstruction,
        "Do not leave the field blank.",
        "Do not add labels, markdown, or commentary.",
        "Current field content:",
        currentFieldValue || "(empty)",
        "User instruction:",
        input.message,
      ].join("\n\n"),
      `Current AI role: ${input.role}.`,
    );

    generated = await generateTextWithProvider(retryPrompt, {
      maxOutputTokens: fieldKey === "outline" ? Math.max(generationBudget, 1100) : generationBudget,
    });
    cleanedContent = generated?.trim()
      ? cleanChapterFieldContent(input.project, chapter, fieldKey, generated.trim(), currentFieldValue)
      : "";
  }

  if ((!cleanedContent || looksLikeWeakChapterFieldValue(fieldKey, cleanedContent)) && fieldKey === "outline") {
    const emergencyOutlinePrompt = buildPromptEnvelope(
      `Emergency outline for Chapter ${chapter.number}`,
      input.project,
      fieldContext,
      [
        "Return only the chapter outline.",
        "Write 6 concrete beats, each on its own line.",
        "Make the beats causal, escalating, commercially sharp, and specific to this book.",
        "Do not leave the outline blank.",
        previousChapter
          ? `Previous chapter summary: ${truncateText(previousChapter.outline || previousChapter.purpose, 220)}`
          : "This is the opening chapter, so start with a strong disturbance and immediate hook.",
        nextChapter
          ? `Aim the ending beat toward Chapter ${nextChapter.number}: ${truncateText(nextChapter.purpose || nextChapter.outline, 180)}`
          : "End with forward pull that makes the reader need the next chapter.",
        "User instruction:",
        input.message,
      ].join("\n\n"),
      `Current AI role: ${input.role}.`,
    );

    generated = await generateTextWithProvider(emergencyOutlinePrompt, { maxOutputTokens: 1100 });
    cleanedContent = generated?.trim()
      ? cleanChapterFieldContent(input.project, chapter, fieldKey, generated.trim(), currentFieldValue)
      : "";
  }

  if ((!cleanedContent || looksLikeWeakChapterFieldValue(fieldKey, cleanedContent)) && chapterPlanningFieldKeys.has(fieldKey)) {
    cleanedContent = cleanChapterFieldContent(
      input.project,
      chapter,
      fieldKey,
      buildEmergencyPlanningFallback(chapter, fieldKey),
      currentFieldValue,
    );
  }

  if (!cleanedContent) {
    return input.action;
  }

  return {
    ...input.action,
    chapterId: resolvedChapterId,
    chapterNumber: chapter.number,
    fieldKey,
    content: cleanedContent,
  };
}

function normalizeStructureType(value: string | undefined) {
  switch ((value ?? "").trim().toUpperCase()) {
    case "OPENING_DISTURBANCE":
    case "FIRST_DOORWAY":
    case "MIDPOINT":
    case "SECOND_DOORWAY":
    case "CLIMAX":
    case "RESOLUTION":
      return value!.trim().toUpperCase();
    default:
      return "MIDPOINT";
  }
}

function normalizeOutcomeType(value: string | undefined) {
  switch ((value ?? "").trim().toUpperCase()) {
    case "SETBACK":
    case "PROGRESS":
    case "REVELATION":
    case "COMPLICATION":
    case "DECISION":
    case "CLIFFHANGER":
      return value!.trim().toUpperCase();
    default:
      return undefined;
  }
}

async function materializeStructureBeatAction(input: {
  project: ProjectWorkspace;
  role: AiRole;
  message: string;
  chapterId: string | null;
  action: AssistantPlanAction;
}) {
  const resolvedChapter =
    (input.action.chapterId ? getChapterById(input.project, input.action.chapterId) : null) ??
    (typeof input.action.chapterNumber === "number"
      ? input.project.chapters.find((chapter) => chapter.number === input.action.chapterNumber) ?? null
      : null) ??
    (input.chapterId ? getChapterById(input.project, input.chapterId) : null);

  const shouldGenerate =
    !input.action.content ||
    !input.action.title ||
    looksLikeRawInstruction(input.action.content, input.message);

  if (!shouldGenerate) {
    return {
      ...input.action,
      chapterId: resolvedChapter?.id ?? input.action.chapterId,
      chapterNumber: resolvedChapter?.number ?? input.action.chapterNumber,
      structureType: normalizeStructureType(input.action.structureType),
    };
  }

  const contextChapterId = resolveContextChapterId(input.project, resolvedChapter?.id ?? input.chapterId);
  if (!contextChapterId) {
    return input.action;
  }

  const context = buildContextPackage(input.project, contextChapterId);
  const prompt = buildPromptEnvelope(
    "Plan a structure beat",
    input.project,
    context,
    [
      "Return strict JSON only.",
      'Use this shape: {"label":"...","description":"...","notes":"...","type":"MIDPOINT"}',
      "Create one commercially strong structure beat that fits the user's request and the current book plan.",
      resolvedChapter
        ? `Link it naturally to Chapter ${resolvedChapter.number}: ${resolvedChapter.title}.`
        : "If no chapter is specified, position it at the best structural point for the request.",
      "Keep the label short and useful. Make the description concrete, causal, and story-specific.",
      "User instruction:",
      input.message,
    ].join("\n\n"),
    `Current AI role: ${input.role}.`,
  );

  const raw = await generateTextWithProvider(prompt, { maxOutputTokens: 500 });
  const parsed = raw ? parseJsonObject(raw) : null;

  return {
    ...input.action,
    chapterId: resolvedChapter?.id ?? input.action.chapterId,
    chapterNumber: resolvedChapter?.number ?? input.action.chapterNumber,
    title: cleanPlanText(typeof parsed?.label === "string" ? parsed.label : input.action.title) || "New structure beat",
    content:
      cleanPlanText(typeof parsed?.description === "string" ? parsed.description : input.action.content) ||
      "Define the turning point this beat should deliver.",
    summary:
      cleanPlanText(typeof parsed?.notes === "string" ? parsed.notes : input.action.summary) ||
      "Created a structure beat from your instruction.",
    structureType: normalizeStructureType(typeof parsed?.type === "string" ? parsed.type : input.action.structureType),
  };
}

async function materializeSceneCardAction(input: {
  project: ProjectWorkspace;
  role: AiRole;
  message: string;
  chapterId: string | null;
  action: AssistantPlanAction;
}) {
  const resolvedChapter =
    (input.action.chapterId ? getChapterById(input.project, input.action.chapterId) : null) ??
    (typeof input.action.chapterNumber === "number"
      ? input.project.chapters.find((chapter) => chapter.number === input.action.chapterNumber) ?? null
      : null) ??
    (input.chapterId ? getChapterById(input.project, input.chapterId) : null);

  const shouldGenerate =
    !input.action.title ||
    !input.action.sceneGoal ||
    !input.action.sceneConflict ||
    !input.action.sceneOutcome ||
    looksLikeRawInstruction(input.action.content || "", input.message);

  if (!shouldGenerate) {
    return {
      ...input.action,
      chapterId: resolvedChapter?.id ?? input.action.chapterId,
      chapterNumber: resolvedChapter?.number ?? input.action.chapterNumber,
      outcomeType: normalizeOutcomeType(input.action.outcomeType),
    };
  }

  const contextChapterId = resolveContextChapterId(input.project, resolvedChapter?.id ?? input.chapterId);
  if (!contextChapterId) {
    return input.action;
  }

  const context = buildContextPackage(input.project, contextChapterId);
  const prompt = buildPromptEnvelope(
    "Plan a scene card",
    input.project,
    context,
    [
      "Return strict JSON only.",
      'Use this shape: {"title":"...","summary":"...","goal":"...","conflict":"...","outcome":"...","outcomeType":"DECISION","locationHint":"..."}',
      "Create one scene card that fits the user's request and the current book plan.",
      resolvedChapter
        ? `Target Chapter ${resolvedChapter.number}: ${resolvedChapter.title}.`
        : "Choose the most logical chapter context from the current request.",
      "Make the card specific, dramatic, and useful for drafting. No vague filler.",
      "User instruction:",
      input.message,
    ].join("\n\n"),
    `Current AI role: ${input.role}.`,
  );

  const raw = await generateTextWithProvider(prompt, { maxOutputTokens: 650 });
  const parsed = raw ? parseJsonObject(raw) : null;

  return {
    ...input.action,
    chapterId: resolvedChapter?.id ?? input.action.chapterId,
    chapterNumber: resolvedChapter?.number ?? input.action.chapterNumber,
    title: cleanPlanText(typeof parsed?.title === "string" ? parsed.title : input.action.title) || "New scene",
    content: cleanPlanText(typeof parsed?.summary === "string" ? parsed.summary : input.action.content),
    sceneGoal: cleanPlanText(typeof parsed?.goal === "string" ? parsed.goal : input.action.sceneGoal),
    sceneConflict: cleanPlanText(typeof parsed?.conflict === "string" ? parsed.conflict : input.action.sceneConflict),
    sceneOutcome: cleanPlanText(typeof parsed?.outcome === "string" ? parsed.outcome : input.action.sceneOutcome),
    outcomeType: normalizeOutcomeType(typeof parsed?.outcomeType === "string" ? parsed.outcomeType : input.action.outcomeType),
    locationHint: cleanPlanText(typeof parsed?.locationHint === "string" ? parsed.locationHint : input.action.locationHint),
    summary: cleanPlanText(input.action.summary) || "Created a scene card from your instruction.",
  };
}

async function materializeProjectSetupAction(input: {
  project: ProjectWorkspace;
  role: AiRole;
  message: string;
  chapterId: string | null;
  action: AssistantPlanAction;
}) {
  const target = input.action.kind === "UPDATE_STORY_BRIEF" ? "story brief" : "plot direction";
  const currentValue =
    input.action.kind === "UPDATE_STORY_BRIEF"
      ? input.project.bookSettings.storyBrief
      : input.project.bookSettings.plotDirection;

  const shouldGenerate =
    !input.action.content ||
    input.action.content.trim().length < 20 ||
    looksLikeRawInstruction(input.action.content, input.message);

  if (!shouldGenerate) {
    return input.action;
  }

  const contextChapterId = resolveContextChapterId(input.project, input.action.chapterId ?? input.chapterId);
  if (!contextChapterId) {
    return input.action;
  }

  const context = buildContextPackage(input.project, contextChapterId);
  const prompt = buildPromptEnvelope(
    `Update ${target}`,
    input.project,
    context,
    [
      `Return only the final ${target} text for the book setup page.`,
      target === "story brief"
        ? "Write a compact but specific story brief that can guide future outlines and drafting."
        : "Write a clear plot direction statement that steers the book's future movement and ending pressure.",
      "Current value:",
      currentValue || "(empty)",
      "User instruction:",
      input.message,
    ].join("\n\n"),
    `Current AI role: ${input.role}.`,
  );

  const raw = await generateTextWithProvider(prompt, { maxOutputTokens: 450 });
  if (!raw?.trim()) {
    return input.action;
  }

  return {
    ...input.action,
    content: cleanGeneratedText(raw.trim()),
  };
}

async function materializeBookSetupAction(input: {
  project: ProjectWorkspace;
  role: AiRole;
  message: string;
  chapterId: string | null;
  action: AssistantPlanAction;
}) {
  const current = input.project.bookSettings;
  const existingPayload = normalizeBookSetupPayload(input.action.payload, current);
  if (Object.keys(existingPayload).length > 0 && !payloadLooksEmpty(existingPayload as Record<string, unknown>)) {
    return {
      ...input.action,
      payload: existingPayload,
    };
  }

  const requestedKeys = Array.from(
    new Set(
      Object.keys(input.action.payload ?? {}).filter((key): key is AssistantBookSetupFieldKey =>
        BOOK_SETUP_FIELD_KEYS.has(key as AssistantBookSetupFieldKey),
      ),
    ),
  );
  const effectiveKeys = requestedKeys.length
    ? requestedKeys
    : ["storyBrief", "plotDirection"] satisfies AssistantBookSetupFieldKey[];
  const contextChapterId = resolveContextChapterId(input.project, input.chapterId);
  if (!contextChapterId) {
    return input.action;
  }
  const context = buildContextPackage(input.project, contextChapterId);
  const prompt = buildPromptEnvelope(
    "Update Book Setup",
    input.project,
    context,
    [
      "Return strict JSON only.",
      `Write only these Book Setup keys: ${effectiveKeys.join(", ")}.`,
      `Use this shape: {${effectiveKeys.map((key) => `"${key}":"..."`).join(", ")}}`,
      "Fill the final app-ready values for the requested setup fields.",
      "Do not include fields that were not requested.",
      "Book Setup field guide:",
      ...BOOK_SETUP_FIELD_SPECS.filter((field) => effectiveKeys.includes(field.key as AssistantBookSetupFieldKey)).map(
        (field) => `- ${field.key}: ${field.description} Example: ${field.example}`,
      ),
      "Current values:",
      JSON.stringify(
        Object.fromEntries(effectiveKeys.map((key) => [key, current[key]])),
        null,
        2,
      ),
      "User instruction:",
      input.message,
    ].join("\n\n"),
    `Current AI role: ${input.role}.`,
  );
  const raw = await generateTextWithProvider(prompt, { maxOutputTokens: 900 });
  const parsed = raw ? parseJsonObject(raw) : null;
  let payload = normalizeBookSetupPayload(parsed ?? {}, current);

  if (!payloadHasKeys(payload as Record<string, unknown>, effectiveKeys)) {
    const retryPrompt = buildPromptEnvelope(
      "Retry Book Setup",
      input.project,
      context,
      [
        "Return strict JSON only.",
        `You must populate these exact Book Setup keys: ${effectiveKeys.join(", ")}.`,
        `Use this shape: {${effectiveKeys.map((key) => `"${key}":"..."`).join(", ")}}`,
        "Do not leave the requested keys blank.",
        "Write final app-ready values, not commentary about what should be added later.",
        "Current values:",
        JSON.stringify(
          Object.fromEntries(effectiveKeys.map((key) => [key, current[key]])),
          null,
          2,
        ),
        "User instruction:",
        input.message,
      ].join("\n\n"),
      `Current AI role: ${input.role}.`,
    );
    const retryRaw = await generateTextWithProvider(retryPrompt, { maxOutputTokens: 1000 });
    const retryParsed = retryRaw ? parseJsonObject(retryRaw) : null;
    payload = normalizeBookSetupPayload(retryParsed ?? {}, current);
  }

  return {
    ...input.action,
    payload,
  };
}

async function materializeStyleProfileAction(input: {
  project: ProjectWorkspace;
  role: AiRole;
  message: string;
  chapterId: string | null;
  action: AssistantPlanAction;
}) {
  const current = input.project.styleProfile;
  const existingPayload = normalizeStyleProfilePayload(input.action.payload, current);
  if (Object.keys(existingPayload).length > 0 && !payloadLooksEmpty(existingPayload as Record<string, unknown>)) {
    return {
      ...input.action,
      payload: existingPayload,
    };
  }

  const requestedKeys = Array.from(
    new Set(
      Object.keys(input.action.payload ?? {}).filter((key): key is AssistantStyleFieldKey =>
        STYLE_PROFILE_FIELD_KEYS.has(key as AssistantStyleFieldKey),
      ),
    ),
  );
  const effectiveKeys = requestedKeys.length
    ? requestedKeys
    : ["styleGuide", "voiceRules"] satisfies AssistantStyleFieldKey[];
  const contextChapterId = resolveContextChapterId(input.project, input.chapterId);
  if (!contextChapterId) {
    return input.action;
  }
  const context = buildContextPackage(input.project, contextChapterId);
  const prompt = buildPromptEnvelope(
    "Update Style Profile",
    input.project,
    context,
    [
      "Return strict JSON only.",
      `Write only these style-profile keys: ${effectiveKeys.join(", ")}.`,
      `Use this shape: {${effectiveKeys.map((key) => `"${key}":"..."`).join(", ")}}`,
      "Fill the final app-ready values for the requested style settings.",
      "Do not include fields that were not requested.",
      "Style field guide:",
      ...STYLE_PROFILE_FIELD_SPECS.filter((field) => effectiveKeys.includes(field.key as AssistantStyleFieldKey)).map(
        (field) => `- ${field.key}: ${field.description} Example: ${field.example}`,
      ),
      "Current values:",
      JSON.stringify(
        Object.fromEntries(effectiveKeys.map((key) => [key, current[key]])),
        null,
        2,
      ),
      "User instruction:",
      input.message,
    ].join("\n\n"),
    `Current AI role: ${input.role}.`,
  );
  const raw = await generateTextWithProvider(prompt, { maxOutputTokens: 900 });
  const parsed = raw ? parseJsonObject(raw) : null;
  let payload = normalizeStyleProfilePayload(parsed ?? {}, current);

  if (!payloadHasKeys(payload as Record<string, unknown>, effectiveKeys)) {
    const retryPrompt = buildPromptEnvelope(
      "Retry Style Profile",
      input.project,
      context,
      [
        "Return strict JSON only.",
        `You must populate these exact style keys: ${effectiveKeys.join(", ")}.`,
        `Use this shape: {${effectiveKeys.map((key) => `"${key}":"..."`).join(", ")}}`,
        "Do not leave the requested keys blank.",
        "Write final app-ready values, not vague comments about the style.",
        "Current values:",
        JSON.stringify(
          Object.fromEntries(effectiveKeys.map((key) => [key, current[key]])),
          null,
          2,
        ),
        "User instruction:",
        input.message,
      ].join("\n\n"),
      `Current AI role: ${input.role}.`,
    );
    const retryRaw = await generateTextWithProvider(retryPrompt, { maxOutputTokens: 1000 });
    const retryParsed = retryRaw ? parseJsonObject(retryRaw) : null;
    payload = normalizeStyleProfilePayload(retryParsed ?? {}, current);
  }

  return {
    ...input.action,
    payload,
  };
}

async function materializeStoryBibleEntityAction(input: {
  project: ProjectWorkspace;
  role: AiRole;
  message: string;
  chapterId: string | null;
  action: AssistantPlanAction;
}) {
  const entityType = input.action.entityType;
  if (!entityType || !STORY_BIBLE_ENTITY_TYPES.has(entityType)) {
    return input.action;
  }

  const existingEntity = findStoryBibleEntity(
    input.project,
    entityType,
    input.action.entityId,
    input.action.entityMatch,
    input.action.payload,
  );
  const seedLabel =
    input.action.entityMatch ||
    extractEntityLabelFromMessage(input.message, entityType) ||
    extractNamedEntityLabel(input.message) ||
    (existingEntity && typeof existingEntity === "object" && "name" in existingEntity
      ? String((existingEntity as { name?: unknown }).name ?? "")
      : "") ||
    (existingEntity && typeof existingEntity === "object" && "title" in existingEntity
      ? String((existingEntity as { title?: unknown }).title ?? "")
      : "") ||
    (existingEntity && typeof existingEntity === "object" && "label" in existingEntity
      ? String((existingEntity as { label?: unknown }).label ?? "")
      : "");
  const cleanedPayload = cleanStoryBiblePayload(input.action.payload, entityType);
  if (Object.keys(cleanedPayload).length > 0 && !payloadLooksEmpty(cleanedPayload)) {
    return {
      ...input.action,
      entityMatch: seedLabel || input.action.entityMatch,
      entityId:
        input.action.entityId ??
        (existingEntity && typeof existingEntity === "object" && "id" in existingEntity
          ? String((existingEntity as { id?: unknown }).id ?? "")
          : undefined),
      payload: ensureStoryBibleIdentityValue(
        entityType,
        cleanedPayload,
        seedLabel,
        existingEntity && typeof existingEntity === "object"
          ? (existingEntity as unknown as Record<string, unknown>)
          : null,
      ),
    };
  }

  const spec = STORY_BIBLE_ENTITY_SPECS.find((entry) => entry.entityType === entityType);
  const contextChapterId = resolveContextChapterId(input.project, input.chapterId);
  if (!spec || !contextChapterId) {
    return input.action;
  }
  const context = buildContextPackage(input.project, contextChapterId);
  const currentSnapshot =
    existingEntity && typeof existingEntity === "object"
      ? existingEntity
      : {};
  const prompt = buildPromptEnvelope(
    `Update ${spec.label}`,
    input.project,
    context,
    [
      "Return strict JSON only.",
      `You are updating a Story Bible ${spec.label.toLowerCase()}.`,
      spec.matchHint,
      `Use this shape: {"payload":{${spec.fields.map((field) => `"${field.key}":"..."`).join(", ")}}}`,
      "Write final app-ready content, not notes about what to do later.",
      "Only include fields you can support confidently from the request and current canon.",
      "If the request is to deepen or improve an existing entity, enrich it substantially rather than making tiny cosmetic additions.",
      "Treat existing story-bible entries, chapter history, memory, continuity, and series canon as source-of-truth context. Do not drift away from those facts.",
      seedLabel ? `Use this exact entity name/label where relevant: ${seedLabel}.` : "",
      "Field guide:",
      ...spec.fields.map((field) => `- ${field.key}: ${field.description} Example: ${field.example}`),
      "Current entity snapshot:",
      JSON.stringify(currentSnapshot, null, 2),
      "User instruction:",
      input.message,
    ].join("\n\n"),
    `Current AI role: ${input.role}.`,
  );
  const raw = await generateTextWithProvider(prompt, { maxOutputTokens: entityType === "character" ? 1800 : 1100 });
  const parsed = raw ? parseJsonObject(raw) : null;
  let nextPayload = cleanStoryBiblePayload(
    parsed && typeof parsed.payload === "object" && parsed.payload ? (parsed.payload as Record<string, unknown>) : parsed ?? {},
    entityType,
  );
  nextPayload = ensureStoryBibleIdentityValue(
    entityType,
    nextPayload,
    seedLabel,
    existingEntity && typeof existingEntity === "object"
      ? (existingEntity as unknown as Record<string, unknown>)
      : null,
  );

  if (payloadLooksEmpty(nextPayload)) {
    const emergencyPrompt = buildPromptEnvelope(
      `Emergency ${spec.label} payload`,
      input.project,
      context,
      [
        "Return strict JSON only.",
        `Create a usable Story Bible ${spec.label.toLowerCase()} payload.`,
        `Use this shape: {${spec.fields.map((field) => `"${field.key}":"..."`).join(", ")}}`,
        seedLabel ? `Use this exact entity label where relevant: ${seedLabel}.` : "",
        "Do not leave the payload blank.",
        "Write direct app-ready field values, not commentary about what should be filled later.",
        "User instruction:",
        input.message,
      ]
        .filter(Boolean)
        .join("\n\n"),
      `Current AI role: ${input.role}.`,
    );
    const emergencyRaw = await generateTextWithProvider(emergencyPrompt, {
      maxOutputTokens: entityType === "character" ? 1600 : 1000,
    });
    const emergencyParsed = emergencyRaw ? parseJsonObject(emergencyRaw) : null;
    nextPayload = cleanStoryBiblePayload(emergencyParsed ?? {}, entityType);
    nextPayload = ensureStoryBibleIdentityValue(
      entityType,
      nextPayload,
      seedLabel,
      existingEntity && typeof existingEntity === "object"
        ? (existingEntity as unknown as Record<string, unknown>)
        : null,
    );

    if (payloadLooksEmpty(nextPayload) && seedLabel) {
      if (entityType === "character") {
        nextPayload = {
          name: seedLabel,
          role: "Character",
          summary: `Develop ${seedLabel} into a story-relevant character with clear motive, pressure, and voice.`,
        };
      } else if (entityType === "location") {
        nextPayload = {
          name: seedLabel,
          summary: `${seedLabel} is a meaningful story location that should gain stronger atmosphere, rules, and relevance.`,
        };
      } else if (entityType === "faction") {
        nextPayload = {
          name: seedLabel,
          summary: `${seedLabel} is a meaningful faction that needs clear agenda, resources, and pressure on the story.`,
        };
      } else if (entityType === "plotThread") {
        nextPayload = {
          title: seedLabel,
          summary: `${seedLabel} is an active plot thread that needs stronger promises and payoff pressure.`,
        };
      } else if (entityType === "timelineEvent") {
        nextPayload = {
          label: seedLabel,
          description: `${seedLabel} is a timeline event that matters to the story chronology and causality.`,
        };
      }
    }
  }

  return {
    ...input.action,
    entityMatch: seedLabel || input.action.entityMatch,
    entityId:
      input.action.entityId ??
      (existingEntity && typeof existingEntity === "object" && "id" in existingEntity
        ? String((existingEntity as { id?: unknown }).id ?? "")
        : undefined),
    payload: nextPayload,
  };
}

async function materializeChapterPlanningBundle(input: {
  project: ProjectWorkspace;
  role: AiRole;
  message: string;
  chapter: ProjectWorkspace["chapters"][number];
  actions: AssistantPlanAction[];
}) {
  const requestedFields = Array.from(
    new Set(
      input.actions
        .map((action) => action.fieldKey)
        .filter(
          (fieldKey): fieldKey is AssistFieldKey =>
            typeof fieldKey === "string" && chapterPlanningFieldKeys.has(fieldKey as AssistFieldKey),
        ),
    ),
  );

  if (!requestedFields.length) {
    return Promise.all(
      input.actions.map((action) =>
        materializeChapterFieldAction({
          project: input.project,
          role: input.role,
          message: input.message,
          chapterId: input.chapter.id,
          action,
        }),
      ),
    );
  }

  const context = buildContextPackage(
    input.project,
    input.chapter.id,
    truncateText(input.chapter.outline || input.chapter.purpose || input.chapter.draft, 1200),
  );
  const previousChapter = input.project.chapters.find((entry) => entry.number === input.chapter.number - 1) ?? null;
  const nextChapter = input.project.chapters.find((entry) => entry.number === input.chapter.number + 1) ?? null;
  const currentValues = Object.fromEntries(
    requestedFields.map((fieldKey) => [
      fieldKey,
      CHAPTER_LIST_FIELDS.has(fieldKey)
        ? (input.chapter[fieldKey] as string[]).join("\n")
        : String(input.chapter[fieldKey] ?? ""),
    ]),
  );
  const jsonShape = requestedFields
    .map((fieldKey) =>
      CHAPTER_LIST_FIELDS.has(fieldKey) ? `"${fieldKey}":["item 1","item 2"]` : `"${fieldKey}":"..."`,
    )
    .join(", ");
  const requestedFieldGuidance = CHAPTER_FIELD_SPECS.filter((field) =>
    requestedFields.includes(field.key as AssistFieldKey),
  ).map((field) => `- ${field.key}: ${field.description} Example: ${field.example}`);

  const prompt = buildPromptEnvelope(
    `Plan Chapter ${input.chapter.number}`,
    input.project,
    context,
    [
      "Return strict JSON only.",
      `Use this shape: {${jsonShape}}`,
      `Requested keys: ${requestedFields.join(", ")}.`,
      "This is a structured planning task. First decide what this chapter must do in the whole book, then fill each requested field with final app-ready content.",
      "Keep the chapter distinct from the chapters around it. Escalate causally, preserve canon, and do not duplicate adjacent beats.",
      "Treat all already-filled planning fields, story-bible data, memory, continuity, and series canon as binding context.",
      "If the chapter already has useful planning material, refine or reconcile it instead of contradicting it.",
      requestedFields.includes("title")
        ? "If title is requested, give a real chapter title, not an act name, part name, placeholder, or chapter number."
        : "",
      requestedFields.includes("outline")
        ? "If outline is requested, write a real chapter outline with concrete beats, not act labels, vague themes, or notes about what might happen."
        : "",
      requestedFields.includes("purpose")
        ? "If purpose is requested, make it structurally specific and emotionally pointed."
        : "",
      requestedFields.includes("currentBeat")
        ? "If currentBeat is requested, write the immediate dramatic movement, not the whole chapter summary."
        : "",
      requestedFieldGuidance.length ? "Requested field guide:" : "",
      ...requestedFieldGuidance,
      previousChapter
        ? `Previous chapter: Chapter ${previousChapter.number} - ${previousChapter.title}. Outline: ${truncateText(previousChapter.outline || previousChapter.purpose, 280)}`
        : "There is no earlier chapter context available.",
      nextChapter
        ? `Next chapter target: Chapter ${nextChapter.number} - ${nextChapter.title}. Purpose: ${truncateText(nextChapter.purpose || nextChapter.outline, 240)}`
        : "There is no later chapter context available yet.",
      "Current chapter planning state:",
      JSON.stringify(
        {
          number: input.chapter.number,
          title: input.chapter.title,
          purpose: input.chapter.purpose,
          currentBeat: input.chapter.currentBeat,
          desiredMood: input.chapter.desiredMood,
          outline: truncateText(input.chapter.outline, 600),
          targetWords: input.chapter.targetWordCount,
        },
        null,
        2,
      ),
      "Current values for the requested keys:",
      JSON.stringify(currentValues, null, 2),
      "User instruction:",
      input.message,
    ].join("\n\n"),
    `Current AI role: ${input.role}.`,
  );

  const raw = await generateTextWithProvider(prompt, {
    maxOutputTokens: requestedFields.includes("outline") ? 1400 : 900,
  });
  const parsed = raw ? parseJsonObject(raw) : null;

  return Promise.all(
    input.actions.map((action) => {
      const fieldKey = action.fieldKey;
      const rawValue = fieldKey ? parsed?.[fieldKey] : undefined;
      const currentFieldValue =
        fieldKey && CHAPTER_LIST_FIELDS.has(fieldKey)
          ? (input.chapter[fieldKey] as string[]).join("\n")
          : fieldKey
            ? String(input.chapter[fieldKey] ?? "")
            : "";

      if (fieldKey && rawValue != null) {
        const textValue = structuredFieldValueToText(rawValue);
        const cleanedValue = textValue
          ? cleanChapterFieldContent(input.project, input.chapter, fieldKey, textValue, currentFieldValue)
          : "";
        if (cleanedValue && !looksLikeWeakChapterFieldValue(fieldKey, cleanedValue)) {
          return Promise.resolve({
            ...action,
            chapterId: input.chapter.id,
            chapterNumber: input.chapter.number,
            content: cleanedValue,
          });
        }
      }

      return materializeChapterFieldAction({
        project: input.project,
        role: input.role,
        message: input.message,
        chapterId: input.chapter.id,
        action,
      });
    }),
  );
}

async function regenerateDistinctChapterTitle(input: {
  project: ProjectWorkspace;
  role: AiRole;
  message: string;
  chapter: ProjectWorkspace["chapters"][number];
  blockedTitles: string[];
}) {
  const context = buildContextPackage(input.project, input.chapter.id, truncateText(input.chapter.outline || input.chapter.purpose, 1000));
  const prompt = buildPromptEnvelope(
    `Retitle Chapter ${input.chapter.number}`,
    input.project,
    context,
    [
      "Return only a chapter title.",
      "Keep it commercially sharp, specific, and distinct from the other chapter titles in the book.",
      "Do not use chapter numbers, quotation marks, labels, or subtitles.",
      `Avoid these existing titles: ${input.blockedTitles.join(" | ") || "(none)"}.`,
      "Current chapter context:",
      JSON.stringify(
        {
          number: input.chapter.number,
          currentTitle: input.chapter.title,
          purpose: input.chapter.purpose,
          currentBeat: input.chapter.currentBeat,
          outline: truncateText(input.chapter.outline, 420),
        },
        null,
        2,
      ),
      "User instruction:",
      input.message,
    ].join("\n\n"),
    `Current AI role: ${input.role}.`,
  );

  const raw = await generateTextWithProvider(prompt, { maxOutputTokens: 120 });
  return raw?.trim() ? cleanTitleText(raw.trim(), input.chapter.title) : input.chapter.title;
}

async function ensureDistinctPlanningTitles(input: {
  project: ProjectWorkspace;
  role: AiRole;
  message: string;
  actions: AssistantPlanAction[];
}) {
  const seenTitles = new Set<string>();
  const revisedActions: AssistantPlanAction[] = [];

  for (const action of input.actions) {
    if (action.kind !== "UPDATE_CHAPTER_FIELD" || action.fieldKey !== "title") {
      revisedActions.push(action);
      continue;
    }

    const chapter = resolveActionChapter(input.project, action);
    if (!chapter) {
      revisedActions.push(action);
      continue;
    }

    const blockedTitles = [
      ...input.project.chapters
        .filter((entry) => entry.id !== chapter.id)
        .map((entry) => entry.title.trim())
        .filter(Boolean),
      ...Array.from(seenTitles),
    ];
    let nextTitle = cleanTitleText(action.content ?? "", chapter.title);

    if (!nextTitle || looksLikeWeakTitle(nextTitle) || seenTitles.has(nextTitle.toLowerCase())) {
      nextTitle = await regenerateDistinctChapterTitle({
        project: input.project,
        role: input.role,
        message: input.message,
        chapter,
        blockedTitles,
      });
    }

    seenTitles.add(nextTitle.toLowerCase());
    revisedActions.push({
      ...action,
      chapterId: chapter.id,
      chapterNumber: chapter.number,
      content: nextTitle,
    });
  }

  return revisedActions;
}

async function materializePlanActions(input: {
  project: ProjectWorkspace;
  role: AiRole;
  message: string;
  scope: ProjectChatScope;
  chapterId: string | null;
  actions: AssistantPlanAction[];
}) {
  const normalizedActions = input.actions.map((action) =>
    action.kind === "UPDATE_CHAPTER_PURPOSE"
      ? ({ ...action, kind: "UPDATE_CHAPTER_FIELD", fieldKey: "purpose" } as AssistantPlanAction)
      : action,
  );

  const groupedPlanningActions = new Map<
    string,
    {
      chapter: ProjectWorkspace["chapters"][number];
      indexes: number[];
      actions: AssistantPlanAction[];
    }
  >();

  normalizedActions.forEach((action, index) => {
    if (
      action.kind !== "UPDATE_CHAPTER_FIELD" ||
      !action.fieldKey ||
      !chapterPlanningFieldKeys.has(action.fieldKey) ||
      !shouldGenerateActionContent(action, input.message, action.fieldKey === "title" ? 3 : 12)
    ) {
      return;
    }

    const chapter = resolveActionChapter(input.project, action, input.chapterId);
    if (!chapter) {
      return;
    }

    const existingGroup = groupedPlanningActions.get(chapter.id);
    if (existingGroup) {
      existingGroup.indexes.push(index);
      existingGroup.actions.push(action);
      return;
    }

    groupedPlanningActions.set(chapter.id, {
      chapter,
      indexes: [index],
      actions: [action],
    });
  });

  const resultPromises = normalizedActions.map<Promise<AssistantPlanAction>>((action) => Promise.resolve(action));
  const bundledIndexes = new Set<number>();
  const groupedValues = Array.from(groupedPlanningActions.values());

  for (const group of groupedValues) {
    const shouldBundle = input.scope === "SKELETON" || group.actions.length > 1;
    if (!shouldBundle) {
      continue;
    }

    const bundlePromise = materializeChapterPlanningBundle({
      project: input.project,
      role: input.role,
      message: input.message,
      chapter: group.chapter,
      actions: group.actions,
    });

    group.indexes.forEach((index, localIndex) => {
      bundledIndexes.add(index);
      resultPromises[index] = bundlePromise.then((actions) => actions[localIndex] ?? normalizedActions[index]);
    });
  }

  normalizedActions.forEach((action, index) => {
    if (bundledIndexes.has(index)) {
      return;
    }

    if (
      action.kind === "UPDATE_CHAPTER_FIELD" ||
      action.kind === "APPEND_CHAPTER_FIELD" ||
      action.kind === "APPEND_CHAPTER_DRAFT"
    ) {
      resultPromises[index] = materializeChapterFieldAction({
        project: input.project,
        role: input.role,
        message: input.message,
        chapterId: input.chapterId,
        action,
      });
      return;
    }

    if (action.kind === "CREATE_STRUCTURE_BEAT") {
      resultPromises[index] = materializeStructureBeatAction({ ...input, action });
      return;
    }

    if (action.kind === "CREATE_SCENE_CARD") {
      resultPromises[index] = materializeSceneCardAction({ ...input, action });
      return;
    }

    if (action.kind === "UPDATE_PLOT_DIRECTION" || action.kind === "UPDATE_STORY_BRIEF") {
      resultPromises[index] = materializeProjectSetupAction({ ...input, action });
      return;
    }

    if (action.kind === "UPDATE_BOOK_SETUP") {
      resultPromises[index] = materializeBookSetupAction({ ...input, action });
      return;
    }

    if (action.kind === "UPDATE_STYLE_PROFILE") {
      resultPromises[index] = materializeStyleProfileAction({ ...input, action });
      return;
    }

    if (action.kind === "UPSERT_STORY_BIBLE_ENTITY") {
      resultPromises[index] = materializeStoryBibleEntityAction({ ...input, action });
    }
  });

  const materialized = await Promise.all(resultPromises);
  return ensureDistinctPlanningTitles({
    project: input.project,
    role: input.role,
    message: input.message,
    actions: materialized,
  });
}

const DEFAULT_SCOPE_TABS: Partial<Record<ProjectChatScope, StoryForgeTab>> = {
  IDEA_LAB: "ideaLab",
  SKELETON: "skeleton",
  CHAPTER: "chapters",
  STORY_BIBLE: "bible",
};

async function applyActions(
  project: ProjectWorkspace,
  actions: AssistantPlanAction[],
  options?: { defaultChapterId?: string | null },
) {
  const applied: ProjectChatActionRecord[] = [];
  let workingProject = project;
  const chaptersNeedingSync = new Set<string>();

  async function refreshWorkingProject() {
    workingProject = (await getProjectWorkspace(project.id)) || workingProject;
  }

  async function recordApplied(
    index: number,
    action: AssistantPlanAction,
    targetLabel: string,
    summary: string,
  ) {
    applied.push({
      id: `action-${index}`,
      kind: action.kind,
      targetLabel,
      summary,
      status: "APPLIED",
    });
    await refreshWorkingProject();
  }

  function recordSkipped(index: number, action: AssistantPlanAction, targetLabel: string, summary: string) {
    applied.push({
      id: `action-${index}`,
      kind: action.kind,
      targetLabel,
      summary,
      status: "SKIPPED",
    });
  }

  function findChapterTarget(action: AssistantPlanAction) {
    return (
      (action.chapterId ? getChapterById(workingProject, action.chapterId) : null) ??
      (typeof action.chapterNumber === "number"
        ? workingProject.chapters.find((entry) => entry.number === action.chapterNumber) ?? null
        : null) ??
      (options?.defaultChapterId ? getChapterById(workingProject, options.defaultChapterId) : null)
    );
  }

  function resolveChapter(index: number, action: AssistantPlanAction) {
    const chapter = findChapterTarget(action);

    if (!chapter) {
      recordSkipped(index, action, "Project", "Skipped because no chapter was selected.");
      return null;
    }

    return chapter;
  }

  function buildChapterFieldPatch(
    chapter: NonNullable<ReturnType<typeof getChapterById>>,
    action: AssistantPlanAction,
  ): {
    fieldKey: AssistFieldKey;
    patch: Parameters<typeof updateChapter>[1];
    nextValueText: string;
    currentValueText: string;
  } {
    const fieldKey = action.fieldKey ?? "notes";
    const incomingContent = action.content?.trim() ?? "";
    const currentValue = CHAPTER_LIST_FIELDS.has(fieldKey)
      ? (chapter[fieldKey] as string[]).join("\n")
      : String(chapter[fieldKey] ?? "");
    const nextValue =
      action.kind === "APPEND_CHAPTER_FIELD"
        ? [currentValue.trim(), incomingContent].filter(Boolean).join("\n\n")
        : incomingContent || currentValue;
    const cleanedValue = cleanChapterFieldContent(workingProject, chapter, fieldKey, nextValue, currentValue);

    if (CHAPTER_LIST_FIELDS.has(fieldKey)) {
      return {
        fieldKey,
        patch: {
          [fieldKey]: cleanedValue
            .split(/\n|,/)
            .map((entry) => entry.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
            .filter(Boolean),
        } as Parameters<typeof updateChapter>[1],
        nextValueText: cleanedValue,
        currentValueText: currentValue,
      };
    }

    if (fieldKey === "draft") {
      return {
        fieldKey,
        patch: {
          draft: cleanedValue,
          status: "REVISED",
        } as Parameters<typeof updateChapter>[1],
        nextValueText: cleanedValue,
        currentValueText: currentValue,
      };
    }

    return {
      fieldKey,
      patch: { [fieldKey]: cleanedValue } as Parameters<typeof updateChapter>[1],
      nextValueText: cleanedValue,
      currentValueText: currentValue,
    };
  }

  for (const [index, action] of actions.entries()) {
    if (action.kind === "CREATE_IDEA_ENTRY") {
      await mutateIdeaLab(
        workingProject.id,
        {
          entityType: "ideaEntry",
          payload: {
            title: action.title || "New idea",
            content: action.content || "",
            type: "CONCEPT",
            source: "Project copilot",
            tags: ["copilot"],
            isFavorite: false,
            status: "ACTIVE",
          },
        },
        "POST",
      );
      await recordApplied(index, action, action.title || "Idea vault", action.summary || "Created an idea entry.");
      continue;
    }

    if (action.kind === "CREATE_WORKING_NOTE") {
      await mutateIdeaLab(
        workingProject.id,
        {
          entityType: "workingNote",
          payload: {
            title: action.title || "Working note",
            content: action.content || "",
            linkedChapterId: action.chapterId || null,
            type: "SANDBOX",
            tags: ["copilot"],
            status: "ACTIVE",
          },
        },
        "POST",
      );
      await recordApplied(index, action, action.title || "Working note", action.summary || "Created a working note.");
      continue;
    }

    if (action.kind === "CREATE_STRUCTURE_BEAT") {
      const chapter = findChapterTarget(action);
      await mutateSkeleton(
        workingProject.id,
        {
          entityType: "structureBeat",
          payload: {
            chapterId: chapter?.id ?? action.chapterId ?? null,
            type: action.structureType || "MIDPOINT",
            label: action.title || "New structure beat",
            description: action.content || action.summary || "Created from the project copilot.",
            notes: action.summary || "",
            status: "PLANNED",
            orderIndex: workingProject.structureBeats.length + index + 1,
          },
        },
        "POST",
      );
      await recordApplied(index, action, action.title || "Structure engine", action.summary || "Created a structure beat.");
      continue;
    }

    if (action.kind === "CREATE_SCENE_CARD") {
      const chapter = findChapterTarget(action);
      await mutateSkeleton(
        workingProject.id,
        {
          entityType: "sceneCard",
          payload: {
            chapterId: chapter?.id ?? action.chapterId ?? null,
            title: action.title || "New scene",
            summary: action.content || action.summary || "",
            goal: action.sceneGoal || "",
            conflict: action.sceneConflict || "",
            outcome: action.sceneOutcome || "",
            outcomeType: action.outcomeType || null,
            locationHint: action.locationHint || "",
            orderIndex: workingProject.sceneCards.length + index + 1,
            frozen: false,
          },
        },
        "POST",
      );
      await recordApplied(index, action, action.title || "Scene engine", action.summary || "Created a scene card.");
      continue;
    }

    if (action.kind === "UPDATE_PLOT_DIRECTION") {
      await updateProject(workingProject.id, {
        bookSettings: {
          ...workingProject.bookSettings,
          plotDirection: action.content || workingProject.bookSettings.plotDirection,
        },
      });
      await recordApplied(index, action, "Book setup", action.summary || "Updated the plot direction.");
      continue;
    }

    if (action.kind === "UPDATE_STORY_BRIEF") {
      await updateProject(workingProject.id, {
        bookSettings: {
          ...workingProject.bookSettings,
          storyBrief: action.content || workingProject.bookSettings.storyBrief,
        },
      });
      await recordApplied(index, action, "Book setup", action.summary || "Updated the story brief.");
      continue;
    }

    if (action.kind === "UPDATE_BOOK_SETUP") {
      const payload = normalizeBookSetupPayload(action.payload, workingProject.bookSettings);
      if (Object.keys(payload).length === 0) {
        recordSkipped(index, action, "Book setup", "Skipped because no valid Book Setup fields were produced.");
        continue;
      }

      await updateProject(workingProject.id, {
        bookSettings: {
          ...workingProject.bookSettings,
          ...payload,
        },
      });
      await recordApplied(index, action, "Book setup", action.summary || "Updated the requested Book Setup fields.");
      continue;
    }

    if (action.kind === "UPDATE_STYLE_PROFILE") {
      const payload = normalizeStyleProfilePayload(action.payload, workingProject.styleProfile);
      if (Object.keys(payload).length === 0) {
        recordSkipped(index, action, "Style settings", "Skipped because no valid style settings were produced.");
        continue;
      }

      await updateProject(workingProject.id, {
        styleProfile: {
          ...workingProject.styleProfile,
          ...payload,
        },
      });
      await recordApplied(index, action, "Style settings", action.summary || "Updated the requested style settings.");
      continue;
    }

    if (action.kind === "UPSERT_STORY_BIBLE_ENTITY") {
      if (!action.entityType || !STORY_BIBLE_ENTITY_TYPES.has(action.entityType)) {
        recordSkipped(index, action, "Story bible", "Skipped because no valid story-bible entity type was selected.");
        continue;
      }

      let payload = cleanStoryBiblePayload(action.payload, action.entityType);
      payload = ensureStoryBibleIdentityValue(
        action.entityType,
        payload,
        action.entityMatch ?? "",
        null,
      );
      if (action.entityType === "relationship") {
        if ("sourceCharacterId" in payload) {
          payload.sourceCharacterId = resolveCharacterIdByName(workingProject, payload.sourceCharacterId);
        }
        if ("targetCharacterId" in payload) {
          payload.targetCharacterId = resolveCharacterIdByName(workingProject, payload.targetCharacterId);
        }
      }
      const existingEntity = findStoryBibleEntity(
        workingProject,
        action.entityType,
        action.entityId,
        action.entityMatch,
        payload,
      );
      const entityId =
        action.entityId ??
        (existingEntity && typeof existingEntity === "object" && "id" in existingEntity
          ? String((existingEntity as { id?: unknown }).id ?? "")
          : undefined);
      const targetLabel = storyBibleTargetLabel(action.entityType, existingEntity, payload);

      if (Object.keys(payload).length === 0) {
        recordSkipped(index, action, targetLabel, "Skipped because the AI did not produce usable story-bible content.");
        continue;
      }

      await mutateStoryBible(
        workingProject.id,
        {
          entityType: action.entityType,
          payload,
          ...(entityId ? { id: entityId } : {}),
        },
        entityId ? "PATCH" : "POST",
      );
      await recordApplied(index, action, targetLabel, action.summary || `Updated ${targetLabel.toLowerCase()}.`);
      continue;
    }

    const chapter = resolveChapter(index, action);
    if (!chapter) {
      continue;
    }

    if (action.kind === "APPEND_CHAPTER_NOTES") {
      await updateChapter(chapter.id, {
        notes: [chapter.notes.trim(), action.content?.trim()].filter(Boolean).join("\n\n"),
      });
      await recordApplied(index, action, chapter.title, action.summary || "Appended to the chapter notes.");
      continue;
    }

    if (action.kind === "UPDATE_CHAPTER_FIELD" || action.kind === "APPEND_CHAPTER_FIELD") {
      const { fieldKey, patch, nextValueText, currentValueText } = buildChapterFieldPatch(chapter, action);
      if (!nextValueText.trim() && !currentValueText.trim()) {
        recordSkipped(index, action, `${chapter.title} ${fieldLabel(fieldKey)}`, "Skipped because the AI did not produce usable content for that field.");
        continue;
      }
      await updateChapter(chapter.id, patch);
      if (fieldKey === "draft") {
        chaptersNeedingSync.add(chapter.id);
      }
      await recordApplied(
        index,
        action,
        `${chapter.title} ${fieldLabel(fieldKey)}`,
        action.summary ||
          (action.kind === "APPEND_CHAPTER_FIELD"
            ? `Added content to the ${fieldLabel(fieldKey)}.`
            : `Updated the ${fieldLabel(fieldKey)}.`),
      );
      continue;
    }

    if (action.kind === "APPEND_CHAPTER_DRAFT") {
      await updateChapter(chapter.id, {
        draft: [chapter.draft.trim(), action.content?.trim()].filter(Boolean).join("\n\n"),
        status: "DRAFTING",
      });
      chaptersNeedingSync.add(chapter.id);
      await recordApplied(index, action, chapter.title, action.summary || "Appended to the chapter draft.");
      continue;
    }

    if (action.kind === "UPDATE_CHAPTER_PURPOSE") {
      await updateChapter(chapter.id, {
        purpose: action.content || chapter.purpose,
      });
      await recordApplied(index, action, chapter.title, action.summary || "Updated the chapter purpose.");
    }
  }

  for (const chapterId of chaptersNeedingSync) {
    const chapter = getChapterById(workingProject, chapterId);
    if (!chapter || chapter.draft.trim().length < 120) {
      continue;
    }

    try {
      await syncChapterToStoryState(workingProject.id, chapterId, {
        continuityMode: "POST_GENERATION",
      });
      await refreshWorkingProject();
    } catch {
      // Copilot changes should still apply even if the background sync misses.
    }
  }

  return applied;
}

function defaultNextTab(scope: ProjectChatScope) {
  return DEFAULT_SCOPE_TABS[scope] ?? null;
}

export async function runProjectAssistant(input: {
  projectId: string;
  message: string;
  role: AiRole;
  scope: ProjectChatScope;
  chapterId: string | null;
  applyChanges: boolean;
}) {
  const project = await getProjectWorkspace(input.projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  const intent = inferAssistantIntent(input.message, input.scope);
  const fallbackPlan = buildFallbackPlan({ ...input, project });
  const livePlan = await buildLivePlan({ ...input, project });
  const rawPlan = livePlanNeedsFallback({
    message: input.message,
    scope: input.scope,
    applyChanges: input.applyChanges,
    intent,
    livePlan,
  })
    ? fallbackPlan
    : (livePlan ?? fallbackPlan);
  const plan = {
    ...rawPlan,
    actions: sanitizePlanActions({
      actions: rawPlan.actions,
      message: input.message,
      scope: input.scope,
      applyChanges: input.applyChanges,
      project,
    }),
  };
  const materializedActions = input.applyChanges
    ? await materializePlanActions({
        project,
        role: input.role,
        message: input.message,
        scope: input.scope,
        chapterId: input.chapterId,
        actions: plan.actions,
      })
    : [];
  const actions = input.applyChanges
    ? await applyActions(project, materializedActions, { defaultChapterId: input.chapterId })
    : [];
  const nextProject = (await getProjectWorkspace(input.projectId)) || project;
  const contextPackage: ContextPackage | null = input.chapterId
    ? buildContextPackage(nextProject, input.chapterId)
    : null;

  return {
    reply: plan.reply,
    actions,
    project: nextProject,
    contextPackage,
    scope: input.scope,
    nextTab: plan.nextTab ?? defaultNextTab(input.scope),
  };
}
