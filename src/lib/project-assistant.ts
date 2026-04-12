import { APP_NAME } from "@/lib/brand";
import { buildContextPackage } from "@/lib/memory";
import { cleanGeneratedText, cleanSummaryText, sanitizeManuscriptText } from "@/lib/ai-output";
import { generateTextWithProvider } from "@/lib/openai";
import { buildPromptEnvelope } from "@/lib/prompt-templates";
import { getChapterById, getProjectWorkspace } from "@/lib/project-data";
import { syncChapterToStoryState } from "@/lib/story-sync";
import { mutateIdeaLab, mutateSkeleton, updateChapter, updateProject } from "@/lib/story-service";
import type {
  AiRole,
  AssistFieldKey,
  ContextPackage,
  ProjectChatActionRecord,
  ProjectChatScope,
  ProjectWorkspace,
  StoryForgeTab,
} from "@/types/storyforge";

type AssistantActionKind = ProjectChatActionRecord["kind"];

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

function isChapterAction(kind: AssistantActionKind) {
  return (
    kind === "APPEND_CHAPTER_NOTES" ||
    kind === "APPEND_CHAPTER_DRAFT" ||
    kind === "UPDATE_CHAPTER_PURPOSE" ||
    kind === "UPDATE_CHAPTER_FIELD" ||
    kind === "APPEND_CHAPTER_FIELD"
  );
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
  wantsNotes: boolean;
  wantsDraft: boolean;
  wantsStoryBrief: boolean;
  wantsPlotDirection: boolean;
  wantsAllChapters: boolean;
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
  return (
    !content ||
    content.length < minimumLength ||
    content.toLowerCase() === message.trim().toLowerCase() ||
    looksLikeRawInstruction(content, message)
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

function inferAssistantIntent(message: string, scope: ProjectChatScope): AssistantIntent {
  const lower = message.toLowerCase();
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
    wantsPurpose:
      lower.includes("purpose") ||
      lower.includes("plot summary") ||
      lower.includes("plot summaries") ||
      lower.includes("chapter summary") ||
      lower.includes("chapter summaries") ||
      lower.includes("what each chapter should do") ||
      lower.includes("what this chapter should do"),
    wantsNotes:
      lower.includes("note") ||
      lower.includes("notes") ||
      lower.includes("remember this") ||
      lower.includes("save this"),
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
  const actions: AssistantPlanAction[] = [];
  let nextTab: StoryForgeTab | null = null;

  if (input.applyChanges) {
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

    if (input.scope === "SKELETON" || lower.includes("midpoint") || lower.includes("doorway") || lower.includes("climax") || lower.includes("beat")) {
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

    if (input.scope === "SKELETON" && (lower.includes("scene") || lower.includes("goal") || lower.includes("conflict"))) {
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

    if (input.scope === "CHAPTER" || lower.includes("chapter") || lower.includes("draft") || lower.includes("book")) {
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
    "- UPDATE_PLOT_DIRECTION",
    "- UPDATE_STORY_BRIEF",
    "You may emit many actions in one response when the request affects multiple chapters or multiple planning layers.",
    "Use UPDATE_CHAPTER_FIELD or APPEND_CHAPTER_FIELD for writable chapter surfaces such as draft, outline, notes, title, purpose, currentBeat, desiredMood, keyBeats, requiredInclusions, forbiddenElements, and sceneList.",
    "Use chapterNumber when you need to target a specific chapter but do not know its chapterId.",
    "For chapter-writing actions, include fieldKey.",
    "If the user asks to add prose to the manuscript, use fieldKey draft.",
    "If the user asks to update or add to the outline, use fieldKey outline.",
    "If the user asks for chapter outlines, chapter names, chapter purposes, story skeleton planning, or book planning, prefer chapter title/purpose/currentBeat/outline/sceneList actions and skeleton actions.",
    "If the user asks to plan all chapters or each chapter, emit one action per chapter that needs updating.",
    "Do not create structure beats or scene cards unless the user explicitly asks for beats, scene cards, or structural milestones.",
    "Do not use APPEND_CHAPTER_NOTES or CREATE_WORKING_NOTE unless the user explicitly wants notes, reminders, or saved instructions.",
    "Do not write to draft/manuscript when the request is about planning, outlines, chapter titles, skeletons, setup, or bible work.",
    "If you are unsure which field should hold the content, leave content blank and still emit the correct structured action so a second writing step can generate the field safely.",
    "If the user asks for direct edits to the selected chapter text, prefer UPDATE_CHAPTER_FIELD on draft or outline instead of notes.",
    `If you emit a chapter field action, content should be the exact text to store when you can confidently provide it. If not, leave content blank and ${APP_NAME} will generate it.`,
    "Return strict JSON only with this shape:",
    '{"reply":"plain response","actions":[{"kind":"CREATE_IDEA_ENTRY","title":"...","content":"...","chapterId":"optional","chapterNumber":1,"fieldKey":"optional","structureType":"optional","sceneGoal":"optional","sceneConflict":"optional","sceneOutcome":"optional","outcomeType":"optional","locationHint":"optional","summary":"..."}],"nextTab":"ideaLab|setup|skeleton|chapters|bible|memory|continuity|settings|null"}',
    "Project snapshot:",
    JSON.stringify(summarizeProject(input.project, input.chapterId), null, 2),
    "User message:",
    input.message,
  ].join("\n\n");

  const raw = await generateTextWithProvider(prompt, { maxOutputTokens: 1100 });
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
      ? "Return only a strong chapter title, ideally 2 to 7 words. Do not include labels, chapter numbers, or quotation marks."
      : fieldKey === "purpose"
        ? "Return a compact 1 to 3 sentence statement of what this chapter must accomplish structurally and emotionally."
        : fieldKey === "currentBeat"
          ? "Return one sharp sentence describing the immediate dramatic movement of the chapter."
          : fieldKey === "desiredMood"
            ? "Return a short mood phrase, not a full paragraph."
            : fieldKey === "outline"
              ? "Return a commercially strong chapter outline with 5 to 9 concrete beats. Make it causally specific, escalating, and end with forward pull. Do not add commentary outside the outline."
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

  const generated = await generateTextWithProvider(fieldPrompt, {
    maxOutputTokens: fieldKey === "draft" ? 1800 : fieldKey === "outline" ? 900 : 700,
  });
  if (!generated?.trim()) {
    return input.action;
  }

  return {
    ...input.action,
    chapterId: resolvedChapterId,
    chapterNumber: chapter.number,
    fieldKey,
    content: cleanChapterFieldContent(input.project, chapter, fieldKey, generated.trim(), currentFieldValue),
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
      "If the chapter already has useful planning material, refine it instead of contradicting it.",
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
        const textValue = Array.isArray(rawValue)
          ? rawValue.map((entry) => String(entry ?? "").trim()).filter(Boolean).join("\n")
          : String(rawValue).trim();
        if (textValue) {
          return Promise.resolve({
            ...action,
            chapterId: input.chapter.id,
            chapterNumber: input.chapter.number,
            content: cleanChapterFieldContent(input.project, input.chapter, fieldKey, textValue, currentFieldValue),
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

    if (!nextTitle || seenTitles.has(nextTitle.toLowerCase())) {
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

  for (const group of groupedPlanningActions.values()) {
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
  ): { fieldKey: AssistFieldKey; patch: Parameters<typeof updateChapter>[1] } {
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
      };
    }

    if (fieldKey === "draft") {
      return {
        fieldKey,
        patch: {
          draft: cleanedValue,
          status: "REVISED",
        } as Parameters<typeof updateChapter>[1],
      };
    }

    return {
      fieldKey,
      patch: { [fieldKey]: cleanedValue } as Parameters<typeof updateChapter>[1],
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
      const { fieldKey, patch } = buildChapterFieldPatch(chapter, action);
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

  const fallbackPlan = buildFallbackPlan({ ...input, project });
  const livePlan = await buildLivePlan({ ...input, project });
  const rawPlan =
    livePlan &&
    !(
      input.applyChanges &&
      input.scope === "CHAPTER" &&
      input.chapterId &&
      !livePlan.actions.some((action) => isChapterAction(action.kind))
    )
      ? livePlan
      : fallbackPlan;
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
