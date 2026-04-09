"use client";

import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  type SyntheticEvent,
} from "react";

import TextareaAutosize from "react-textarea-autosize";
import { toast } from "sonner";

import { OpenRouterModelBadges } from "@/components/storyforge/openrouter-model-badges";
import { requestJson } from "@/components/storyforge/workspace-helpers";
import type { EditorState } from "@/components/storyforge/workspace-helpers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { APP_NAME } from "@/lib/brand";
import { getOpenRouterOptionLabel } from "@/lib/openrouter-model-display";
import { cn } from "@/lib/utils";
import type {
  AiAutopilotMode,
  AiRole,
  AssistActionType,
  AssistFieldKey,
  AssistMode,
  AssistSuggestion,
  AutopilotRunRecord,
  BestsellerGuideRecommendation,
  BestsellerGuideReport,
  OpenRouterModelRecord,
  ProjectWorkspace,
  ProviderSettingsRecord,
  StoryForgeTab,
} from "@/types/storyforge";

type SelectionRange = {
  selectionStart: number;
  selectionEnd: number;
  fieldKey: AssistFieldKey;
};

type ContextMenuState = SelectionRange & {
  x: number;
  y: number;
  hasSelection: boolean;
  fieldLabel: string;
};

type SuggestionApplyMode = "replace-selection" | "replace-draft" | "append" | "insert-at-cursor";

type PendingSuggestionTarget = SelectionRange & {
  applyMode: SuggestionApplyMode;
  sourceText: string;
};

type DiffSegment = {
  kind: "unchanged" | "added" | "removed";
  text: string;
};

type SmartPaneTab = "characters" | "arcs" | "summary" | "continuity" | "threads";

const FIELD_LABELS: Record<AssistFieldKey, string> = {
  title: "Chapter title",
  purpose: "Chapter purpose",
  currentBeat: "Current beat",
  keyBeats: "Key beats",
  requiredInclusions: "Required inclusions",
  forbiddenElements: "Forbidden elements",
  desiredMood: "Desired mood",
  sceneList: "Scene list",
  outline: "Chapter outline",
  draft: "Manuscript editor",
  notes: "Notes",
};

const BUSY_LABELS: Partial<Record<string, string>> = {
  outline: "Generating outline",
  draft: "Generating chapter",
  summary: "Summarizing chapter",
  extract: "Extracting memory",
  sync: "Syncing chapter to story",
  continuity: "Checking continuity",
  "guide-chapter": "Checking chapter against bestseller guide",
  "guide-book": "Checking whole book against bestseller guide",
  "guide-fix": "Preparing AI fix preview",
  "autopilot-start": "Running AI writing job",
  "autopilot-resume": "Resuming AI writing job",
  REVISE: "Revising chapter",
  EXPAND: "Expanding selection",
  TIGHTEN: "Tightening selection",
  IMPROVE_PROSE: "Improving prose",
  SHARPEN_VOICE: "Sharpening voice",
  ADD_TENSION: "Adding tension",
  ADD_DIALOGUE: "Adding dialogue",
  DESCRIPTION_TO_DIALOGUE: "Turning description into dialogue",
  CUSTOM_EDIT: "Applying custom instruction",
  CONTINUE: "Continuing from cursor",
  NEXT_BEATS: "Suggesting next beats",
  COACH: "Coaching",
};

const NON_EXPANDING_ASSIST_ACTIONS = new Set<AssistActionType>(["CONTINUE", "NEXT_BEATS", "COACH"]);
const SMART_PANE_TABS: Array<{ id: SmartPaneTab; label: string }> = [
  { id: "characters", label: "Characters" },
  { id: "arcs", label: "Arcs" },
  { id: "summary", label: "Summary" },
  { id: "continuity", label: "Continuity" },
  { id: "threads", label: "Threads" },
];

function ContextMenuButton({
  disabled,
  label,
  onClick,
}: {
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "w-full rounded-md px-3 py-2 text-left text-sm transition",
        disabled ? "cursor-not-allowed text-[var(--muted)] opacity-55" : "hover:bg-[color:var(--panel-soft)]",
      )}
      disabled={disabled}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function formatBusyLabel(busyAction: string) {
  return BUSY_LABELS[busyAction] ?? "Working with AI";
}

function tokenizeDiffText(value: string) {
  return value.match(/\s+|[^\s]+/g) ?? [];
}

function coalesceDiffSegments(segments: DiffSegment[]) {
  return segments.reduce<DiffSegment[]>((accumulator, segment) => {
    if (!segment.text) {
      return accumulator;
    }

    const previous = accumulator.at(-1);
    if (previous?.kind === segment.kind) {
      previous.text += segment.text;
      return accumulator;
    }

    accumulator.push({ ...segment });
    return accumulator;
  }, []);
}

function buildDiffSegments(previousText: string, nextText: string): DiffSegment[] {
  if (previousText === nextText) {
    return previousText ? [{ kind: "unchanged", text: previousText }] : [];
  }

  if (!previousText) {
    return nextText ? [{ kind: "added", text: nextText }] : [];
  }

  if (!nextText) {
    return previousText ? [{ kind: "removed", text: previousText }] : [];
  }

  const previousTokens = tokenizeDiffText(previousText);
  const nextTokens = tokenizeDiffText(nextText);

  if (previousTokens.length * nextTokens.length > 250000) {
    return coalesceDiffSegments([
      { kind: "removed", text: previousText },
      { kind: "added", text: nextText },
    ]);
  }

  const matrix = Array.from({ length: previousTokens.length + 1 }, () => new Uint16Array(nextTokens.length + 1));

  for (let previousIndex = previousTokens.length - 1; previousIndex >= 0; previousIndex -= 1) {
    for (let nextIndex = nextTokens.length - 1; nextIndex >= 0; nextIndex -= 1) {
      matrix[previousIndex][nextIndex] =
        previousTokens[previousIndex] === nextTokens[nextIndex]
          ? matrix[previousIndex + 1][nextIndex + 1] + 1
          : Math.max(matrix[previousIndex + 1][nextIndex], matrix[previousIndex][nextIndex + 1]);
    }
  }

  const segments: DiffSegment[] = [];
  let previousIndex = 0;
  let nextIndex = 0;

  while (previousIndex < previousTokens.length && nextIndex < nextTokens.length) {
    if (previousTokens[previousIndex] === nextTokens[nextIndex]) {
      segments.push({ kind: "unchanged", text: previousTokens[previousIndex] });
      previousIndex += 1;
      nextIndex += 1;
      continue;
    }

    if (matrix[previousIndex + 1][nextIndex] >= matrix[previousIndex][nextIndex + 1]) {
      segments.push({ kind: "removed", text: previousTokens[previousIndex] });
      previousIndex += 1;
      continue;
    }

    segments.push({ kind: "added", text: nextTokens[nextIndex] });
    nextIndex += 1;
  }

  while (previousIndex < previousTokens.length) {
    segments.push({ kind: "removed", text: previousTokens[previousIndex] });
    previousIndex += 1;
  }

  while (nextIndex < nextTokens.length) {
    segments.push({ kind: "added", text: nextTokens[nextIndex] });
    nextIndex += 1;
  }

  return coalesceDiffSegments(segments);
}

function buildInlineSuggestionSegments(target: PendingSuggestionTarget, suggestion: string): DiffSegment[] {
  const sourceText = target.sourceText;

  if (target.applyMode === "replace-draft") {
    return buildDiffSegments(sourceText, suggestion);
  }

  if (target.applyMode === "append") {
    return coalesceDiffSegments([
      { kind: "unchanged", text: sourceText },
      { kind: "added", text: `${sourceText ? "\n\n" : ""}${suggestion}` },
    ]);
  }

  if (target.applyMode === "insert-at-cursor") {
    return coalesceDiffSegments([
      { kind: "unchanged", text: sourceText.slice(0, target.selectionStart) },
      { kind: "added", text: suggestion },
      { kind: "unchanged", text: sourceText.slice(target.selectionStart) },
    ]);
  }

  return coalesceDiffSegments([
    { kind: "unchanged", text: sourceText.slice(0, target.selectionStart) },
    ...buildDiffSegments(sourceText.slice(target.selectionStart, target.selectionEnd), suggestion),
    { kind: "unchanged", text: sourceText.slice(target.selectionEnd) },
  ]);
}

function InlineSuggestionPreview({
  actionType,
  fieldLabel,
  manuscript,
  onAccept,
  onReject,
  segments,
  zoom,
}: {
  actionType: AssistActionType;
  fieldLabel: string;
  manuscript?: boolean;
  onAccept: () => void;
  onReject: () => void;
  segments: DiffSegment[];
  zoom?: number;
}) {
  const scale = (zoom ?? 100) / 100;

  return (
    <div className="grid h-full min-h-0" data-testid="inline-ai-preview">
      <div
        className={cn(
          "z-10 flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--line)] bg-[rgba(255,255,255,0.94)] px-6 py-4 backdrop-blur sm:px-8",
          manuscript && "sticky top-0",
        )}
      >
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Chip>{actionType}</Chip>
            <Chip>Green adds</Chip>
            <Chip>Red removes</Chip>
          </div>
          <p className="text-sm text-[var(--muted)]">Previewing the AI edit directly in {fieldLabel.toLowerCase()}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onAccept}>Accept</Button>
          <Button onClick={onReject} variant="secondary">
            Reject
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "storyforge-inline-preview whitespace-pre-wrap text-[var(--text)]",
          manuscript
            ? "manuscript-font h-[62vh] min-h-[34rem] overflow-y-auto px-8 py-10 sm:px-12 min-[960px]:h-[calc(100vh-22rem)]"
            : "max-h-[24rem] overflow-y-auto rounded-lg border border-[color:var(--line)] bg-[color:var(--panel-soft)] p-4 text-sm leading-7",
        )}
        style={
          manuscript
            ? {
                fontSize: `${18 * scale}px`,
                lineHeight: `${36 * scale}px`,
              }
            : undefined
        }
      >
        {segments.length > 0 ? (
          segments.map((segment, index) => (
            <span
              key={`${segment.kind}-${index}`}
              className={cn(
                segment.kind === "added" && "storyforge-inline-added",
                segment.kind === "removed" && "storyforge-inline-removed",
              )}
            >
              {segment.text}
            </span>
          ))
        ) : (
          <span className="text-[var(--muted)]">The AI did not produce a visible change for this edit.</span>
        )}
      </div>
    </div>
  );
}

function BestsellerGuideReviewCard({
  busy,
  onApplyRecommendation,
  onDismiss,
  onOpenChapter,
  report,
}: {
  busy: boolean;
  onApplyRecommendation: (recommendation: BestsellerGuideRecommendation) => void;
  onDismiss: () => void;
  onOpenChapter: (chapterId: string) => void;
  report: BestsellerGuideReport;
}) {
  return (
    <Card className="grid gap-4 border-[color:rgba(var(--accent-rgb),0.24)] bg-[rgba(var(--accent-rgb),0.045)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Chip>{report.scope === "CHAPTER" ? "Chapter guide review" : "Whole-book guide review"}</Chip>
            <Chip>{report.alignmentScore}/100</Chip>
            {report.sourceFramework.slice(0, 2).map((label) => (
              <Chip key={label}>{label}</Chip>
            ))}
          </div>
          <div>
            <h4 className="text-lg font-semibold">{report.verdict}</h4>
            <p className="mt-1 text-sm text-[var(--muted)]">{report.guideSummary}</p>
          </div>
        </div>
        <Button onClick={onDismiss} variant="ghost">
          Dismiss
        </Button>
      </div>

      <div className="grid gap-2">
        <strong className="text-sm text-[var(--text)]">What is already working</strong>
        <div className="flex flex-wrap gap-2">
          {report.strengths.length > 0 ? (
            report.strengths.map((strength) => <Chip key={strength}>{strength}</Chip>)
          ) : (
            <span className="text-sm text-[var(--muted)]">No strengths were captured yet.</span>
          )}
        </div>
      </div>

      <div className="grid gap-3">
        <strong className="text-sm text-[var(--text)]">What to add or fix</strong>
        {report.recommendations.length > 0 ? (
          report.recommendations.map((recommendation) => (
            <div
              key={recommendation.id}
              className="rounded-md border border-[color:var(--line)] bg-white/88 p-4 shadow-[0_12px_24px_var(--shadow)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm text-[var(--text)]">{recommendation.title}</strong>
                    <Chip>{recommendation.severity}</Chip>
                    {recommendation.targetChapterNumber ? (
                      <Chip>
                        Ch {recommendation.targetChapterNumber}
                        {recommendation.targetChapterTitle ? ` · ${recommendation.targetChapterTitle}` : ""}
                      </Chip>
                    ) : null}
                  </div>
                  <p className="text-sm text-[var(--muted)]">{recommendation.explanation}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recommendation.targetChapterId ? (
                    <Button onClick={() => onOpenChapter(recommendation.targetChapterId!)} variant="secondary">
                      Open chapter
                    </Button>
                  ) : null}
                  <Button disabled={busy} onClick={() => onApplyRecommendation(recommendation)}>
                    {busy ? "Building preview..." : "Fix with AI"}
                  </Button>
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-md border border-[color:var(--line)] bg-[color:var(--panel-soft)] p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Add this</div>
                  <p className="mt-2 text-sm text-[var(--text)]">{recommendation.whatToAdd}</p>
                </div>
                <div className="rounded-md border border-[color:var(--line)] bg-[color:var(--panel-soft)] p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Why it matters</div>
                  <p className="mt-2 text-sm text-[var(--text)]">{recommendation.whyItMatters}</p>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-md border border-[color:var(--line)] bg-[color:var(--panel-soft)] p-3 text-sm text-[var(--muted)]">
          {APP_NAME} did not surface any guide gaps in this pass.
          </div>
        )}
      </div>
    </Card>
  );
}

export function ChaptersTab({
  aiMode,
  project,
  editor,
  saveState,
  activeAiRole,
  assistMode,
  autopilotRun,
  pendingSuggestion,
  busyAction,
  manuscriptZoom,
  smartContextPaneWidth,
  summaryOutput,
  coachAdvice,
  phoneShell,
  selectedChapterId,
  editorRef,
  onSelectChapter,
  onAddChapter,
  onAutopilotRun,
  onEditorChange,
  onAssistModeChange,
  onAssist,
  onApplyGuideRecommendation,
  onToggleSmartContextPane,
  onBeginSmartContextResize,
  onResetSmartContextWidth,
  onDismissCoachAdvice,
  onDismissGuideReport,
  onOpenAiDock,
  onOpenProjectTab,
  onOpenProviders,
  onToggleOutlinePanel,
  onTogglePlanningPanel,
  onApplySuggestion,
  onDismissSuggestion,
  bestsellerGuideReport,
  showOutlinePanel,
  showPlanningPanel,
  showSmartContextPane,
}: {
  aiMode: string;
  project: ProjectWorkspace;
  editor: EditorState;
  saveState: "idle" | "saving" | "saved" | "error";
  activeAiRole: AiRole;
  assistMode: AssistMode;
  autopilotRun: AutopilotRunRecord | null;
  pendingSuggestion: AssistSuggestion | null;
  busyAction: string | null;
  manuscriptZoom: number;
  smartContextPaneWidth: number;
  summaryOutput: string;
  coachAdvice: string;
  phoneShell: boolean;
  selectedChapterId: string | null;
  editorRef: RefObject<HTMLTextAreaElement | null>;
  onSelectChapter: (chapterId: string) => void;
  onAddChapter: () => void;
  onAutopilotRun: (options: {
    action: "start" | "resume";
    mode: AiAutopilotMode;
    generalPrompt?: string;
  }) => void;
  onEditorChange: (patch: Partial<EditorState>) => void;
  onAssistModeChange: (mode: AssistMode) => void;
  onAssist: (
    actionType: AssistActionType,
    options?: {
      instructionOverride?: string;
      fieldKey?: AssistFieldKey;
      selectionStart?: number;
      selectionEnd?: number;
      selectionText?: string;
      beforeSelection?: string;
      afterSelection?: string;
      contextNote?: string;
    },
  ) => void;
  onApplyGuideRecommendation: (recommendation: BestsellerGuideRecommendation) => void;
  onToggleSmartContextPane: () => void;
  onBeginSmartContextResize: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onResetSmartContextWidth: () => void;
  onDismissCoachAdvice: () => void;
  onDismissGuideReport: () => void;
  onOpenAiDock: () => void;
  onOpenProjectTab: (tab: StoryForgeTab) => void;
  onOpenProviders: () => void;
  onToggleOutlinePanel: () => void;
  onTogglePlanningPanel: () => void;
  onApplySuggestion: (
    applyMode: "replace-selection" | "replace-draft" | "append" | "insert-at-cursor",
    fieldKey: AssistFieldKey,
    currentContent: string,
    selectionStart?: number,
    selectionEnd?: number,
  ) => void;
  onDismissSuggestion: () => void;
  bestsellerGuideReport: BestsellerGuideReport | null;
  showOutlinePanel: boolean;
  showPlanningPanel: boolean;
  showSmartContextPane: boolean;
}) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [selectionRange, setSelectionRange] = useState<SelectionRange>({
    selectionStart: 0,
    selectionEnd: 0,
    fieldKey: "draft",
  });
  const [pendingFieldKey, setPendingFieldKey] = useState<AssistFieldKey>("draft");
  const [providerSettings, setProviderSettings] = useState<ProviderSettingsRecord | null>(null);
  const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModelRecord[]>([]);
  const [smartPaneTab, setSmartPaneTab] = useState<SmartPaneTab>("characters");
  const [showCustomInstruction, setShowCustomInstruction] = useState(false);
  const [customInstruction, setCustomInstruction] = useState("");
  const [mobileGeneralPrompt, setMobileGeneralPrompt] = useState("");
  const [showPhoneDraftEditor, setShowPhoneDraftEditor] = useState(!phoneShell);
  const [pendingSuggestionTarget, setPendingSuggestionTarget] = useState<PendingSuggestionTarget | null>(null);
  const activeFieldRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const selectionRangeRef = useRef<SelectionRange>({
    selectionStart: 0,
    selectionEnd: 0,
    fieldKey: "draft",
  });
  const pendingSuggestionTargetRef = useRef<PendingSuggestionTarget | null>(null);
  const localClipboardRef = useRef("");

  const selectedChapter =
    project.chapters.find((chapter) => chapter.id === selectedChapterId) ??
    project.chapters.at(-1) ??
    null;
  const quickModelOptions = openRouterModels.slice(0, 36);
  const currentOpenRouterModel =
    providerSettings?.activeProvider === "OPENROUTER"
      ? openRouterModels.find((model) => model.id === providerSettings.openrouter.model) ?? null
      : null;
  const chapterLayoutStyle = showSmartContextPane
    ? ({
        "--chapter-context-width": `${smartContextPaneWidth}px`,
      } as CSSProperties)
    : undefined;
  const relatedCharacters = useMemo(() => {
    if (!selectedChapter) {
      return [];
    }

    const draftLower = selectedChapter.draft.toLowerCase();
    const povId = selectedChapter.povCharacterId;

    return project.characters
      .filter(
        (character) =>
          character.id === povId ||
          draftLower.includes(character.name.toLowerCase()) ||
          project.relationships.some(
            (relationship) =>
              (relationship.sourceCharacterId === povId && relationship.targetCharacterId === character.id) ||
              (relationship.targetCharacterId === povId && relationship.sourceCharacterId === character.id),
          ),
      )
      .map((character) => {
        const relation = project.relationships.find(
          (entry) =>
            (entry.sourceCharacterId === povId && entry.targetCharacterId === character.id) ||
            (entry.targetCharacterId === povId && entry.sourceCharacterId === character.id),
        );
        const group =
          relation?.kind === "ALLY"
            ? "Allies"
            : relation?.kind === "ENEMY"
              ? "Enemies"
              : relation?.kind === "RIVAL"
                ? "Rivals"
                : "Other";

        return {
          character,
          group,
          relation,
        };
      });
  }, [project.characters, project.relationships, selectedChapter]);

  function getFieldValue(fieldKey: AssistFieldKey) {
    return editor[fieldKey] ?? "";
  }

  function setSuggestionTarget(target: PendingSuggestionTarget | null) {
    pendingSuggestionTargetRef.current = target;
    setPendingSuggestionTarget(target);
  }

  function rememberSuggestionTarget(target: PendingSuggestionTarget) {
    setSuggestionTarget(target);
    return target;
  }

  function getDefaultApplyMode(
    actionType: AssistActionType,
    range: SelectionRange,
  ): SuggestionApplyMode {
    if (actionType === "CONTINUE" || actionType === "NEXT_BEATS") {
      return "insert-at-cursor";
    }

    return range.selectionStart === range.selectionEnd ? "insert-at-cursor" : "replace-selection";
  }

  function getParagraphRange(value: string, cursor: number) {
    if (!value.trim()) {
      return { selectionStart: 0, selectionEnd: 0 };
    }

    const previousBreak = value.lastIndexOf("\n\n", Math.max(0, cursor - 1));
    const nextBreak = value.indexOf("\n\n", cursor);

    return {
      selectionStart: previousBreak === -1 ? 0 : previousBreak + 2,
      selectionEnd: nextBreak === -1 ? value.length : nextBreak,
    };
  }

  function buildSelectionRange(
    fieldKey: AssistFieldKey,
    element: HTMLTextAreaElement | HTMLInputElement,
    fallbackToParagraph = false,
  ) {
    const value = element.value;
    const baseStart = element.selectionStart ?? 0;
    const baseEnd = element.selectionEnd ?? 0;
    const resolvedRange =
      fallbackToParagraph && baseStart === baseEnd
        ? getParagraphRange(value, baseStart)
        : { selectionStart: baseStart, selectionEnd: baseEnd };

    return {
      fieldKey,
      selectionStart: resolvedRange.selectionStart,
      selectionEnd: resolvedRange.selectionEnd,
    };
  }

  useEffect(() => {
    function handleGlobalDismiss(event: MouseEvent) {
      if (event.button === 2) {
        return;
      }

      if (contextMenuRef.current && event.target instanceof Node && contextMenuRef.current.contains(event.target)) {
        return;
      }

      setContextMenu(null);
    }

    function handleResize() {
      setContextMenu(null);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    }

    window.addEventListener("mousedown", handleGlobalDismiss);
    window.addEventListener("resize", handleResize);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handleGlobalDismiss);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    setContextMenu(null);
    setShowCustomInstruction(false);
    setCustomInstruction("");
    setSuggestionTarget(null);
  }, [selectedChapterId]);

  useEffect(() => {
    if (!pendingSuggestion) {
      setSuggestionTarget(null);
      return;
    }

    if (pendingSuggestionTargetRef.current) {
      if (!pendingSuggestionTarget) {
        setPendingSuggestionTarget(pendingSuggestionTargetRef.current);
      }
      return;
    }

    const fallbackFieldKey =
      pendingSuggestion.run.selectionText.trim().length > 0
        ? pendingFieldKey
        : pendingSuggestion.run.actionType === "OUTLINE"
          ? "outline"
          : "draft";
    const sourceText = editor[fallbackFieldKey] ?? "";
    setSuggestionTarget({
      fieldKey: fallbackFieldKey,
      selectionStart: 0,
      selectionEnd: sourceText.length,
      applyMode: "replace-draft",
      sourceText,
    });
  }, [editor, pendingFieldKey, pendingSuggestion, pendingSuggestionTarget]);

  useEffect(() => {
    async function loadModelControls() {
      try {
        const [settingsData, modelsData] = await Promise.all([
          requestJson<{ settings: ProviderSettingsRecord }>("/api/settings/providers"),
          requestJson<{ models: OpenRouterModelRecord[] }>("/api/settings/providers/openrouter-models"),
        ]);

        setProviderSettings(settingsData.settings);
        setOpenRouterModels(modelsData.models);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not load AI model controls.");
      }
    }

    void loadModelControls();
  }, []);

  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) {
      return;
    }

    const bounds = contextMenuRef.current.getBoundingClientRect();
    const nextX = Math.max(16, Math.min(contextMenu.x, window.innerWidth - bounds.width - 16));
    const nextY = Math.max(16, Math.min(contextMenu.y, window.innerHeight - bounds.height - 16));

    if (nextX === contextMenu.x && nextY === contextMenu.y) {
      return;
    }

    setContextMenu((current) => (current ? { ...current, x: nextX, y: nextY } : current));
  }, [contextMenu]);

  useEffect(() => {
    if (!pendingSuggestion || !pendingSuggestionTarget) {
      return;
    }

    const handle = window.requestAnimationFrame(() => {
      const preview = document.querySelector<HTMLElement>('[data-testid="inline-ai-preview"]');
      preview?.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
    });

    return () => {
      window.cancelAnimationFrame(handle);
    };
  }, [pendingSuggestion, pendingSuggestionTarget]);

  useEffect(() => {
    setShowPhoneDraftEditor(!phoneShell);
  }, [phoneShell, selectedChapter?.id]);

  useEffect(() => {
    if (phoneShell && pendingSuggestionTarget?.fieldKey === "draft") {
      setShowPhoneDraftEditor(true);
    }
  }, [pendingSuggestionTarget, phoneShell]);

  async function handleQuickModelSwitch(modelId: string) {
    if (!modelId) {
      return;
    }

    try {
      const data = await requestJson<{ settings: ProviderSettingsRecord }>("/api/settings/providers/model", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "OPENROUTER",
          model: modelId,
          activate: true,
        }),
      });

      setProviderSettings(data.settings);
      toast.success(`OpenRouter model switched to ${modelId}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not switch OpenRouter model.");
    }
  }

  function rememberSelection(
    fieldKey: AssistFieldKey,
    element: HTMLTextAreaElement | HTMLInputElement,
    fallbackToParagraph = false,
    syncState = false,
  ) {
    activeFieldRef.current = element;
    const nextRange = buildSelectionRange(fieldKey, element, fallbackToParagraph);
    selectionRangeRef.current = nextRange;
    if (syncState) {
      setSelectionRange(nextRange);
    }
    return nextRange;
  }

  function showContextMenu(
    fieldKey: AssistFieldKey,
    element: HTMLTextAreaElement | HTMLInputElement,
    clientX: number,
    clientY: number,
  ) {
    activeFieldRef.current = element;
    const liveRange = buildSelectionRange(fieldKey, element);
    const rememberedRange = selectionRangeRef.current;
    const nextRange =
      liveRange.selectionEnd > liveRange.selectionStart
        ? liveRange
        : rememberedRange.fieldKey === fieldKey && rememberedRange.selectionEnd > rememberedRange.selectionStart
          ? rememberedRange
          : liveRange;
    selectionRangeRef.current = nextRange;
    setSelectionRange(nextRange);
    const menuWidth = 320;
    const menuHeight = Math.min(window.innerHeight * 0.85, 560);
    const safeLeft = Math.max(16, Math.min(clientX, window.innerWidth - menuWidth - 16));
    const safeTop = Math.max(16, Math.min(clientY, window.innerHeight - menuHeight - 16));

    setShowCustomInstruction(false);
    setCustomInstruction("");

    setContextMenu({
      x: safeLeft,
      y: safeTop,
      fieldLabel: FIELD_LABELS[fieldKey],
      hasSelection: nextRange.selectionEnd > nextRange.selectionStart,
      ...nextRange,
    });

    window.requestAnimationFrame(() => {
      restoreSelection(nextRange);
    });
  }

  function restoreSelection(range?: SelectionRange) {
    const field = activeFieldRef.current;
    if (!field) {
      return;
    }

    const nextRange = range ?? selectionRangeRef.current ?? selectionRange;
    field.focus();
    field.setSelectionRange(nextRange.selectionStart, nextRange.selectionEnd);
  }

  async function copySelection() {
    if (selectionRange.selectionEnd <= selectionRange.selectionStart) {
      return;
    }

    const selectedText = getFieldValue(selectionRange.fieldKey).slice(
      selectionRange.selectionStart,
      selectionRange.selectionEnd,
    );
    localClipboardRef.current = selectedText;

    try {
      await navigator.clipboard.writeText(selectedText);
      toast.success("Selection copied.");
    } catch {
      toast.success("Selection copied inside the app.");
    } finally {
      setContextMenu(null);
    }
  }

  async function cutSelection() {
    if (selectionRange.selectionEnd <= selectionRange.selectionStart) {
      return;
    }

    const selectedText = getFieldValue(selectionRange.fieldKey).slice(
      selectionRange.selectionStart,
      selectionRange.selectionEnd,
    );
    localClipboardRef.current = selectedText;

    try {
      const currentValue = getFieldValue(selectionRange.fieldKey);
      await navigator.clipboard.writeText(selectedText);
      const nextValue =
        currentValue.slice(0, selectionRange.selectionStart) + currentValue.slice(selectionRange.selectionEnd);
      onEditorChange({ [selectionRange.fieldKey]: nextValue } as Partial<EditorState>);
      setSelectionRange({
        fieldKey: selectionRange.fieldKey,
        selectionStart: selectionRange.selectionStart,
        selectionEnd: selectionRange.selectionStart,
      });
      window.requestAnimationFrame(() => {
        restoreSelection({
          fieldKey: selectionRange.fieldKey,
          selectionStart: selectionRange.selectionStart,
          selectionEnd: selectionRange.selectionStart,
        });
      });
      toast.success("Selection cut.");
    } catch {
      const currentValue = getFieldValue(selectionRange.fieldKey);
      const nextValue =
        currentValue.slice(0, selectionRange.selectionStart) + currentValue.slice(selectionRange.selectionEnd);
      onEditorChange({ [selectionRange.fieldKey]: nextValue } as Partial<EditorState>);
      setSelectionRange({
        fieldKey: selectionRange.fieldKey,
        selectionStart: selectionRange.selectionStart,
        selectionEnd: selectionRange.selectionStart,
      });
      window.requestAnimationFrame(() => {
        restoreSelection({
          fieldKey: selectionRange.fieldKey,
          selectionStart: selectionRange.selectionStart,
          selectionEnd: selectionRange.selectionStart,
        });
      });
      toast.success("Selection cut inside the app.");
    } finally {
      setContextMenu(null);
    }
  }

  async function pasteClipboard() {
    let clipboardText = localClipboardRef.current;

    try {
      const systemClipboard = await navigator.clipboard.readText();
      if (systemClipboard) {
        clipboardText = systemClipboard;
        localClipboardRef.current = systemClipboard;
      }
    } catch {
      // Fall back to the app-local clipboard when the browser blocks system clipboard access.
    }

    if (!clipboardText) {
      toast.error("Clipboard paste was blocked by the browser and the app clipboard is empty.");
      setContextMenu(null);
      return;
    }

    try {
      const currentValue = getFieldValue(selectionRange.fieldKey);
      const nextValue =
        currentValue.slice(0, selectionRange.selectionStart) +
        clipboardText +
        currentValue.slice(selectionRange.selectionEnd);
      const cursor = selectionRange.selectionStart + clipboardText.length;
      onEditorChange({ [selectionRange.fieldKey]: nextValue } as Partial<EditorState>);
      setSelectionRange({
        fieldKey: selectionRange.fieldKey,
        selectionStart: cursor,
        selectionEnd: cursor,
      });
      window.requestAnimationFrame(() => {
        restoreSelection({ fieldKey: selectionRange.fieldKey, selectionStart: cursor, selectionEnd: cursor });
      });
      toast.success("Clipboard pasted.");
    } catch {
      toast.error("Clipboard paste failed.");
    } finally {
      setContextMenu(null);
    }
  }

  function resolveAssistRange(fieldKey: AssistFieldKey, actionType: AssistActionType, currentValue: string) {
    const activeField = activeFieldRef.current;
    const liveRange =
      activeField && (activeField instanceof HTMLInputElement || activeField instanceof HTMLTextAreaElement)
        ? buildSelectionRange(fieldKey, activeField)
        : null;
    const baseRange =
      contextMenu?.fieldKey === fieldKey
        ? contextMenu
        : liveRange?.fieldKey === fieldKey
          ? liveRange
          : selectionRange.fieldKey === fieldKey
            ? selectionRange
            : {
                fieldKey,
                selectionStart: 0,
                selectionEnd: 0,
              };

    if (
      baseRange.selectionStart === baseRange.selectionEnd &&
      !NON_EXPANDING_ASSIST_ACTIONS.has(actionType)
    ) {
      const paragraphRange = getParagraphRange(currentValue, baseRange.selectionStart);
      return {
        fieldKey,
        selectionStart: paragraphRange.selectionStart,
        selectionEnd: paragraphRange.selectionEnd,
      };
    }

    return {
      fieldKey,
      selectionStart: baseRange.selectionStart,
      selectionEnd: baseRange.selectionEnd,
    };
  }

  function runAssist(actionType: AssistActionType, instructionOverride?: string, fieldKey?: AssistFieldKey) {
    const activeFieldKey = fieldKey ?? contextMenu?.fieldKey ?? selectionRange.fieldKey;
    const currentValue = getFieldValue(activeFieldKey);
    const range = resolveAssistRange(activeFieldKey, actionType, currentValue);

    setPendingFieldKey(activeFieldKey);
    setSelectionRange(range);
    if (actionType !== "COACH") {
      rememberSuggestionTarget({
        ...range,
        applyMode: getDefaultApplyMode(actionType, range),
        sourceText: currentValue,
      });
    }
    window.requestAnimationFrame(() => {
      restoreSelection(range);
      onAssist(actionType, {
        instructionOverride:
          activeFieldKey === "draft"
            ? instructionOverride
            : `${instructionOverride || `Apply ${actionType.toLowerCase()} to the selected text.`} Only change the ${FIELD_LABELS[
                activeFieldKey
              ].toLowerCase()} field.`,
        fieldKey: activeFieldKey,
        selectionStart: range.selectionStart,
        selectionEnd: range.selectionEnd,
        selectionText: currentValue.slice(range.selectionStart, range.selectionEnd),
        beforeSelection: currentValue.slice(0, range.selectionStart),
        afterSelection: currentValue.slice(range.selectionEnd),
        contextNote: `${selectedChapter?.currentBeat || ""} | Field: ${FIELD_LABELS[activeFieldKey]}`,
      });
    });
    setContextMenu(null);
  }

  function runCustomAssist() {
    const instruction = customInstruction.trim();
    if (!instruction) {
      toast.error(`Write what you want ${APP_NAME} to do to the selected text first.`);
      return;
    }

    runAssist("CUSTOM_EDIT", instruction, contextMenu?.fieldKey ?? selectionRange.fieldKey);
    setCustomInstruction("");
    setShowCustomInstruction(false);
  }

  function getAssistableTextProps(fieldKey: AssistFieldKey) {
    return {
      onFocus: (event: FocusEvent<HTMLTextAreaElement | HTMLInputElement>) => {
        rememberSelection(fieldKey, event.currentTarget);
      },
      onMouseUp: (event: ReactMouseEvent<HTMLTextAreaElement | HTMLInputElement>) => {
        rememberSelection(fieldKey, event.currentTarget);
      },
      onKeyUp: (event: SyntheticEvent<HTMLTextAreaElement | HTMLInputElement>) => {
        rememberSelection(fieldKey, event.currentTarget);
      },
      onContextMenu: (event: ReactMouseEvent<HTMLTextAreaElement | HTMLInputElement>) => {
        event.preventDefault();
        event.stopPropagation();
        showContextMenu(fieldKey, event.currentTarget, event.clientX, event.clientY);
      },
      onDragStart: (event: ReactMouseEvent<HTMLTextAreaElement | HTMLInputElement>) => {
        event.preventDefault();
      },
      draggable: false,
    };
  }

  function getSuggestionPreview(fieldKey: AssistFieldKey) {
    const target = pendingSuggestionTarget ?? pendingSuggestionTargetRef.current;
    if (!pendingSuggestion || !target || target.fieldKey !== fieldKey) {
      return null;
    }

    return {
      actionType: pendingSuggestion.run.actionType,
      fieldLabel: FIELD_LABELS[fieldKey],
      segments: buildInlineSuggestionSegments(target, pendingSuggestion.run.suggestion),
      target,
    };
  }

  function acceptSuggestionPreview(fieldKey: AssistFieldKey) {
    const preview = getSuggestionPreview(fieldKey);
    if (!preview) {
      return;
    }

    void onApplySuggestion(
      preview.target.applyMode,
      fieldKey,
      preview.target.sourceText,
      preview.target.selectionStart,
      preview.target.selectionEnd,
    );
  }

  function dismissSuggestionPreview() {
    setPendingFieldKey("draft");
    setSuggestionTarget(null);
    onDismissSuggestion();
  }

  function renderInlinePreview(fieldKey: AssistFieldKey, options?: { manuscript?: boolean; zoom?: number }) {
    const preview = getSuggestionPreview(fieldKey);
    if (!preview) {
      return null;
    }

    return (
      <InlineSuggestionPreview
        actionType={preview.actionType}
        fieldLabel={preview.fieldLabel}
        manuscript={options?.manuscript}
        onAccept={() => acceptSuggestionPreview(fieldKey)}
        onReject={dismissSuggestionPreview}
        segments={preview.segments}
        zoom={options?.zoom}
      />
    );
  }

  const draftSuggestionPreview = getSuggestionPreview("draft");
  const outlineSuggestionPreview = getSuggestionPreview("outline");
  const autopilotBusy = busyAction === "autopilot-start" || busyAction === "autopilot-resume";

  return (
    <div className="grid h-full min-h-0 gap-4">
      <Card className="grid gap-0 overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--line)] bg-[color:var(--panel-soft)] px-4 py-3">
          <div>
            <h3 className="text-2xl font-semibold">Chapter Workspace</h3>
            <p className="text-sm text-[var(--muted)]">
              Write directly on the manuscript page, then use AI as a boost, reviewer, or full drafting partner when you want it.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip>{activeAiRole}</Chip>
            {(["FREE_WRITE", "CO_WRITE", "FULL_AUTHOR"] as const).map((mode) => (
              <Button
                key={mode}
                className={cn(assistMode === mode && "ring-2 ring-[rgba(225,166,108,0.45)]")}
                onClick={() => onAssistModeChange(mode)}
                variant={assistMode === mode ? "primary" : "secondary"}
              >
                {mode === "FREE_WRITE" ? "Free write" : mode === "CO_WRITE" ? "Co-write" : "Full author"}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto border-b border-[color:var(--line)] bg-white px-4 py-3 min-[960px]:hidden">
          {project.chapters.map((chapter) => (
            <button
              key={chapter.id}
              className={cn(
                "shrink-0 rounded-md border px-3 py-2 text-sm font-semibold transition",
                selectedChapter?.id === chapter.id
                  ? "border-[color:rgba(var(--accent-rgb),0.35)] bg-[rgba(var(--accent-rgb),0.08)] text-[var(--accent)]"
                  : "border-[color:var(--line)] bg-white text-[var(--muted)] hover:border-[color:rgba(var(--accent-rgb),0.2)] hover:bg-[color:var(--panel-soft)] hover:text-[var(--text)]",
              )}
              onClick={() => onSelectChapter(chapter.id)}
              type="button"
            >
              Ch. {chapter.number} {chapter.title}
            </button>
          ))}
          <Button onClick={onAddChapter} variant="secondary">
            Add chapter
          </Button>
        </div>

        {selectedChapter ? (
          <div
            className={cn(
              "grid min-h-0 gap-4 p-4 min-[960px]:overflow-hidden",
              showSmartContextPane
                ? "grid-cols-1 min-[960px]:[grid-template-columns:minmax(0,1fr)_12px_var(--chapter-context-width)]"
                : "grid-cols-1",
            )}
            style={chapterLayoutStyle}
          >
            <div className="grid min-w-0 gap-4 min-[960px]:min-h-0 min-[960px]:overflow-y-auto min-[960px]:pr-2">
              <div className="flex flex-wrap items-center gap-2">
                <Chip>Autosave: {saveState}</Chip>
                <Chip>{editor.draft.trim() ? editor.draft.trim().split(/\s+/).length : 0} words</Chip>
                <Chip>{selectedChapter.status}</Chip>
                <Chip>{manuscriptZoom}% zoom</Chip>
                <Chip>Right-click selected text for AI tools</Chip>
                {busyAction ? (
                  <Chip className="gap-2">
                    <span aria-hidden="true" className="storyforge-spinner" />
                    <span>{formatBusyLabel(busyAction)}</span>
                  </Chip>
                ) : null}
                <Button onClick={onAddChapter} variant="secondary">
                  Add chapter
                </Button>
                <Button onClick={onToggleOutlinePanel} variant="secondary">
                  {showOutlinePanel ? "Hide outline" : "Open outline"}
                </Button>
                <Button onClick={onTogglePlanningPanel} variant="secondary">
                  {showPlanningPanel ? "Hide planning" : "Open planning"}
                </Button>
              </div>

              {phoneShell ? (
                <Card className="grid gap-4 border-[color:rgba(var(--accent-rgb),0.22)] bg-[rgba(var(--accent-rgb),0.045)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="grid gap-1">
                      <h4 className="text-lg font-semibold">AI Writing Studio</h4>
                      <p className="text-sm text-[var(--muted)]">
                        On phones, let AI handle the drafting while you stay focused on setup, bible, outline, and skeleton decisions.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Chip>{autopilotRun ? `Run: ${autopilotRun.status.toLowerCase()}` : "No active run"}</Chip>
                      {busyAction ? <Chip>{formatBusyLabel(busyAction)}</Chip> : null}
                    </div>
                  </div>

                  {aiMode === "AI setup required" ? (
                    <div className="rounded-lg border border-[color:var(--line)] bg-white/80 p-3 text-sm text-[var(--muted)]">
                      AI drafting is locked on this device until you add your own key.
                      <div className="mt-3">
                        <Button onClick={onOpenProviders} variant="secondary">
                          Add AI key
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <TextareaAutosize
                    className="min-h-[104px] resize-none"
                    minRows={4}
                placeholder={`Optional general prompt: tell ${APP_NAME} the kind of chapter or whole-book writing pass you want, and it will use the chapter plan, bible, skeleton, and memory as the source of truth.`}
                    value={mobileGeneralPrompt}
                    onChange={(event) => setMobileGeneralPrompt(event.target.value)}
                  />

                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      disabled={autopilotBusy || aiMode === "AI setup required"}
                      onClick={() =>
                        onAutopilotRun({
                          action: "start",
                          mode: "CURRENT_CHAPTER",
                          generalPrompt: mobileGeneralPrompt,
                        })
                      }
                    >
                      AI write this chapter
                    </Button>
                    <Button
                      disabled={autopilotBusy || aiMode === "AI setup required"}
                      onClick={() =>
                        onAutopilotRun({
                          action: "start",
                          mode: "BOOK",
                          generalPrompt: mobileGeneralPrompt,
                        })
                      }
                      variant="secondary"
                    >
                      AI do the rest
                    </Button>
                    <Button
                      disabled={!autopilotRun || autopilotRun.status === "COMPLETED" || autopilotBusy || aiMode === "AI setup required"}
                      onClick={() =>
                        onAutopilotRun({
                          action: "resume",
                          mode: autopilotRun?.mode ?? "BOOK",
                          generalPrompt: mobileGeneralPrompt || autopilotRun?.generalPrompt || "",
                        })
                      }
                      variant="secondary"
                    >
                      Resume paused run
                    </Button>
                    <Button onClick={onOpenAiDock} variant="secondary">
                      Open AI dock
                    </Button>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button onClick={() => onOpenProjectTab("setup")} variant="ghost">
                      Book setup
                    </Button>
                    <Button onClick={() => onOpenProjectTab("bible")} variant="ghost">
                      Story bible
                    </Button>
                    <Button onClick={() => onOpenProjectTab("skeleton")} variant="ghost">
                      Story skeleton
                    </Button>
                    <Button onClick={onToggleOutlinePanel} variant="ghost">
                      {showOutlinePanel ? "Hide outline" : "Open outline"}
                    </Button>
                  </div>

                  {autopilotRun?.lastMessage ? (
                    <div className="rounded-lg border border-[color:var(--line)] bg-white/75 p-3 text-sm text-[var(--muted)]">
                      <strong className="text-[var(--text)]">Run status:</strong> {autopilotRun.lastMessage}
                      {autopilotRun.lastError ? (
                        <p className="mt-2 text-[var(--danger)]">{autopilotRun.lastError}</p>
                      ) : null}
                    </div>
                  ) : null}
                </Card>
              ) : null}

              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-lg font-semibold">Manuscript Page</h4>
                    <p className="text-sm text-[var(--muted)]">
                      The draft stays on top. Outline and planning are tucked away until you need them.
                    </p>
                  </div>
                  {busyAction ? (
                    <div className="inline-flex items-center gap-2 rounded-full border border-[color:rgba(var(--accent-rgb),0.18)] bg-[rgba(var(--accent-rgb),0.06)] px-3 py-1.5 text-sm text-[var(--accent)]">
                      <span aria-hidden="true" className="storyforge-spinner" />
                      <span>{formatBusyLabel(busyAction)}...</span>
                    </div>
                  ) : null}
                </div>

                <div className="workspace-canvas relative rounded-xl border border-[color:var(--line)] p-4 sm:p-6">
                  {phoneShell && !showPhoneDraftEditor ? (
                    <div className="mx-auto grid w-full max-w-[920px] gap-4">
                      <Card className="grid gap-3 border-[color:var(--line)] bg-white/90 p-5">
                        <div className="grid gap-1">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                            Chapter {selectedChapter.number}
                          </p>
                          <h3 className="text-2xl font-semibold text-[var(--text)]">
                            {editor.title || selectedChapter.title || `Chapter ${selectedChapter.number}`}
                          </h3>
                          <p className="text-sm text-[var(--muted)]">
                            Manual drafting is tucked away on phones so AI writing can stay front and center.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button onClick={() => setShowPhoneDraftEditor(true)}>Open manuscript editor</Button>
                          <Button onClick={onToggleOutlinePanel} variant="secondary">
                            {showOutlinePanel ? "Hide outline" : "Open outline"}
                          </Button>
                          <Button onClick={onTogglePlanningPanel} variant="secondary">
                            {showPlanningPanel ? "Hide planning" : "Open planning"}
                          </Button>
                        </div>
                      </Card>
                    </div>
                  ) : (
                    <div className="paper-sheet mx-auto w-full max-w-[920px] rounded-[4px]">
                    <div className="border-b border-[color:var(--line)] px-8 py-5 sm:px-12">
                      <div className="grid gap-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                          Chapter {selectedChapter.number}
                        </p>
                        <h3 className="text-2xl font-semibold text-[var(--text)]">
                          {editor.title || selectedChapter.title || `Chapter ${selectedChapter.number}`}
                        </h3>
                        {phoneShell ? (
                          <div className="pb-1">
                            <Button onClick={() => setShowPhoneDraftEditor(false)} variant="secondary">
                              Hide manuscript
                            </Button>
                          </div>
                        ) : null}
                        <p className="text-sm text-[var(--muted)]">
                          {selectedChapter.povCharacterId
                            ? `POV ready • target ${editor.targetWordCount.toLocaleString()} words`
                            : `Target ${editor.targetWordCount.toLocaleString()} words`}
                        </p>
                      </div>
                    </div>

                    <div className="relative">
                      {draftSuggestionPreview ? (
                        <InlineSuggestionPreview
                          actionType={draftSuggestionPreview.actionType}
                          fieldLabel={draftSuggestionPreview.fieldLabel}
                          manuscript
                          onAccept={() => acceptSuggestionPreview("draft")}
                          onReject={dismissSuggestionPreview}
                          segments={draftSuggestionPreview.segments}
                          zoom={manuscriptZoom}
                        />
                      ) : (
                        <textarea
                          {...getAssistableTextProps("draft")}
                          aria-label="Manuscript editor"
                          data-testid="manuscript-editor"
                          draggable={false}
                          ref={editorRef}
                          className="manuscript-font h-[62vh] min-h-[34rem] w-full resize-none overflow-y-auto !border-0 !bg-transparent px-8 py-10 text-[18px] leading-9 !shadow-none focus:!shadow-none focus:ring-0 sm:px-12 min-[960px]:h-[calc(100vh-22rem)]"
                          style={{
                            fontSize: `${18 * (manuscriptZoom / 100)}px`,
                            lineHeight: `${36 * (manuscriptZoom / 100)}px`,
                          }}
                          value={editor.draft}
                          onChange={(event) => onEditorChange({ draft: event.target.value })}
                        />
                      )}

                      {contextMenu ? (
                        <div
                          className="fixed z-[70] w-[320px] max-h-[min(85vh,560px)] overflow-y-auto rounded-lg border border-[color:var(--line-strong)] bg-[color:var(--panel)] p-2 shadow-[0_24px_50px_var(--shadow)]"
                          data-testid="chapter-context-menu"
                          ref={contextMenuRef}
                          style={{ left: contextMenu.x, top: contextMenu.y }}
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <div className="mb-2 border-b border-[color:var(--line)] px-2 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                            Writing tools for {contextMenu.fieldLabel}
                          </div>
                          {providerSettings?.activeProvider === "OPENROUTER" ? (
                            <div className="px-2 pb-2">
                              <label className="grid gap-1 text-xs">
                                <span className="text-[var(--muted)]">OpenRouter model</span>
                                <select
                                  value={providerSettings.openrouter.model}
                                  onChange={(event) => void handleQuickModelSwitch(event.target.value)}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  {quickModelOptions.map((model) => (
                                    <option key={model.id} value={model.id}>
                                      {getOpenRouterOptionLabel(model)}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              {currentOpenRouterModel ? (
                                <div className="mt-2">
                                  <OpenRouterModelBadges model={currentOpenRouterModel} showContext={false} />
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          <div className="grid gap-1">
                            <ContextMenuButton disabled={!contextMenu.hasSelection} label="Copy" onClick={() => void copySelection()} />
                            <ContextMenuButton disabled={!contextMenu.hasSelection} label="Cut" onClick={() => void cutSelection()} />
                            <ContextMenuButton label="Paste" onClick={() => void pasteClipboard()} />
                            <div className="my-1 border-t border-[color:var(--line)]" />
                            <ContextMenuButton
                              label={contextMenu.hasSelection ? "Expand with AI" : "Expand current paragraph"}
                              onClick={() => runAssist("EXPAND", undefined, contextMenu.fieldKey)}
                            />
                            <ContextMenuButton
                              label={contextMenu.hasSelection ? "Tighten with AI" : "Tighten current paragraph"}
                              onClick={() => runAssist("TIGHTEN", undefined, contextMenu.fieldKey)}
                            />
                            <ContextMenuButton
                              label={contextMenu.hasSelection ? "Improve prose" : "Improve current paragraph"}
                              onClick={() => runAssist("IMPROVE_PROSE", undefined, contextMenu.fieldKey)}
                            />
                            <ContextMenuButton
                              label={contextMenu.hasSelection ? "Add tension" : "Add tension here"}
                              onClick={() => runAssist("ADD_TENSION", undefined, contextMenu.fieldKey)}
                            />
                            <ContextMenuButton
                              label={contextMenu.hasSelection ? "Add dialogue" : "Add dialogue here"}
                              onClick={() => runAssist("ADD_DIALOGUE", undefined, contextMenu.fieldKey)}
                            />
                            <ContextMenuButton
                              label={contextMenu.hasSelection ? "Description to dialogue" : "Turn this into dialogue"}
                              onClick={() => runAssist("DESCRIPTION_TO_DIALOGUE", undefined, contextMenu.fieldKey)}
                            />
                            <ContextMenuButton
                              label={contextMenu.hasSelection ? "Sharpen voice" : "Sharpen this beat"}
                              onClick={() => runAssist("SHARPEN_VOICE", undefined, contextMenu.fieldKey)}
                            />
                            <ContextMenuButton
                              label="Continue from cursor"
                              onClick={() => runAssist("CONTINUE", undefined, contextMenu.fieldKey)}
                            />
                            <ContextMenuButton
                              label="Suggest next beats"
                              onClick={() => runAssist("NEXT_BEATS", undefined, contextMenu.fieldKey)}
                            />
                            <ContextMenuButton
                              label={contextMenu.hasSelection ? "Coach this selection" : "Coach this moment"}
                              onClick={() =>
                                runAssist(
                                  "COACH",
                                  contextMenu.hasSelection
                                    ? "Give plain-language advice about this highlighted passage only. Explain what works, what is weak, and how to strengthen it without rewriting unless asked."
                                    : "Give plain-language coaching for this exact part of the chapter or outline. Focus on what should happen next and why.",
                                  contextMenu.fieldKey,
                                )
                              }
                            />
                            <div className="my-1 border-t border-[color:var(--line)]" />
                            <ContextMenuButton
                              label={showCustomInstruction ? "Hide custom instruction" : "Custom AI instruction"}
                              onClick={() => setShowCustomInstruction((current) => !current)}
                            />
                            {showCustomInstruction ? (
                              <div className="grid gap-2 px-2 py-2">
                                <TextareaAutosize
                                  className="min-h-[84px] resize-none text-sm"
                                  minRows={3}
                    placeholder={`Tell ${APP_NAME} exactly what to do to the selected text...`}
                                  value={customInstruction}
                                  onChange={(event) => setCustomInstruction(event.target.value)}
                                  onMouseDown={(event) => event.stopPropagation()}
                                  onClick={(event) => event.stopPropagation()}
                                />
                                <div className="flex gap-2">
                                  <Button
                                    className="flex-1"
                                    disabled={!customInstruction.trim()}
                                    onClick={runCustomAssist}
                                    type="button"
                                  >
                                    Run custom edit
                                  </Button>
                                  <Button
                                    onClick={() => {
                                      setCustomInstruction("");
                                      setShowCustomInstruction(false);
                                    }}
                                    type="button"
                                    variant="secondary"
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--panel-soft)] px-4 py-3 text-sm text-[var(--muted)]">
                Chapter AI tools now live in the ribbon under <strong className="text-[var(--text)]">AI Engine</strong>.
                Review and sync actions live in <strong className="text-[var(--text)]">Review</strong>, so the manuscript area stays cleaner while you write.
              </div>

              {bestsellerGuideReport ? (
                <BestsellerGuideReviewCard
                  busy={busyAction === "guide-fix"}
                  onApplyRecommendation={onApplyGuideRecommendation}
                  onDismiss={onDismissGuideReport}
                  onOpenChapter={onSelectChapter}
                  report={bestsellerGuideReport}
                />
              ) : null}

              {coachAdvice ? (
                <Card
                  className="grid gap-3 border-[color:rgba(var(--accent-rgb),0.28)] bg-[rgba(var(--accent-rgb),0.04)]"
                  data-testid="coach-note"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-lg font-semibold">Coach note</h4>
                    <Button onClick={onDismissCoachAdvice} variant="ghost">
                      Dismiss
                    </Button>
                  </div>
                  <pre className="whitespace-pre-wrap rounded-lg border border-[color:var(--line)] bg-[color:var(--panel-soft)] p-4 text-sm text-[var(--muted)]">
                    {coachAdvice}
                  </pre>
                </Card>
              ) : null}

              {showOutlinePanel ? (
                <Card className="grid gap-3 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Field className="flex-1" label="Chapter outline">
                      {outlineSuggestionPreview ? (
                        <InlineSuggestionPreview
                          actionType={outlineSuggestionPreview.actionType}
                          fieldLabel={outlineSuggestionPreview.fieldLabel}
                          onAccept={() => acceptSuggestionPreview("outline")}
                          onReject={dismissSuggestionPreview}
                          segments={outlineSuggestionPreview.segments}
                        />
                      ) : (
                        <TextareaAutosize
                          {...getAssistableTextProps("outline")}
                          className="min-h-[180px] resize-none overflow-hidden"
                          rows={8}
                          value={editor.outline}
                          onChange={(event) => onEditorChange({ outline: event.target.value })}
                        />
                      )}
                    </Field>
                    <Button onClick={onToggleOutlinePanel} variant="ghost">
                      Collapse
                    </Button>
                  </div>
                </Card>
              ) : null}

              {showPlanningPanel ? (
                <Card className="grid gap-4 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-lg font-semibold">Chapter planning</h4>
                      <p className="text-sm text-[var(--muted)]">
                        Keep the structure nearby, but out of the way while you draft.
                      </p>
                    </div>
                    <Button onClick={onTogglePlanningPanel} variant="ghost">
                      Collapse
                    </Button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Chapter title">
                      {renderInlinePreview("title") ?? (
                        <input
                          {...getAssistableTextProps("title")}
                          value={editor.title}
                          onChange={(event) => onEditorChange({ title: event.target.value })}
                          type="text"
                        />
                      )}
                    </Field>
                    <Field label="POV character">
                      <select
                        value={editor.povCharacterId ?? ""}
                        onChange={(event) => onEditorChange({ povCharacterId: event.target.value || null })}
                      >
                        <option value="">No POV selected</option>
                        {project.characters.filter((character) => character.povEligible).map((character) => (
                          <option key={character.id} value={character.id}>
                            {character.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field className="md:col-span-2" label="Chapter purpose">
                      {renderInlinePreview("purpose") ?? (
                        <TextareaAutosize
                          {...getAssistableTextProps("purpose")}
                          className="resize-none overflow-hidden"
                          rows={3}
                          value={editor.purpose}
                          onChange={(event) => onEditorChange({ purpose: event.target.value })}
                        />
                      )}
                    </Field>
                    <Field label="Current beat">
                      {renderInlinePreview("currentBeat") ?? (
                        <input
                          {...getAssistableTextProps("currentBeat")}
                          value={editor.currentBeat}
                          onChange={(event) => onEditorChange({ currentBeat: event.target.value })}
                          type="text"
                        />
                      )}
                    </Field>
                    <Field label="Target word count">
                      <input
                        value={editor.targetWordCount}
                        onChange={(event) => onEditorChange({ targetWordCount: Number(event.target.value) })}
                        type="number"
                      />
                    </Field>
                    <Field label="Key beats">
                      {renderInlinePreview("keyBeats") ?? (
                        <TextareaAutosize
                          {...getAssistableTextProps("keyBeats")}
                          className="resize-none overflow-hidden"
                          rows={4}
                          value={editor.keyBeats}
                          onChange={(event) => onEditorChange({ keyBeats: event.target.value })}
                        />
                      )}
                    </Field>
                    <Field label="Required inclusions">
                      {renderInlinePreview("requiredInclusions") ?? (
                        <TextareaAutosize
                          {...getAssistableTextProps("requiredInclusions")}
                          className="resize-none overflow-hidden"
                          rows={4}
                          value={editor.requiredInclusions}
                          onChange={(event) => onEditorChange({ requiredInclusions: event.target.value })}
                        />
                      )}
                    </Field>
                    <Field label="Forbidden elements">
                      {renderInlinePreview("forbiddenElements") ?? (
                        <TextareaAutosize
                          {...getAssistableTextProps("forbiddenElements")}
                          className="resize-none overflow-hidden"
                          rows={4}
                          value={editor.forbiddenElements}
                          onChange={(event) => onEditorChange({ forbiddenElements: event.target.value })}
                        />
                      )}
                    </Field>
                    <Field label="Desired mood / aesthetic">
                      {renderInlinePreview("desiredMood") ?? (
                        <TextareaAutosize
                          {...getAssistableTextProps("desiredMood")}
                          className="resize-none overflow-hidden"
                          rows={4}
                          value={editor.desiredMood}
                          onChange={(event) => onEditorChange({ desiredMood: event.target.value })}
                        />
                      )}
                    </Field>
                    <Field className="md:col-span-2" label="Optional scene list">
                      {renderInlinePreview("sceneList") ?? (
                        <TextareaAutosize
                          {...getAssistableTextProps("sceneList")}
                          className="resize-none overflow-hidden"
                          rows={3}
                          value={editor.sceneList}
                          onChange={(event) => onEditorChange({ sceneList: event.target.value })}
                        />
                      )}
                    </Field>
                    <Field className="md:col-span-2" label="Notes">
                      {renderInlinePreview("notes") ?? (
                        <TextareaAutosize
                          {...getAssistableTextProps("notes")}
                          className="resize-none overflow-hidden"
                          rows={3}
                          value={editor.notes}
                          onChange={(event) => onEditorChange({ notes: event.target.value })}
                        />
                      )}
                    </Field>
                  </div>
                </Card>
              ) : null}
            </div>

            {showSmartContextPane ? (
              <div
                aria-label="Resize smart context pane"
                className="hidden cursor-col-resize rounded-full bg-[color:var(--panel-strong)]/70 transition hover:bg-[rgba(var(--accent-rgb),0.25)] min-[960px]:block"
                onDoubleClick={onResetSmartContextWidth}
                onMouseDown={onBeginSmartContextResize}
                role="separator"
              />
            ) : null}

            {showSmartContextPane ? (
              <div className="grid min-h-0 gap-4 min-[960px]:sticky min-[960px]:top-4 min-[960px]:max-h-[calc(100vh-15rem)] min-[960px]:overflow-hidden">
                <Card className="grid min-h-0 gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-lg font-semibold">Smart Context</h4>
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip>{smartPaneTab}</Chip>
                      <Button onClick={onToggleSmartContextPane} variant="ghost">
                        Close pane
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {SMART_PANE_TABS.map(({ id, label }) => (
                      <Button
                        key={id}
                        onClick={() => setSmartPaneTab(id)}
                        variant={smartPaneTab === id ? "primary" : "secondary"}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>

                  <div className="min-h-0 overflow-y-auto pr-1">
                    {smartPaneTab === "characters" ? (
                      <div className="grid gap-3">
                        {relatedCharacters.length === 0 ? (
                          <p className="text-sm text-[var(--muted)]">No linked characters detected for this chapter yet.</p>
                        ) : (
                          relatedCharacters.map(({ character, group, relation }) => (
                            <div key={character.id} className="rounded-md border border-[color:var(--line)] bg-[color:var(--panel-soft)] p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <strong className="text-sm text-[var(--text)]">{character.name}</strong>
                                <div className="flex flex-wrap gap-2">
                                  <Chip>{group}</Chip>
                                  {character.quickProfile.accent ? <Chip>{character.quickProfile.accent}</Chip> : null}
                                </div>
                              </div>
                              <p className="mt-2 text-sm text-[var(--muted)]">
                                {character.quickProfile.profession || character.role || character.summary}
                              </p>
                              <p className="mt-2 text-xs text-[var(--muted)]">
                                Speech: {character.quickProfile.speechPattern || character.dossier.speechLanguage.directness || "Not set"}
                              </p>
                              {relation ? (
                                <p className="mt-1 text-xs text-[var(--muted)]">Dynamic: {relation.description || relation.kind}</p>
                              ) : null}
                            </div>
                          ))
                        )}
                      </div>
                    ) : null}

                    {smartPaneTab === "arcs" ? (
                      <div className="grid gap-3">
                        {project.plotThreads.slice(0, 6).map((thread) => (
                          <div key={thread.id} className="rounded-md border border-[color:var(--line)] bg-[color:var(--panel-soft)] p-3">
                            <div className="flex items-center justify-between gap-2">
                              <strong className="text-sm text-[var(--text)]">{thread.title}</strong>
                              <Chip>{thread.status}</Chip>
                            </div>
                            <p className="mt-2 text-sm text-[var(--muted)]">{thread.summary}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {thread.progressMarkers.length > 0 ? (
                                thread.progressMarkers.map((marker) => (
                                  <Chip key={`${thread.id}-${marker.chapterNumber}`}>
                                    Ch {marker.chapterNumber}: {marker.strength.toLowerCase()}
                                  </Chip>
                                ))
                              ) : (
                                <Chip>{thread.lastTouchedChapter ? `Last touched ch ${thread.lastTouchedChapter}` : "No arc markers yet"}</Chip>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {smartPaneTab === "summary" ? (
                      <div className="rounded-md border border-[color:var(--line)] bg-[color:var(--panel-soft)] p-3 text-sm text-[var(--muted)]">
                        <pre className="whitespace-pre-wrap">
                          {summaryOutput || selectedChapter?.summaries[0]?.summary || "No editable chapter summary yet."}
                        </pre>
                      </div>
                    ) : null}

                    {smartPaneTab === "continuity" ? (
                      <div className="grid gap-3">
                        {project.continuityIssues
                          .filter((issue) => !issue.chapterId || issue.chapterId === selectedChapter?.id)
                          .slice(0, 6)
                          .map((issue) => (
                            <div key={issue.id} className="rounded-md border border-[color:var(--line)] bg-[color:var(--panel-soft)] p-3">
                              <div className="flex items-center justify-between gap-2">
                                <strong className="text-sm text-[var(--text)]">{issue.title}</strong>
                                <Chip>{issue.severity}</Chip>
                              </div>
                              <p className="mt-2 text-sm text-[var(--muted)]">{issue.description}</p>
                            </div>
                          ))}
                      </div>
                    ) : null}

                    {smartPaneTab === "threads" ? (
                      <div className="grid gap-3">
                        {project.plotThreads.slice(0, 8).map((thread) => (
                          <div key={thread.id} className="rounded-md border border-[color:var(--line)] bg-[color:var(--panel-soft)] p-3">
                            <div className="flex items-center justify-between gap-2">
                              <strong className="text-sm text-[var(--text)]">{thread.title}</strong>
                              <Chip>Heat {thread.heat}</Chip>
                            </div>
                            <p className="mt-2 text-sm text-[var(--muted)]">{thread.promisedPayoff || thread.summary}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </Card>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
