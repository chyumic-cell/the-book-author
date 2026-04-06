import { APP_NAME } from "@/lib/brand";
import { buildContextPackage } from "@/lib/memory";
import { cleanGeneratedText, sanitizeManuscriptText } from "@/lib/ai-output";
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
  fieldKey?: AssistFieldKey;
  structureType?: string;
  sceneGoal?: string;
  sceneConflict?: string;
  sceneOutcome?: string;
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
        title: chapter.title,
        purpose: chapter.purpose,
        currentBeat: chapter.currentBeat,
        outline: chapter.outline,
        draftExcerpt: truncateText(chapter.draft, 900),
        notesExcerpt: truncateText(chapter.notes, 360),
        wordCount: chapter.wordCount,
      }
      : null,
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
  const prompt = [
    `You are ${APP_NAME}'s plain-language project copilot.`,
    "Speak clearly and directly. Do not sound robotic or verbose.",
    "Only propose actions that are clearly supported by the user's request.",
    "When the user asks to change writing directly, target the actual writable chapter field instead of saving the instruction as a note.",
    input.applyChanges
      ? "The user wants changes applied when the request clearly asks for them."
      : "The user wants advice only. Do not emit any actions.",
    `Current AI role: ${input.role}.`,
    `Current scope: ${normalizeScope(input.scope)}.`,
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
    "Use UPDATE_CHAPTER_FIELD or APPEND_CHAPTER_FIELD for writable chapter surfaces such as draft, outline, notes, title, purpose, currentBeat, desiredMood, keyBeats, requiredInclusions, forbiddenElements, and sceneList.",
    "For chapter-writing actions, include fieldKey.",
    "If the user asks to add prose to the manuscript, use fieldKey draft.",
    "If the user asks to update or add to the outline, use fieldKey outline.",
    "If the user asks for direct edits to the selected chapter text, prefer UPDATE_CHAPTER_FIELD on draft or outline instead of notes.",
    `If you emit a chapter field action, content should be the exact text to store when you can confidently provide it. If not, leave content blank and ${APP_NAME} will generate it.`,
    "Return strict JSON only with this shape:",
    '{"reply":"plain response","actions":[{"kind":"CREATE_IDEA_ENTRY","title":"...","content":"...","chapterId":"optional","fieldKey":"optional","structureType":"optional","sceneGoal":"optional","sceneConflict":"optional","sceneOutcome":"optional","summary":"..."}],"nextTab":"ideaLab|setup|skeleton|chapters|bible|memory|continuity|settings|null"}',
    "Project snapshot:",
    JSON.stringify(summarizeProject(input.project, input.chapterId), null, 2),
    "User message:",
    input.message,
  ].join("\n\n");

  const raw = await generateTextWithProvider(prompt, { maxOutputTokens: 1100 });
  if (!raw) {
    return null;
  }

  return parsePlan(raw);
}

async function materializeChapterFieldAction(input: {
  project: ProjectWorkspace;
  role: AiRole;
  message: string;
  chapterId: string | null;
  action: AssistantPlanAction;
}) {
  const fieldKey = input.action.fieldKey ?? (input.action.kind === "APPEND_CHAPTER_DRAFT" ? "draft" : undefined);
  const resolvedChapterId = input.action.chapterId ?? input.chapterId ?? null;
  if (!fieldKey || !resolvedChapterId) {
    return input.action;
  }

  const chapter = getChapterById(input.project, resolvedChapterId);
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

  const shouldGenerate =
    !input.action.content ||
    input.action.content.trim().length < 12 ||
    input.action.content.trim().toLowerCase() === input.message.trim().toLowerCase();

  if (!shouldGenerate) {
    return input.action;
  }

  const mode =
    input.action.kind === "APPEND_CHAPTER_FIELD" || input.action.kind === "APPEND_CHAPTER_DRAFT"
      ? "append"
      : "replace";
  const fieldContext = buildContextPackage(input.project, resolvedChapterId, currentFieldValue || truncateText(chapter.draft, 1200));
  const fieldPrompt = buildPromptEnvelope(
    `Update ${fieldLabel(fieldKey)}`,
    input.project,
    fieldContext,
    [
      `Target field: ${fieldLabel(fieldKey)}.`,
      `Mode: ${mode}.`,
      "Honor the project's style dials and written style notes while generating this field, especially the dialogue-versus-description balance.",
      "Return only the text to store in the target field. Do not add labels, explanations, markdown fences, or commentary.",
      mode === "append"
        ? "Write only the new text that should be appended. Do not repeat the existing field."
        : "Write the full replacement content for the field.",
      fieldKey === "draft"
        ? "Produce polished fiction prose that fits the current chapter and preserves continuity."
        : fieldKey === "outline"
          ? "Produce a compact, useful outline with beats or scene bullets that directly support the chapter."
          : `Write concise field content that fits naturally in ${APP_NAME}.`,
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
    fieldKey,
    content:
      fieldKey === "draft"
        ? sanitizeManuscriptText(generated.trim(), {
            chapterTitle: chapter.title,
            chapterNumber: chapter.number,
            previousChapterDrafts: input.project.chapters
              .filter((entry) => entry.number < chapter.number)
              .map((entry) => entry.draft)
              .filter(Boolean),
          }).text
        : cleanGeneratedText(generated.trim()),
  };
}

async function materializePlanActions(input: {
  project: ProjectWorkspace;
  role: AiRole;
  message: string;
  chapterId: string | null;
  actions: AssistantPlanAction[];
}) {
  return Promise.all(
    input.actions.map((action) =>
      action.kind === "UPDATE_CHAPTER_FIELD" ||
      action.kind === "APPEND_CHAPTER_FIELD" ||
      action.kind === "APPEND_CHAPTER_DRAFT"
        ? materializeChapterFieldAction({ ...input, action })
        : action,
    ),
  );
}

const CHAPTER_LIST_FIELDS = new Set<AssistFieldKey>([
  "keyBeats",
  "requiredInclusions",
  "forbiddenElements",
  "sceneList",
]);

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

  function resolveChapter(index: number, action: AssistantPlanAction) {
    const resolvedChapterId = action.chapterId ?? options?.defaultChapterId ?? null;

    if (!resolvedChapterId) {
      recordSkipped(index, action, "Project", "Skipped because no chapter was selected.");
      return null;
    }

    const chapter = getChapterById(workingProject, resolvedChapterId);
    if (!chapter) {
      recordSkipped(index, action, "Missing chapter", "Skipped because the target chapter no longer exists.");
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
    const cleanedValue =
      fieldKey === "draft"
        ? sanitizeManuscriptText(nextValue, {
            chapterTitle: chapter.title,
            chapterNumber: chapter.number,
            previousChapterDrafts: workingProject.chapters
              .filter((entry) => entry.number < chapter.number)
              .map((entry) => entry.draft)
              .filter(Boolean),
          }).text
        : cleanGeneratedText(nextValue);

    if (CHAPTER_LIST_FIELDS.has(fieldKey)) {
      return {
        fieldKey,
        patch: {
          [fieldKey]: cleanedValue.split(/\n|,/).map((entry) => entry.trim()).filter(Boolean),
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
      await mutateSkeleton(
        workingProject.id,
        {
          entityType: "structureBeat",
          payload: {
            chapterId: action.chapterId || null,
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
      await mutateSkeleton(
        workingProject.id,
        {
          entityType: "sceneCard",
          payload: {
            chapterId: action.chapterId || null,
            title: action.title || "New scene",
            summary: action.content || action.summary || "",
            goal: action.sceneGoal || "",
            conflict: action.sceneConflict || "",
            outcome: action.sceneOutcome || "",
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
  const plan =
    livePlan &&
    !(
      input.applyChanges &&
      input.scope === "CHAPTER" &&
      input.chapterId &&
      !livePlan.actions.some((action) => isChapterAction(action.kind))
    )
      ? livePlan
      : fallbackPlan;
  const materializedActions = input.applyChanges
    ? await materializePlanActions({
        project,
        role: input.role,
        message: input.message,
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
