import { runProjectAssistant, type AssistantPlanAction } from "@/lib/project-assistant";
import type {
  ContextPackage,
  ProjectChatActionRecord,
  ProjectChatScope,
  ProjectWorkspace,
  StoryForgeTab,
} from "@/types/storyforge";

export type BookAuthorBrainChange = {
  id: string;
  kind: string;
  targetLabel: string;
  currentValue?: string;
  proposedValue?: string;
  reason: string;
};

export type BookAuthorBrainQualityCheck = {
  id: string;
  label: string;
  status: "PASS" | "WARN" | "FAIL";
  summary: string;
};

export type BookAuthorBrainTokenBudget = {
  route: "fast" | "strong" | "mixed";
  reason: string;
};

export type BookAuthorBrainContract = {
  proposedChanges: BookAuthorBrainChange[];
  targetFields: string[];
  qualityChecks: BookAuthorBrainQualityCheck[];
  tokenBudget: BookAuthorBrainTokenBudget;
  requiresApproval: boolean;
  nextRecommendedAction: string;
};

function describeActionTarget(action: AssistantPlanAction | ProjectChatActionRecord, index: number) {
  if ("targetLabel" in action) {
    return action.targetLabel || `Change ${index + 1}`;
  }

  if (action.kind === "UPDATE_CHAPTER_FIELD" || action.kind === "APPEND_CHAPTER_FIELD") {
    const chapterLabel = action.chapterNumber ? `Chapter ${action.chapterNumber}` : "Chapter";
    return `${chapterLabel} ${action.fieldKey ?? "field"}`;
  }

  if (action.kind === "UPDATE_BOOK_SETUP") {
    return "Book Setup";
  }

  if (action.kind === "UPDATE_STYLE_PROFILE") {
    return "Style settings";
  }

  if (action.kind === "UPSERT_STORY_BIBLE_ENTITY") {
    return action.entityMatch || action.title || action.entityType || "Story Bible";
  }

  if (action.kind === "CREATE_STRUCTURE_BEAT") {
    return action.title || "Structure beat";
  }

  if (action.kind === "CREATE_SCENE_CARD") {
    return action.title || "Scene card";
  }

  return action.title || `Change ${index + 1}`;
}

function describeActionReason(action: AssistantPlanAction | ProjectChatActionRecord) {
  if ("summary" in action && action.summary) {
    return action.summary;
  }

  if ("fieldKey" in action && action.fieldKey) {
    return `Update the ${action.fieldKey} field so it matches the user request and current book context.`;
  }

  return "Apply the requested book-building change through the shared Book Author Brain.";
}

function actionTargetFields(actions: AssistantPlanAction[]) {
  return actions
    .map((action) => {
      if (action.kind === "UPDATE_CHAPTER_FIELD" || action.kind === "APPEND_CHAPTER_FIELD") {
        return action.fieldKey ? `chapter.${action.fieldKey}` : "chapter";
      }
      if (action.kind === "UPSERT_STORY_BIBLE_ENTITY") {
        return action.entityType ? `storyBible.${action.entityType}` : "storyBible";
      }
      if (action.kind === "UPDATE_BOOK_SETUP") {
        return "bookSetup";
      }
      if (action.kind === "UPDATE_STYLE_PROFILE") {
        return "styleProfile";
      }
      return action.kind.toLowerCase();
    })
    .filter(Boolean);
}

function buildQualityChecks(actions: AssistantPlanAction[], appliedActions: ProjectChatActionRecord[]) {
  const activeActions = actions.length ? actions : [];
  const applied = appliedActions.length;
  return [
    {
      id: "routing",
      label: "Field routing",
      status: activeActions.length || applied ? "PASS" : "WARN",
      summary: activeActions.length || applied
        ? "The request was converted into structured app targets."
        : "No app field changes were produced; this may be an advice-only response.",
    },
    {
      id: "approval",
      label: "Multi-field safety",
      status: activeActions.length > 1 ? "PASS" : "PASS",
      summary: activeActions.length > 1
        ? "Multiple proposed changes are available for approval before applying."
        : "This request has zero or one direct target.",
    },
  ] satisfies BookAuthorBrainQualityCheck[];
}

function buildTokenBudget(actions: AssistantPlanAction[]): BookAuthorBrainTokenBudget {
  const hasDraft = actions.some(
    (action) =>
      (action.kind === "UPDATE_CHAPTER_FIELD" || action.kind === "APPEND_CHAPTER_FIELD") &&
      action.fieldKey === "draft",
  );
  const hasManyPlanningFields = actions.length >= 4;

  if (hasDraft) {
    return {
      route: "strong",
      reason: "Manuscript drafting needs the stronger prose path.",
    };
  }

  if (hasManyPlanningFields) {
    return {
      route: "mixed",
      reason: "The request touches several planning fields, so routing stays small while generation is field-specific.",
    };
  }

  return {
    route: "fast",
    reason: "The request can be handled as targeted planning or a short field update.",
  };
}

export function buildBookAuthorBrainContract(options: {
  actions?: ProjectChatActionRecord[];
  proposedActions?: AssistantPlanAction[];
  requiresApproval?: boolean;
  nextRecommendedAction?: string;
}): BookAuthorBrainContract {
  const proposedActions = options.proposedActions ?? [];
  const appliedActions = options.actions ?? [];
  const sourceActions = proposedActions.length ? proposedActions : appliedActions;
  const proposedChanges = sourceActions.map((action, index) => ({
    id: `change-${index}`,
    kind: action.kind,
    targetLabel: describeActionTarget(action, index),
    proposedValue: "content" in action ? action.content : undefined,
    reason: describeActionReason(action),
  }));

  return {
    proposedChanges,
    targetFields: actionTargetFields(proposedActions),
    qualityChecks: buildQualityChecks(proposedActions, appliedActions),
    tokenBudget: buildTokenBudget(proposedActions),
    requiresApproval: Boolean(options.requiresApproval),
    nextRecommendedAction:
      options.nextRecommendedAction ??
      (proposedActions.length > 1
        ? "Review the proposed changes, then apply the ones you want."
        : "Continue writing, planning, or ask for another targeted AI update."),
  };
}

export async function runBookAuthorProjectBrain(input: {
  projectId: string;
  message: string;
  role: Parameters<typeof runProjectAssistant>[0]["role"];
  scope: ProjectChatScope;
  chapterId: string | null;
  applyChanges: boolean;
  previewOnly?: boolean;
  approvedActions?: AssistantPlanAction[];
}): Promise<{
  reply: string;
  actions: ProjectChatActionRecord[];
  proposedActions: AssistantPlanAction[];
  project: ProjectWorkspace;
  contextPackage: ContextPackage | null;
  scope: ProjectChatScope;
  nextTab: StoryForgeTab | null;
} & BookAuthorBrainContract> {
  const result = await runProjectAssistant(input);
  const actions = result.actions as ProjectChatActionRecord[];
  const proposedActions = (result.proposedActions ?? []) as AssistantPlanAction[];
  return {
    ...result,
    actions,
    proposedActions,
    ...buildBookAuthorBrainContract({
      actions,
      proposedActions,
      requiresApproval: result.requiresApproval,
    }),
  };
}

export function decorateBookAuthorBrainResult<T extends Record<string, unknown>>(
  payload: T,
  options: {
    targetFields?: string[];
    route?: BookAuthorBrainTokenBudget["route"];
    reason?: string;
    nextRecommendedAction?: string;
  } = {},
): T & BookAuthorBrainContract {
  return {
    ...payload,
    proposedChanges: [],
    targetFields: options.targetFields ?? [],
    qualityChecks: [
      {
        id: "single-target",
        label: "Targeted AI",
        status: "PASS",
        summary: "This AI call updates one focused area instead of routing a broad request.",
      },
    ],
    tokenBudget: {
      route: options.route ?? "fast",
      reason: options.reason ?? "Single-field work uses the small targeted path.",
    },
    requiresApproval: false,
    nextRecommendedAction: options.nextRecommendedAction ?? "Review the result in place and continue.",
  };
}
