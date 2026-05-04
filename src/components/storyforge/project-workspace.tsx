"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
} from "react";
import { toast } from "sonner";

import { BookSetupTab } from "@/components/storyforge/book-setup-tab";
import { ChaptersTab } from "@/components/storyforge/chapters-tab";
import { ContextInspector } from "@/components/storyforge/context-inspector";
import { ContinuityTab } from "@/components/storyforge/continuity-tab";
import { IdeaLabTab } from "@/components/storyforge/idea-lab-tab";
import { AboutTab } from "@/components/storyforge/about-tab";
import { AppLegalNotice } from "@/components/storyforge/app-legal-notice";
import { HelpTab } from "@/components/storyforge/help-tab";
import { MemoryTab } from "@/components/storyforge/memory-tab";
import { ProjectCopilotBar } from "@/components/storyforge/project-copilot-bar";
import { ProjectSidebar } from "@/components/storyforge/project-sidebar";
import { SettingsTab } from "@/components/storyforge/settings-tab";
import { StorySkeletonTab } from "@/components/storyforge/story-skeleton-tab";
import { StoryBibleTab } from "@/components/storyforge/story-bible-tab";
import { WorkspaceMenuBar } from "@/components/storyforge/workspace-menu-bar";
import { Card } from "@/components/ui/card";
import { APP_NAME } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/utils";
import {
  EDITOR_STATE_KEYS,
  SETUP_DRAFT_KEYS,
  requestJson,
  shallowEqualByKeys,
  splitLines,
  toEditorState,
  toProjectUpdatePayload,
  toSetupDraft,
  type EditorState,
  type SetupDraft,
} from "@/components/storyforge/workspace-helpers";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type {
  AiAutopilotMode,
  AiAssistRunRecord,
  AutopilotRunRecord,
  AssistActionType,
  BestsellerGuideRecommendation,
  BestsellerGuideReport,
  ContextPackage,
  ProjectWorkspace as ProjectWorkspaceData,
} from "@/types/storyforge";

type ProjectSummary = {
  id: string;
  title: string;
  premise: string;
  slug: string;
  seriesOrder?: number | null;
  series?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  updatedAt: string | Date;
  chapters: { id: string }[];
  continuityIssues: { id: string }[];
};

const DEFAULT_LEFT_PANE_WIDTH = 252;
const DEFAULT_RIGHT_PANE_WIDTH = 308;
const DEFAULT_CHAPTER_CONTEXT_WIDTH = 296;
const DEFAULT_MANUSCRIPT_ZOOM = 100;
const MANUSCRIPT_ZOOM_MIN = 80;
const MANUSCRIPT_ZOOM_MAX = 160;
const AUTOSAVE_DELAY_MS = 5 * 60 * 1000;

type PlanningAiAction = "develop" | "expand" | "tighten";
const STORAGE_KEYS = {
  leftPaneWidth: "storyforge-left-pane-width",
  rightPaneWidth: "storyforge-right-pane-width",
  chapterContextWidth: "storyforge-chapter-context-width",
  manuscriptZoom: "storyforge-manuscript-zoom",
  showChapterSidebar: "storyforge-show-chapter-sidebar",
  showChapterContext: "storyforge-show-chapter-context",
  showChapterPlanning: "storyforge-show-chapter-planning",
  showChapterOutline: "storyforge-show-chapter-outline",
} as const;

const AI_STATUS_LABELS: Record<string, string> = {
  "setup-save": "Saving setup",
  "chapter-plan-save": "Saving chapter plan",
  "delete-chapter": "Deleting chapter",
  "structure-plan": "Building structure",
  "story-plan": "Planning story",
  outline: "Generating outline",
  "outline-all": "Building all outlines",
  draft: "Generating chapter",
  "autopilot-start": "Running AI book pass",
  "autopilot-resume": "Resuming AI run",
  summary: "Summarizing chapter",
  sync: "Syncing chapter",
  extract: "Extracting memory",
  continuity: "Checking continuity",
  "guide-chapter": "Running chapter guide",
  "guide-book": "Running whole-book guide",
  "guide-fix": "Applying guide fix",
  "add-chapter": "Adding chapter",
};

function editorStatesEqual(left: EditorState, right: EditorState) {
  return shallowEqualByKeys(left, right, EDITOR_STATE_KEYS);
}

function setupDraftsEqual(left: SetupDraft, right: SetupDraft) {
  return shallowEqualByKeys(left, right, SETUP_DRAFT_KEYS);
}

function mergeAppliedContentIntoProject(
  project: ProjectWorkspaceData,
  chapterId: string,
  fieldKey:
    | "title"
    | "purpose"
    | "currentBeat"
    | "keyBeats"
    | "requiredInclusions"
    | "forbiddenElements"
    | "desiredMood"
    | "sceneList"
    | "outline"
    | "draft"
    | "notes",
  content: string,
) {
  return {
    ...project,
    chapters: project.chapters.map((chapter) => {
      if (chapter.id !== chapterId) {
        return chapter;
      }

      if (fieldKey === "keyBeats" || fieldKey === "requiredInclusions" || fieldKey === "forbiddenElements" || fieldKey === "sceneList") {
        return {
          ...chapter,
          [fieldKey]: splitLines(content),
        };
      }

      if (fieldKey === "draft") {
        return {
          ...chapter,
          draft: content,
          status: "REVISED",
        };
      }

      return {
        ...chapter,
        [fieldKey]: content,
      };
    }),
  };
}

export function ProjectWorkspace({
  aiMode,
  initialProject,
  projects,
}: {
  aiMode: string;
  initialProject: ProjectWorkspaceData;
  projects: ProjectSummary[];
}) {
  const {
    activeTab,
    assistMode,
    pendingSuggestion,
    saveState,
    selectedChapterId,
    activeAiRole,
    setActiveTab,
    setActiveAiRole,
    setAssistMode,
    setPendingSuggestion,
    setSaveState,
    setSelectedChapterId,
  } = useWorkspaceStore();

  const initialChapterId = initialProject.chapters.at(-1)?.id ?? null;
  const initialEditorState = toEditorState(initialProject, initialChapterId);
  const initialSetupState = toSetupDraft(initialProject);
  const [project, setProject] = useState(initialProject);
  const [setupDraft, setSetupDraft] = useState(() => initialSetupState);
  const [editor, setEditor] = useState(() => initialEditorState);
  const [storyPlan, setStoryPlan] = useState("");
  const [summaryOutput, setSummaryOutput] = useState("");
  const [coachAdvice, setCoachAdvice] = useState("");
  const [bestsellerGuideReport, setBestsellerGuideReport] = useState<BestsellerGuideReport | null>(null);
  const [contextPackage, setContextPackage] = useState<ContextPackage | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [autopilotRun, setAutopilotRun] = useState<AutopilotRunRecord | null>(null);
  const [showInspector, setShowInspector] = useState(false);
  const [copilotExpanded, setCopilotExpanded] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [leftPaneWidth, setLeftPaneWidth] = useState(DEFAULT_LEFT_PANE_WIDTH);
  const [rightPaneWidth, setRightPaneWidth] = useState(DEFAULT_RIGHT_PANE_WIDTH);
  const [chapterContextPaneWidth, setChapterContextPaneWidth] = useState(DEFAULT_CHAPTER_CONTEXT_WIDTH);
  const [showChapterSidebar, setShowChapterSidebar] = useState(false);
  const [showChapterContextPane, setShowChapterContextPane] = useState(false);
  const [showChapterPlanning, setShowChapterPlanning] = useState(false);
  const [showChapterOutline, setShowChapterOutline] = useState(false);
  const [manuscriptZoom, setManuscriptZoom] = useState(DEFAULT_MANUSCRIPT_ZOOM);
  const [, setHistoryVersion] = useState(0);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const editorStateRef = useRef(initialEditorState);
  const syncedEditorRef = useRef(initialEditorState);
  const setupDraftRef = useRef(initialSetupState);
  const syncedSetupDraftRef = useRef(initialSetupState);
  const loadedProjectIdRef = useRef(initialProject.id);
  const loadedChapterIdRef = useRef<string | null>(initialChapterId);
  const loadedSetupProjectIdRef = useRef(initialProject.id);
  const skipAutosaveRef = useRef(true);
  const saveNowRef = useRef<() => Promise<void> | void>(() => undefined);
  const autoMemorySyncRef = useRef<number | null>(null);
  const lastMemoryFingerprintRef = useRef("");
  const resizeStateRef = useRef<null | {
    side: "left" | "right" | "chapterContext";
    startX: number;
    startWidth: number;
  }>(null);
  const editorPastRef = useRef<typeof editor[]>([]);
  const editorFutureRef = useRef<typeof editor[]>([]);
  const lastHistoryPushAtRef = useRef(0);

  const chapterId = selectedChapterId ?? project.chapters.at(-1)?.id ?? null;
  const selectedChapter = project.chapters.find((chapter) => chapter.id === chapterId) ?? project.chapters.at(-1) ?? null;
  const desktopShell = viewportWidth >= 960;
  const phoneShell = viewportWidth > 0 && viewportWidth < 820;
  const dockPaddingClass = phoneShell
    ? copilotExpanded
      ? "pb-[19rem]"
      : "pb-[6.5rem]"
    : copilotExpanded
      ? "pb-[24rem] xl:pb-[28rem]"
      : "pb-[5.5rem]";
  const shouldShowInspector = showInspector && activeTab !== "chapters";
  const shouldShowChapterSidebar = activeTab === "chapters" ? showChapterSidebar && desktopShell : desktopShell;
  const shouldShowOuterInspector = shouldShowInspector && desktopShell;
  const canUndo = editorPastRef.current.length > 0;
  const canRedo = editorFutureRef.current.length > 0;
  const autopilotActive = autopilotRun?.status === "RUNNING";
  const aiWorking = busyAction !== null || autopilotActive;
  const aiStatusLabel = busyAction
    ? AI_STATUS_LABELS[busyAction] ?? "Working"
    : autopilotActive
      ? `AI run ${autopilotRun?.status.toLowerCase()}`
      : "Idle";

  const clampPaneWidth = useCallback((value: number, side: "left" | "right" | "chapterContext") => {
    const viewport = typeof window === "undefined" ? 1440 : window.innerWidth;
    const max = side === "left"
      ? Math.min(Math.max(Math.round(viewport * 0.28), 220), 360)
      : Math.min(Math.max(Math.round(viewport * 0.3), 240), 420);

    return Math.min(Math.max(value, side === "left" ? 190 : 220), max);
  }, []);

  const desktopGridStyle = desktopShell
    ? shouldShowChapterSidebar && shouldShowOuterInspector
      ? { gridTemplateColumns: `${leftPaneWidth}px 12px minmax(0,1fr) 12px ${rightPaneWidth}px` }
      : shouldShowChapterSidebar
        ? { gridTemplateColumns: `${leftPaneWidth}px 12px minmax(0,1fr)` }
        : shouldShowOuterInspector
          ? { gridTemplateColumns: `minmax(0,1fr) 12px ${rightPaneWidth}px` }
          : { gridTemplateColumns: `minmax(0,1fr)` }
    : undefined;

  const persistPreference = useCallback((key: keyof typeof STORAGE_KEYS, value: string) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEYS[key], value);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const paneWidthSettings: Array<
      [keyof typeof STORAGE_KEYS, "left" | "right" | "chapterContext", Dispatch<SetStateAction<number>>]
    > = [
      ["leftPaneWidth", "left", setLeftPaneWidth],
      ["rightPaneWidth", "right", setRightPaneWidth],
      ["chapterContextWidth", "chapterContext", setChapterContextPaneWidth],
    ];

    paneWidthSettings.forEach(([storageKey, side, setter]) => {
      const savedWidth = Number(window.localStorage.getItem(STORAGE_KEYS[storageKey]));
      if (Number.isFinite(savedWidth) && savedWidth > 0) {
        setter(clampPaneWidth(savedWidth, side));
      }
    });

    const syncViewport = () => setViewportWidth(window.innerWidth);
    syncViewport();
    window.addEventListener("resize", syncViewport);

    return () => window.removeEventListener("resize", syncViewport);
  }, [clampPaneWidth]);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      if (!resizeStateRef.current || typeof window === "undefined") {
        return;
      }

      const { side, startWidth, startX } = resizeStateRef.current;
      const delta = event.clientX - startX;
      const nextWidth = side === "left"
        ? clampPaneWidth(startWidth + delta, "left")
        : clampPaneWidth(startWidth - delta, side);

      if (side === "left") {
        setLeftPaneWidth(nextWidth);
      } else if (side === "chapterContext") {
        setChapterContextPaneWidth(nextWidth);
      } else {
        setRightPaneWidth(nextWidth);
      }
    }

    function handleMouseUp() {
      if (!resizeStateRef.current || typeof window === "undefined") {
        return;
      }

      const { side } = resizeStateRef.current;
      persistPreference(
        side === "left" ? "leftPaneWidth" : side === "chapterContext" ? "chapterContextWidth" : "rightPaneWidth",
        String(side === "left" ? leftPaneWidth : side === "chapterContext" ? chapterContextPaneWidth : rightPaneWidth),
      );

      resizeStateRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [chapterContextPaneWidth, clampPaneWidth, leftPaneWidth, persistPreference, rightPaneWidth]);

  function beginPaneResize(side: "left" | "right" | "chapterContext") {
    return (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();

      resizeStateRef.current = {
        side,
        startX: event.clientX,
        startWidth: side === "left" ? leftPaneWidth : side === "chapterContext" ? chapterContextPaneWidth : rightPaneWidth,
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    };
  }

  useEffect(() => {
    const nextSetupDraft = toSetupDraft(project);
    const projectChanged = loadedSetupProjectIdRef.current !== project.id;
    const hasUnsavedLocalChanges = !setupDraftsEqual(setupDraftRef.current, syncedSetupDraftRef.current);

    if (projectChanged) {
      setupDraftRef.current = nextSetupDraft;
      syncedSetupDraftRef.current = nextSetupDraft;
      loadedSetupProjectIdRef.current = project.id;
      setSetupDraft(nextSetupDraft);
      return;
    }

    if (!hasUnsavedLocalChanges) {
      setupDraftRef.current = nextSetupDraft;
      syncedSetupDraftRef.current = nextSetupDraft;
      setSetupDraft(nextSetupDraft);
    } else {
      syncedSetupDraftRef.current = nextSetupDraft;
    }

    loadedSetupProjectIdRef.current = project.id;
  }, [project]);

  useEffect(() => {
    if (!selectedChapterId && project.chapters[0]) {
      setSelectedChapterId(project.chapters.at(-1)?.id ?? project.chapters[0].id);
    }
  }, [project.chapters, selectedChapterId, setSelectedChapterId]);

  useEffect(() => {
    let cancelled = false;

    async function loadAutopilotStatus() {
      try {
        const data = await requestJson<{ job: AutopilotRunRecord | null }>(`/api/projects/${project.id}/autopilot`);
        if (!cancelled) {
          setAutopilotRun(data.job);
        }
      } catch {
        if (!cancelled) {
          setAutopilotRun(null);
        }
      }
    }

    void loadAutopilotStatus();

    return () => {
      cancelled = true;
    };
  }, [project.id]);

  useEffect(() => {
    editorStateRef.current = editor;
  }, [editor]);

  useEffect(() => {
    setupDraftRef.current = setupDraft;
  }, [setupDraft]);

  useEffect(() => {
    const nextEditorState = toEditorState(project, chapterId);
    const chapterChanged = loadedProjectIdRef.current !== project.id || loadedChapterIdRef.current !== chapterId;
    const hasUnsavedLocalChanges = !editorStatesEqual(editorStateRef.current, syncedEditorRef.current);

    if (chapterChanged) {
      skipAutosaveRef.current = true;
      editorPastRef.current = [];
      editorFutureRef.current = [];
      setHistoryVersion((current) => current + 1);
      editorStateRef.current = nextEditorState;
      syncedEditorRef.current = nextEditorState;
      loadedProjectIdRef.current = project.id;
      loadedChapterIdRef.current = chapterId;
      setEditor(nextEditorState);
      return;
    }

    if (!hasUnsavedLocalChanges) {
      editorStateRef.current = nextEditorState;
      syncedEditorRef.current = nextEditorState;
      setEditor((current) => {
        if (editorStatesEqual(current, nextEditorState)) {
          return current;
        }

        editorPastRef.current.push(current);
        if (editorPastRef.current.length > 80) {
          editorPastRef.current.shift();
        }
        editorFutureRef.current = [];
        lastHistoryPushAtRef.current = Date.now();
        setHistoryVersion((value) => value + 1);
        return nextEditorState;
      });
    }

    loadedProjectIdRef.current = project.id;
    loadedChapterIdRef.current = chapterId;
  }, [chapterId, project]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedZoom = Number(window.localStorage.getItem(STORAGE_KEYS.manuscriptZoom));
    if (Number.isFinite(savedZoom) && savedZoom >= MANUSCRIPT_ZOOM_MIN && savedZoom <= MANUSCRIPT_ZOOM_MAX) {
      setManuscriptZoom(savedZoom);
    }

    const toggleSettings: Array<
      [keyof typeof STORAGE_KEYS, Dispatch<SetStateAction<boolean>>]
    > = [
      ["showChapterSidebar", setShowChapterSidebar],
      ["showChapterContext", setShowChapterContextPane],
      ["showChapterPlanning", setShowChapterPlanning],
      ["showChapterOutline", setShowChapterOutline],
    ];

    toggleSettings.forEach(([storageKey, setter]) => {
      const savedValue = window.localStorage.getItem(STORAGE_KEYS[storageKey]);
      if (savedValue) {
        setter(savedValue === "true");
      }
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    persistPreference("manuscriptZoom", String(manuscriptZoom));
    persistPreference("showChapterSidebar", String(showChapterSidebar));
    persistPreference("showChapterContext", String(showChapterContextPane));
    persistPreference("showChapterPlanning", String(showChapterPlanning));
    persistPreference("showChapterOutline", String(showChapterOutline));
  }, [
    manuscriptZoom,
    persistPreference,
    showChapterContextPane,
    showChapterOutline,
    showChapterPlanning,
    showChapterSidebar,
  ]);

  function applyEditorPatch(
    patch: Partial<typeof editor>,
    options?: {
      skipHistory?: boolean;
      groupTyping?: boolean;
    },
  ) {
    setEditor((current) => {
      const next = { ...current, ...patch };

      if (options?.skipHistory) {
        return next;
      }

      const now = Date.now();
      const shouldGroup = options?.groupTyping;
      const shouldPushHistory = !shouldGroup || now - lastHistoryPushAtRef.current > 1200;

      if (shouldPushHistory) {
        editorPastRef.current.push(current);
        if (editorPastRef.current.length > 80) {
          editorPastRef.current.shift();
        }
        editorFutureRef.current = [];
        lastHistoryPushAtRef.current = now;
        setHistoryVersion((value) => value + 1);
      } else {
        lastHistoryPushAtRef.current = now;
      }

      editorStateRef.current = next;
      return next;
    });
  }

  const handleUndo = useCallback(() => {
    const previous = editorPastRef.current.pop();
    if (!previous) {
      return;
    }

    setEditor((current) => {
      editorFutureRef.current.unshift(current);
      if (editorFutureRef.current.length > 80) {
        editorFutureRef.current.pop();
      }
      editorStateRef.current = previous;
      return previous;
    });
    setHistoryVersion((value) => value + 1);
  }, []);

  const handleRedo = useCallback(() => {
    const next = editorFutureRef.current.shift();
    if (!next) {
      return;
    }

    setEditor((current) => {
      editorPastRef.current.push(current);
      if (editorPastRef.current.length > 80) {
        editorPastRef.current.shift();
      }
      editorStateRef.current = next;
      return next;
    });
    setHistoryVersion((value) => value + 1);
  }, []);

  function refreshProject(nextProject: ProjectWorkspaceData) {
    setProject(nextProject);
    setContextPackage(null);
  }

  function buildProjectPatchPayload(overrides?: {
    targetBookLength?: number;
    targetChapterLength?: number;
  }) {
    return {
      title: project.title,
      premise: project.premise,
      oneLineHook: project.oneLineHook,
      bookSettings: {
        ...project.bookSettings,
        targetBookLength: overrides?.targetBookLength ?? project.bookSettings.targetBookLength,
        targetChapterLength: overrides?.targetChapterLength ?? project.bookSettings.targetChapterLength,
      },
      styleProfile: project.styleProfile,
    };
  }

  useEffect(() => {
    setBestsellerGuideReport((current) => {
      if (!current) {
        return current;
      }

      if (current.scope === "CHAPTER" && current.analyzedChapterId && current.analyzedChapterId !== chapterId) {
        return null;
      }

      return current;
    });
  }, [chapterId]);

  const applySetupPatch = useCallback((patch: Partial<SetupDraft>) => {
    setSetupDraft((current) => {
      const nextDraft = { ...current, ...patch };
      setupDraftRef.current = nextDraft;
      return nextDraft;
    });
  }, []);

  const buildChapterPatchPayload = useCallback(() => {
    if (!selectedChapter) {
      return null;
    }

    return {
      title: editor.title,
      purpose: editor.purpose,
      currentBeat: editor.currentBeat,
      targetWordCount: editor.targetWordCount,
      keyBeats: splitLines(editor.keyBeats),
      requiredInclusions: splitLines(editor.requiredInclusions),
      forbiddenElements: splitLines(editor.forbiddenElements),
      desiredMood: editor.desiredMood,
      sceneList: splitLines(editor.sceneList),
      outline: editor.outline,
      draft: editor.draft,
      notes: editor.notes,
      povCharacterId: editor.povCharacterId,
      status: editor.draft.trim() ? "DRAFTING" : selectedChapter.status,
    };
  }, [editor, selectedChapter]);

  const persistChapter = useCallback(async (showToast = false) => {
    if (!selectedChapter) {
      return;
    }

    const payload = buildChapterPatchPayload();
    if (!payload) {
      return;
    }

    try {
      setSaveState("saving");
      const data = await requestJson<{ project: ProjectWorkspaceData }>(`/api/chapters/${selectedChapter.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      syncedEditorRef.current = editorStateRef.current;
      refreshProject(data.project);
      setSaveState("saved");
      if (showToast) {
        toast.success("Chapter saved.");
      }
    } catch (error) {
      setSaveState("error");
      throw error;
    }
  }, [buildChapterPatchPayload, selectedChapter, setSaveState]);

  useEffect(() => {
    if (!selectedChapter) {
      return;
    }

    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return;
    }

    const timeout = window.setTimeout(async () => {
      try {
        await persistChapter(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Autosave failed.");
      }
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [editor, persistChapter, selectedChapter]);

  useEffect(() => {
    if (
      activeTab !== "chapters" ||
      !selectedChapter ||
      saveState !== "saved" ||
      editor.draft.trim().length < 160
    ) {
      return;
    }

    const fingerprint = [
      selectedChapter.id,
      editor.title,
      editor.purpose,
      editor.currentBeat,
      editor.outline,
      editor.notes,
      editor.draft,
    ].join("::");
    if (fingerprint === lastMemoryFingerprintRef.current) {
      return;
    }

    if (autoMemorySyncRef.current) {
      window.clearTimeout(autoMemorySyncRef.current);
    }

    autoMemorySyncRef.current = window.setTimeout(async () => {
      try {
        const data = await requestJson<{
          extraction: { summary: string; emotionalTone: string };
          report: { verdict: string };
          project: ProjectWorkspaceData;
        }>(`/api/chapters/${selectedChapter.id}/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: editorStateRef.current.title,
            purpose: editorStateRef.current.purpose,
            currentBeat: editorStateRef.current.currentBeat,
            desiredMood: editorStateRef.current.desiredMood,
            outline: editorStateRef.current.outline,
            notes: editorStateRef.current.notes,
            draft: editorStateRef.current.draft,
          }),
        });
        refreshProject(data.project);
        setSummaryOutput(`${data.extraction.summary}\n\nTone: ${data.extraction.emotionalTone}`);
        lastMemoryFingerprintRef.current = fingerprint;
      } catch {
        // Read-only auto-sync should stay quiet and never interrupt drafting.
      }
    }, 5000);

    return () => {
      if (autoMemorySyncRef.current) {
        window.clearTimeout(autoMemorySyncRef.current);
      }
    };
  }, [activeTab, editor.currentBeat, editor.draft, editor.notes, editor.outline, editor.purpose, editor.title, saveState, selectedChapter]);

  async function handleSetupSave() {
    setBusyAction("setup-save");

    try {
      const data = await requestJson<{ project: ProjectWorkspaceData }>(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toProjectUpdatePayload(setupDraft)),
      });
      syncedSetupDraftRef.current = setupDraftRef.current;
      refreshProject(data.project);
      toast.success("Project settings saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save setup.");
    } finally {
      setBusyAction(null);
    }
  }

  const mutateProjectSection = useCallback(async (
    route: "story-bible" | "idea-lab" | "skeleton",
    entityType: string,
    payload: Record<string, unknown>,
    id?: string,
    method: "POST" | "PATCH" | "DELETE" = "PATCH",
  ) => {
    const data = await requestJson<{ project: ProjectWorkspaceData }>(`/api/projects/${project.id}/${route}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType, id, payload }),
    });

    refreshProject(data.project);
  }, [project.id]);

  async function mutateStoryBible(
    entityType: "character" | "relationship" | "plotThread" | "location" | "faction" | "timelineEvent" | "workingNote",
    payload: Record<string, unknown>,
    id?: string,
    method: "POST" | "PATCH" | "DELETE" = "PATCH",
  ) {
    await mutateProjectSection("story-bible", entityType, payload, id, method);
  }

  async function mutateIdeaLab(
    entityType: "ideaEntry" | "workingNote",
    payload: Record<string, unknown>,
    id?: string,
    method: "POST" | "PATCH" | "DELETE" = "PATCH",
  ) {
    await mutateProjectSection("idea-lab", entityType, payload, id, method);
  }

  async function mutateSkeleton(
    entityType: "structureBeat" | "sceneCard",
    payload: Record<string, unknown>,
    id?: string,
    method: "POST" | "PATCH" | "DELETE" = "PATCH",
  ) {
    await mutateProjectSection("skeleton", entityType, payload, id, method);
  }

  async function handleSaveChapterPlan(
    chapterIdToSave: string,
    payload: {
      title?: string;
      purpose?: string;
      currentBeat?: string;
      targetWordCount?: number;
      desiredMood?: string;
      outline?: string;
    },
  ) {
    setBusyAction("chapter-plan-save");

    try {
      const data = await requestJson<{ project: ProjectWorkspaceData }>(`/api/chapters/${chapterIdToSave}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      refreshProject(data.project);
      toast.success("Chapter plan saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the chapter plan.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDeleteChapter(chapterIdToDelete: string) {
    setBusyAction("delete-chapter");

    try {
      const data = await requestJson<{ project: ProjectWorkspaceData }>(`/api/chapters/${chapterIdToDelete}`, {
        method: "DELETE",
      });
      refreshProject(data.project);
      if (chapterId === chapterIdToDelete) {
        setSelectedChapterId(data.project.chapters.at(-1)?.id ?? data.project.chapters[0]?.id ?? null);
      }
      toast.success("Chapter removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the chapter.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleApplyBookPlan(bookWordTarget: number, chapterCountTarget: number) {
    setBusyAction("structure-plan");

    try {
      const safeBookWordTarget = Math.max(1000, Math.round(bookWordTarget));
      const safeChapterCount = Math.max(1, Math.round(chapterCountTarget));
      const perChapterTarget = Math.max(300, Math.round(safeBookWordTarget / safeChapterCount));

      const projectData = await requestJson<{ project: ProjectWorkspaceData }>(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildProjectPatchPayload({
            targetBookLength: safeBookWordTarget,
            targetChapterLength: perChapterTarget,
          }),
        ),
      });

      let nextProject = projectData.project;

      while (nextProject.chapters.length < safeChapterCount) {
        const added = await requestJson<{ chapterId: string; project: ProjectWorkspaceData }>(
          `/api/projects/${project.id}/chapters`,
          {
            method: "POST",
          },
        );
        nextProject = added.project;
      }

      while (nextProject.chapters.length > safeChapterCount) {
        const lastChapter = nextProject.chapters.at(-1);
        if (!lastChapter) {
          break;
        }

        const deleted = await requestJson<{ project: ProjectWorkspaceData }>(`/api/chapters/${lastChapter.id}`, {
          method: "DELETE",
        });
        nextProject = deleted.project;
      }

      for (const chapterToUpdate of nextProject.chapters) {
        const updated = await requestJson<{ project: ProjectWorkspaceData }>(`/api/chapters/${chapterToUpdate.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetWordCount: perChapterTarget,
          }),
        });
        nextProject = updated.project;
      }

      refreshProject(nextProject);
      setSelectedChapterId(
        nextProject.chapters.some((entry) => entry.id === chapterId)
          ? chapterId
          : nextProject.chapters.at(-1)?.id ?? nextProject.chapters[0]?.id ?? null,
      );
      toast.success(
        `Book plan applied: ${safeBookWordTarget.toLocaleString()} words across ${safeChapterCount} chapters (~${perChapterTarget.toLocaleString()} each).`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not apply the book plan.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleStoryPlan() {
    setBusyAction("story-plan");
    try {
      const data = await requestJson<{ content: string; contextPackage: ContextPackage }>(
        `/api/projects/${project.id}/generate/plan`,
        { method: "POST" },
      );
      setStoryPlan(data.content);
      setContextPackage(data.contextPackage);
      toast.success("Story plan generated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate story plan.");
    } finally {
      setBusyAction(null);
    }
  }

    async function handlePlanningAiFieldAction(options: {
      scope: "SKELETON" | "STORY_BIBLE";
      sectionLabel: string;
    itemId: string;
    itemTitle: string;
    fieldKey: string;
    fieldLabel: string;
    action: PlanningAiAction;
  }) {
    const busyKey = `planning-ai:${options.scope}:${options.itemId}:${options.fieldKey}:${options.action}`;
      setBusyAction(busyKey);
      try {
        const data = await requestJson<{
          project: ProjectWorkspaceData;
          contextPackage: ContextPackage | null;
        }>(`/api/projects/${project.id}/targeted-ai`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scope: options.scope,
            itemId: options.itemId,
            itemTitle: options.itemTitle,
            fieldKey: options.fieldKey,
            fieldLabel: options.fieldLabel,
            action: options.action,
          }),
        });

      refreshProject(data.project);
      setContextPackage(data.contextPackage);
      toast.success(`${options.fieldLabel} updated with AI.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update that field with AI.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCharacterAiAction(options: {
    characterId: string;
    action: "develop-dossier" | "expand-summary" | "tighten-summary";
  }) {
    const targetCharacter = project.characters.find((entry) => entry.id === options.characterId);
    if (!targetCharacter) {
      return;
    }

    const busyKey = `character-ai:${options.characterId}:${options.action}`;
      setBusyAction(busyKey);
      try {
        const data = await requestJson<{
          project: ProjectWorkspaceData;
          contextPackage: ContextPackage | null;
        }>(`/api/projects/${project.id}/targeted-ai`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "character",
            characterId: options.characterId,
            action: options.action,
          }),
        });

      refreshProject(data.project);
      setContextPackage(data.contextPackage);
      toast.success(`${targetCharacter.name} updated with AI.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update that character with AI.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleOutlineGenerate() {
    if (!selectedChapter) {
      return;
    }

    setBusyAction("outline");
    try {
      const data = await requestJson<{
        run: AiAssistRunRecord;
        contextPackage: ContextPackage;
      }>(`/api/chapters/${selectedChapter.id}/generate/outline`, { method: "POST" });
      applyEditorPatch({ outline: data.run.suggestion });
      setContextPackage(data.contextPackage);
      toast.success("Outline preview inserted into the outline field.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate outline.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleGenerateAllChapterOutlines() {
    if (project.chapters.length === 0) {
      return;
    }

    setBusyAction("outline-all");
    try {
      if (selectedChapter && activeTab === "chapters") {
        await persistChapter(false);
      }

      let latestProject: ProjectWorkspaceData | null = null;
      let latestContext: ContextPackage | null = null;

      for (const chapter of project.chapters) {
        const outlineData = await requestJson<{
          run: AiAssistRunRecord;
          contextPackage: ContextPackage;
        }>(`/api/chapters/${chapter.id}/generate/outline`, { method: "POST" });

        latestContext = outlineData.contextPackage;

        const saveData = await requestJson<{ project: ProjectWorkspaceData }>(`/api/chapters/${chapter.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            outline: outlineData.run.suggestion,
          }),
        });

        latestProject = saveData.project;
      }

      if (latestProject) {
        refreshProject(latestProject);
      }
      if (latestContext) {
        setContextPackage(latestContext);
      }
      toast.success("All chapter outlines were generated and saved into the chapter runway.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not build all chapter outlines.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDraftGenerate() {
    if (!selectedChapter) {
      return;
    }

    setBusyAction("draft");
    try {
      const data = await requestJson<{
        run: AiAssistRunRecord;
        contextPackage: ContextPackage;
      }>(`/api/chapters/${selectedChapter.id}/generate/draft`, { method: "POST" });
      setPendingSuggestion({ run: data.run, contextPackage: data.contextPackage });
      setContextPackage(data.contextPackage);
      toast.success("Draft preview ready.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate draft.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAutopilotRun(options: {
    action: "start" | "resume";
    mode: AiAutopilotMode;
    generalPrompt?: string;
  }) {
    setActiveTab("chapters");
    setBusyAction(options.action === "resume" ? "autopilot-resume" : "autopilot-start");

    try {
      if (selectedChapter && activeTab === "chapters") {
        await persistChapter(false);
      }

      const data = await requestJson<{
        job: AutopilotRunRecord | null;
        project: ProjectWorkspaceData;
      }>(`/api/projects/${project.id}/autopilot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: options.action,
          mode: options.mode,
          chapterId,
          generalPrompt: options.generalPrompt?.trim() ?? "",
          jobId: autopilotRun?.id,
        }),
      });

      refreshProject(data.project);
      setAutopilotRun(data.job);

      if (data.job?.status === "COMPLETED") {
        toast.success("AI writing run completed.");
      } else if (data.job?.status === "PAUSED") {
        toast.success(data.job.lastMessage || "AI writing run paused safely. Resume it later to continue.");
      } else {
        toast.success("AI writing run updated.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The AI writing run could not be completed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRevise(actionType: AssistActionType, instruction: string) {
    if (!selectedChapter) {
      return;
    }

    setBusyAction(actionType);
    try {
      const data = await requestJson<{
        run: AiAssistRunRecord;
        contextPackage: ContextPackage;
      }>(`/api/chapters/${selectedChapter.id}/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction, actionType }),
      });
      setPendingSuggestion({ run: data.run, contextPackage: data.contextPackage });
      setContextPackage(data.contextPackage);
      toast.success("Revision preview ready.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Revision failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAssist(
    actionType: AssistActionType,
    options?: {
      instructionOverride?: string;
      fieldKey?: "title" | "purpose" | "currentBeat" | "keyBeats" | "requiredInclusions" | "forbiddenElements" | "desiredMood" | "sceneList" | "outline" | "draft" | "notes";
      selectionStart?: number;
      selectionEnd?: number;
      selectionText?: string;
      beforeSelection?: string;
      afterSelection?: string;
      contextNote?: string;
    },
  ) {
    if (!selectedChapter) {
      return;
    }

    const textarea = editorRef.current;
    const targetField = options?.fieldKey ?? "draft";
    const fieldContent = typeof editor[targetField] === "string" ? editor[targetField] : editor.draft;
    const selectionStart = options?.selectionStart ?? textarea?.selectionStart ?? 0;
    const selectionEnd = options?.selectionEnd ?? textarea?.selectionEnd ?? 0;
    const selectionText = options?.selectionText ?? fieldContent.slice(selectionStart, selectionEnd);
    const beforeSelection = options?.beforeSelection ?? fieldContent.slice(0, selectionStart);
    const afterSelection = options?.afterSelection ?? fieldContent.slice(selectionEnd);

    setBusyAction(actionType);
    try {
      const data = await requestJson<{
        run: AiAssistRunRecord;
        contextPackage: ContextPackage;
      }>(`/api/chapters/${selectedChapter.id}/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: actionType === "COACH" ? "COACH" : assistMode,
          role: actionType === "COACH" ? "WRITING_COACH" : activeAiRole,
          actionType,
          selectionText,
          instruction:
            actionType === "COACH"
              ? options?.instructionOverride || "Give chapter advice."
              : options?.instructionOverride,
          contextNote: options?.contextNote || selectedChapter.currentBeat,
          beforeSelection,
          afterSelection,
        }),
      });

      if (actionType === "COACH") {
        setCoachAdvice(data.run.suggestion);
      } else {
        setPendingSuggestion({
          run: data.run,
          contextPackage: data.contextPackage,
          target: {
            fieldKey: targetField,
            selectionStart,
            selectionEnd,
            sourceText: fieldContent,
            applyMode:
              actionType === "CONTINUE"
                ? "insert-at-cursor"
                : actionType === "NEXT_BEATS" || actionType === "OUTLINE"
                  ? "replace-draft"
                  : selectionStart === selectionEnd
                    ? "insert-at-cursor"
                    : "replace-selection",
          },
        });
      }

      setContextPackage(data.contextPackage);
      toast.success(actionType === "COACH" ? "Coach advice ready." : "Assist preview ready.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Assist action failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleApplySuggestion(
    applyMode: "replace-selection" | "replace-draft" | "append" | "insert-at-cursor",
    fieldKey:
      | "title"
      | "purpose"
      | "currentBeat"
      | "keyBeats"
      | "requiredInclusions"
      | "forbiddenElements"
      | "desiredMood"
      | "sceneList"
      | "outline"
      | "draft"
      | "notes",
    currentContent: string,
    selectionStartOverride?: number,
    selectionEndOverride?: number,
  ) {
    if (!pendingSuggestion) {
      return;
    }

    const textarea = editorRef.current;
    const selectionStart = selectionStartOverride ?? textarea?.selectionStart ?? editor.draft.length;
    const selectionEnd = selectionEndOverride ?? textarea?.selectionEnd ?? selectionStart;
    const cursorPosition =
      applyMode === "append" || applyMode === "replace-draft"
        ? pendingSuggestion.run.suggestion.length
        : selectionStart + pendingSuggestion.run.suggestion.length;

    try {
      const data = await requestJson<{ draft: string; content: string; project: ProjectWorkspaceData }>(
        `/api/assist-runs/${pendingSuggestion.run.id}/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            applyMode,
            fieldKey,
            selectionStart,
            selectionEnd,
            content: currentContent,
          }),
        },
      );

      const nextEditorState = { ...editorStateRef.current, [fieldKey]: data.content } as typeof editor;
      editorPastRef.current.push(editorStateRef.current);
      if (editorPastRef.current.length > 80) {
        editorPastRef.current.shift();
      }
      editorFutureRef.current = [];
      lastHistoryPushAtRef.current = Date.now();
      setHistoryVersion((value) => value + 1);
      editorStateRef.current = nextEditorState;
      syncedEditorRef.current = nextEditorState;
      setEditor(nextEditorState);
      refreshProject(
        mergeAppliedContentIntoProject(
          data.project,
          selectedChapter?.id ?? pendingSuggestion.run.chapterId,
          fieldKey,
          data.content,
        ),
      );
      setPendingSuggestion(null);
      if (fieldKey === "draft") {
        window.requestAnimationFrame(() => {
          if (!editorRef.current) {
            return;
          }

          const safeCursor = Math.min(cursorPosition, data.content.length);
          editorRef.current.focus();
          editorRef.current.setSelectionRange(safeCursor, safeCursor);
        });
      }
      toast.success("Suggestion applied.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not apply suggestion.");
    }
  }

  async function handleSummarize() {
    if (!selectedChapter) {
      return;
    }

    setBusyAction("summary");
    try {
      const data = await requestJson<{
        summary: { summary: string; emotionalTone: string };
      }>(`/api/chapters/${selectedChapter.id}/summary`, { method: "POST" });
      setSummaryOutput(`${data.summary.summary}\n\nTone: ${data.summary.emotionalTone}`);
      toast.success("Summary generated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not summarize chapter.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSyncChapter() {
    if (!selectedChapter) {
      return;
    }

    setBusyAction("sync");
    try {
      await persistChapter(false);
      const data = await requestJson<{
        extraction: { summary: string; emotionalTone: string };
        report: { verdict: string };
        project: ProjectWorkspaceData;
      }>(`/api/chapters/${selectedChapter.id}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editorStateRef.current.title,
          purpose: editorStateRef.current.purpose,
          currentBeat: editorStateRef.current.currentBeat,
          desiredMood: editorStateRef.current.desiredMood,
          outline: editorStateRef.current.outline,
          notes: editorStateRef.current.notes,
          draft: editorStateRef.current.draft,
        }),
      });
      refreshProject(data.project);
      setSummaryOutput(`${data.extraction.summary}\n\nTone: ${data.extraction.emotionalTone}`);
      lastMemoryFingerprintRef.current = [
        selectedChapter.id,
        editorStateRef.current.title,
        editorStateRef.current.purpose,
        editorStateRef.current.currentBeat,
        editorStateRef.current.outline,
        editorStateRef.current.notes,
        editorStateRef.current.draft,
      ].join("::");
      toast.success("Story state synced from the current chapter.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sync chapter to story.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleExtractMemory() {
    if (!selectedChapter) {
      return;
    }

    setBusyAction("extract");
    try {
      const data = await requestJson<{
        extraction: { summary: string; emotionalTone: string };
        project: ProjectWorkspaceData;
      }>(`/api/chapters/${selectedChapter.id}/extract-memory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editorStateRef.current.title,
          purpose: editorStateRef.current.purpose,
          currentBeat: editorStateRef.current.currentBeat,
          desiredMood: editorStateRef.current.desiredMood,
          outline: editorStateRef.current.outline,
          notes: editorStateRef.current.notes,
          draft: editorStateRef.current.draft,
        }),
      });
      refreshProject(data.project);
      setSummaryOutput(`${data.extraction.summary}\n\nTone: ${data.extraction.emotionalTone}`);
      toast.success("Memory extracted into long-term and short-term stores.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Memory extraction failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleContinuityCheck() {
    if (!selectedChapter) {
      return;
    }

    setBusyAction("continuity");
    try {
      const data = await requestJson<{
        report: { verdict: string; suggestedContext: string[] };
        project: ProjectWorkspaceData;
      }>(`/api/chapters/${selectedChapter.id}/continuity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: editor.draft, mode: "CHAPTER" }),
      });
      refreshProject(data.project);
      toast.success("Continuity review complete.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Continuity check failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleChapterGuideCheck() {
    if (!selectedChapter) {
      return;
    }

    setBusyAction("guide-chapter");
    try {
      await persistChapter(false);
      const data = await requestJson<{
        report: BestsellerGuideReport;
      }>(`/api/chapters/${selectedChapter.id}/bestseller-guide`, { method: "POST" });
      setBestsellerGuideReport(data.report);
      toast.success("Chapter guide review is ready.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not review the chapter against the bestseller guide.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleBookGuideCheck() {
    setBusyAction("guide-book");
    try {
      await persistChapter(false);
      const data = await requestJson<{
        report: BestsellerGuideReport;
      }>(`/api/projects/${project.id}/bestseller-guide`, { method: "POST" });
      setBestsellerGuideReport(data.report);
      toast.success("Whole-book guide review is ready.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not review the book against the bestseller guide.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleApplyGuideRecommendation(recommendation: BestsellerGuideRecommendation) {
    const targetChapter =
      (recommendation.targetChapterId
        ? project.chapters.find((chapter) => chapter.id === recommendation.targetChapterId)
        : null) ??
      (recommendation.targetChapterNumber
        ? project.chapters.find((chapter) => chapter.number === recommendation.targetChapterNumber)
        : null) ??
      selectedChapter ??
      null;

    if (!targetChapter) {
      toast.error(`${APP_NAME} could not find the chapter to fix.`);
      return;
    }

    setBusyAction("guide-fix");
    try {
      await persistChapter(false);
      setActiveTab("chapters");
      setSelectedChapterId(targetChapter.id);
      const data = await requestJson<{
        run: AiAssistRunRecord;
        contextPackage: ContextPackage;
      }>(`/api/chapters/${targetChapter.id}/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: [
            recommendation.fixInstruction,
            `Target the chapter's planned length of about ${targetChapter.targetWordCount} words.`,
            "Rewrite the chapter manuscript itself.",
            "Return only final revised chapter prose.",
            "Return a full revised chapter, not a short excerpt or partial patch.",
            "Do not return editorial notes, assessments, headings, markdown, bullets, or commentary.",
            "Preserve the chapter's core facts, chronology, POV, and continuity while making the requested improvement visible on the page.",
          ].join("\n"),
          actionType: "REVISE",
        }),
      });
      setPendingSuggestion({ run: data.run, contextPackage: data.contextPackage });
      setContextPackage(data.contextPackage);
      toast.success(`AI fix preview is ready for Chapter ${targetChapter.number}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${APP_NAME} could not build the AI fix preview.`);
    } finally {
      setBusyAction(null);
    }
  }

  function openChapterWorkspace() {
    setActiveTab("chapters");
  }

  function handleRibbonGenerateOutline() {
    openChapterWorkspace();
    void handleOutlineGenerate();
  }

  function handleRibbonGenerateDraft() {
    openChapterWorkspace();
    void handleDraftGenerate();
  }

  function handleRibbonReviseForPacing() {
    openChapterWorkspace();
    void handleRevise("REVISE", "Strengthen pacing, prose, and chapter momentum without breaking continuity.");
  }

  function handleRibbonReviseForProse() {
    openChapterWorkspace();
    void handleRevise("IMPROVE_PROSE", "Refine the prose for clarity, image-rich specificity, and rhythm.");
  }

  function handleRibbonReviseForVoice() {
    openChapterWorkspace();
    void handleRevise(
      "SHARPEN_VOICE",
      "Make the character voices unmistakably more distinct by changing diction, syntax, rhythm, directness, and subtext where needed without breaking continuity.",
    );
  }

  function handleRibbonSummarize() {
    openChapterWorkspace();
    void handleSummarize();
  }

  function handleRibbonExtractMemory() {
    openChapterWorkspace();
    void handleExtractMemory();
  }

  function handleRibbonContinuity() {
    openChapterWorkspace();
    void handleContinuityCheck();
  }

  function handleRibbonChapterGuideCheck() {
    openChapterWorkspace();
    void handleChapterGuideCheck();
  }

  function handleRibbonBookGuideCheck() {
    openChapterWorkspace();
    void handleBookGuideCheck();
  }

  async function handlePromoteMemory(memoryItemId: string) {
    try {
      const data = await requestJson<{ project: ProjectWorkspaceData }>(`/api/projects/${project.id}/memory/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoryItemId }),
      });
      refreshProject(data.project);
      toast.success("Memory promoted to long-term canon.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not promote memory.");
    }
  }

  async function handleAddChapter() {
    setBusyAction("add-chapter");

    try {
      const data = await requestJson<{ chapterId: string; project: ProjectWorkspaceData }>(
        `/api/projects/${project.id}/chapters`,
        {
          method: "POST",
        },
      );
      refreshProject(data.project);
      setSelectedChapterId(data.chapterId);
      setActiveTab("chapters");
      toast.success("New chapter ready.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add chapter.");
    } finally {
      setBusyAction(null);
    }
  }

  function startBackupDownload() {
    const anchor = document.createElement("a");
    anchor.href = `/api/projects/${project.id}/export?format=json`;
          anchor.download = `${project.slug || "the-book-author-project"}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  async function handleSaveNow() {
    if (activeTab === "chapters") {
      try {
        await persistChapter(true);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save chapter.");
      }
      return;
    }

    if (activeTab === "setup" || activeTab === "settings") {
      await handleSetupSave();
      return;
    }

    startBackupDownload();
    toast.success("Project backup download started.");
  }

  const handleCopilotBeforeSubmit = useCallback(
    async ({ applyChanges }: { applyChanges: boolean }) => {
      if (!applyChanges || activeTab !== "chapters" || !selectedChapter) {
        return;
      }

      await persistChapter(false);
    },
    [activeTab, persistChapter, selectedChapter],
  );

  useEffect(() => {
    saveNowRef.current = handleSaveNow;
  });

  function openProviders() {
    setActiveTab("settings");
    window.setTimeout(() => {
      document.getElementById("ai-providers")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveNowRef.current();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        handleUndo();
        return;
      }

      if (
        (event.ctrlKey || event.metaKey) &&
        (event.key.toLowerCase() === "y" || (event.shiftKey && event.key.toLowerCase() === "z"))
      ) {
        event.preventDefault();
        handleRedo();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleRedo, handleUndo]);

  return (
    <main
      className={cn(
        phoneShell
          ? "workspace-canvas flex min-h-[100dvh] flex-col overflow-x-hidden overflow-y-auto px-2 py-2"
          : "workspace-canvas flex h-screen flex-col overflow-hidden px-3 py-3 sm:px-4 lg:px-5",
      )}
    >
        <WorkspaceMenuBar
          activeTab={activeTab}
          aiStatusLabel={aiStatusLabel}
          aiWorking={aiWorking}
          autopilotStatus={autopilotRun?.status ?? "IDLE"}
          canRedo={canRedo}
          canUndo={canUndo}
          chapterContextVisible={showChapterContextPane}
          projectId={project.id}
        chapterOutlineVisible={showChapterOutline}
          chapterPlanningVisible={showChapterPlanning}
          chapterSidebarVisible={showChapterSidebar}
          copilotExpanded={copilotExpanded}
          manuscriptZoom={manuscriptZoom}
          phoneShell={phoneShell}
          onOpenProviders={openProviders}
          onOpenTab={setActiveTab}
          onRedo={handleRedo}
          onResumeAutopilot={() => void handleAutopilotRun({ action: "resume", mode: "BOOK" })}
          onReviseForPacing={handleRibbonReviseForPacing}
          onReviseForProse={handleRibbonReviseForProse}
          onReviseForVoice={handleRibbonReviseForVoice}
          onRunAutopilotBook={() => void handleAutopilotRun({ action: "start", mode: "BOOK" })}
          onRunAutopilotChapter={() => void handleAutopilotRun({ action: "start", mode: "CURRENT_CHAPTER" })}
          onRunBookGuideCheck={handleRibbonBookGuideCheck}
          onRunChapterGuideCheck={handleRibbonChapterGuideCheck}
          onRunContinuityCheck={handleRibbonContinuity}
          onRunExtractMemory={handleRibbonExtractMemory}
          onRunGenerateDraft={handleRibbonGenerateDraft}
          onRunGenerateOutline={handleRibbonGenerateOutline}
          onRunSummarizeChapter={handleRibbonSummarize}
          onSaveBackup={() => {
            startBackupDownload();
            toast.success("Project backup download started.");
          }}
        onSaveNow={() => void handleSaveNow()}
        onSyncChapter={() => void handleSyncChapter()}
        onToggleChapterContext={() => setShowChapterContextPane((current) => !current)}
        onToggleChapterOutline={() => setShowChapterOutline((current) => !current)}
        onToggleChapterPlanning={() => setShowChapterPlanning((current) => !current)}
        onToggleChapterSidebar={() => setShowChapterSidebar((current) => !current)}
        onToggleCopilot={() => setCopilotExpanded((current) => !current)}
        onToggleInspector={() => setShowInspector((current) => !current)}
        onUndo={handleUndo}
        onZoomIn={() => setManuscriptZoom((current) => Math.min(current + 10, MANUSCRIPT_ZOOM_MAX))}
        onZoomOut={() => setManuscriptZoom((current) => Math.max(current - 10, MANUSCRIPT_ZOOM_MIN))}
        onZoomReset={() => setManuscriptZoom(DEFAULT_MANUSCRIPT_ZOOM)}
        saveState={saveState}
        showInspector={shouldShowInspector}
      />

      <div
        className={cn(
          phoneShell
            ? "mt-2 grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-visible pb-[9.5rem]"
            : "mt-3 grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden",
        )}
        style={desktopGridStyle}
      >
        {shouldShowChapterSidebar ? (
          <ProjectSidebar
            className={cn("hidden min-[960px]:flex", dockPaddingClass)}
            activeProjectId={project.id}
            activeTab={activeTab}
            onSelectChapter={setSelectedChapterId}
            onTabChange={setActiveTab}
            project={project}
            projects={projects.map((entry) => ({
              id: entry.id,
              title: entry.title,
              premise: entry.premise,
            }))}
            selectedChapterId={chapterId}
          />
        ) : null}
        {shouldShowChapterSidebar ? (
          <div
            aria-label="Resize chapter pane"
            className="hidden cursor-col-resize rounded-full bg-[color:var(--panel-strong)]/70 transition hover:bg-[rgba(var(--accent-rgb),0.25)] min-[960px]:block"
            onDoubleClick={() => setLeftPaneWidth(DEFAULT_LEFT_PANE_WIDTH)}
            onMouseDown={beginPaneResize("left")}
            role="separator"
          />
        ) : null}

        <section
          className={cn(
            phoneShell
              ? "grid min-w-0 gap-3 overflow-visible pb-4"
              : "grid min-w-0 min-h-0 gap-4 overflow-y-auto pr-1",
            dockPaddingClass,
          )}
        >
          {activeTab !== "chapters" ? (
            <Card className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
              <div className="grid gap-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Current Book</p>
                <h1 className="text-3xl font-semibold leading-none text-[var(--text)]">{project.title}</h1>
                <p className="max-w-4xl text-sm text-[var(--muted)]">{project.premise}</p>
                <p className="text-xs text-[var(--muted)]">
                  {aiMode === "AI setup required"
                    ? "AI setup required on this device. Open Settings -> AI providers and add your own key."
                    : "AI key location: Settings -> AI providers."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Chip>{project.chapters.length} chapters</Chip>
                {project.series ? (
                  <Chip>
                    {project.series.name}
                    {project.bookSettings.seriesOrder ? ` • Book ${project.bookSettings.seriesOrder}` : ""}
                  </Chip>
                ) : null}
                <Chip>{project.longTermMemoryItems.length} long-term items</Chip>
                <Chip>{project.shortTermMemoryItems.length} short-term items</Chip>
                <Chip>{saveState}</Chip>
                {autopilotRun ? <Chip>AI run: {autopilotRun.status.toLowerCase()}</Chip> : null}
                <Button onClick={openProviders} variant="secondary">
                  Add AI Key
                </Button>
                <Button onClick={() => void handleSaveNow()}>Save Now</Button>
              </div>
            </Card>
          ) : null}

          {activeTab === "ideaLab" && <IdeaLabTab mutateIdeaLab={mutateIdeaLab} project={project} />}
          {activeTab === "setup" && (
            <BookSetupTab
              availableSeriesNames={project.availableSeriesNames}
              busy={busyAction === "setup-save"}
              draft={setupDraft}
              onChange={applySetupPatch}
              onSave={handleSetupSave}
              seriesBooks={project.series?.books.filter((book) => book.projectId !== project.id) ?? []}
            />
          )}
          {activeTab === "bible" && (
            <StoryBibleTab
              mutateStoryBible={mutateStoryBible}
              onAiFieldAction={(options) =>
                handlePlanningAiFieldAction({
                  ...options,
                  scope: "STORY_BIBLE",
                  sectionLabel: "Story Bible",
                })
              }
              onCharacterAiAction={handleCharacterAiAction}
              project={project}
            />
          )}
            {activeTab === "skeleton" && (
              <StorySkeletonTab
                busy={busyAction === "story-plan"}
                mutateSkeleton={mutateSkeleton}
                onAddChapter={handleAddChapter}
                onAiFieldAction={(options) =>
                  handlePlanningAiFieldAction({
                    ...options,
                    scope: "SKELETON",
                    sectionLabel: "Story Skeleton",
                  })
                }
                onApplyBookPlan={handleApplyBookPlan}
                onDeleteChapter={handleDeleteChapter}
                onGeneratePlan={handleStoryPlan}
                onGenerateAllChapterOutlines={handleGenerateAllChapterOutlines}
                onSaveChapterPlan={handleSaveChapterPlan}
                planningBusy={busyAction === "structure-plan" || busyAction === "chapter-plan-save" || busyAction === "delete-chapter"}
                project={project}
                storyPlan={storyPlan}
              />
            )}
            {activeTab === "chapters" && (
            <ChaptersTab
              aiMode={aiMode}
              activeAiRole={activeAiRole}
              assistMode={assistMode}
              autopilotRun={autopilotRun}
              busyAction={busyAction}
              editor={editor}
              editorRef={editorRef}
              phoneShell={phoneShell}
              onAddChapter={handleAddChapter}
              onAutopilotRun={(options) => void handleAutopilotRun(options)}
              onApplySuggestion={handleApplySuggestion}
                onApplyGuideRecommendation={handleApplyGuideRecommendation}
                onAssist={handleAssist}
                onAssistModeChange={setAssistMode}
                onDismissSuggestion={() => setPendingSuggestion(null)}
                onDismissGuideReport={() => setBestsellerGuideReport(null)}
                onOpenAiDock={() => setCopilotExpanded(true)}
                onOpenProviders={openProviders}
                onOpenProjectTab={setActiveTab}
                onEditorChange={(patch) =>
                  applyEditorPatch(patch, {
                    groupTyping: Object.keys(patch).length === 1 && typeof patch.draft === "string",
                  })
                }
                onSelectChapter={setSelectedChapterId}
                bestsellerGuideReport={bestsellerGuideReport}
                pendingSuggestion={pendingSuggestion}
                project={project}
              saveState={saveState}
              manuscriptZoom={manuscriptZoom}
              selectedChapterId={chapterId}
              summaryOutput={summaryOutput}
              coachAdvice={coachAdvice}
              smartContextPaneWidth={chapterContextPaneWidth}
              showOutlinePanel={showChapterOutline}
              showPlanningPanel={showChapterPlanning}
              showSmartContextPane={showChapterContextPane}
              onToggleSmartContextPane={() => setShowChapterContextPane((current) => !current)}
              onBeginSmartContextResize={beginPaneResize("chapterContext")}
              onResetSmartContextWidth={() => setChapterContextPaneWidth(DEFAULT_CHAPTER_CONTEXT_WIDTH)}
              onDismissCoachAdvice={() => setCoachAdvice("")}
              onToggleOutlinePanel={() => setShowChapterOutline((current) => !current)}
              onTogglePlanningPanel={() => setShowChapterPlanning((current) => !current)}
            />
          )}
          {activeTab === "memory" && <MemoryTab onPromoteMemory={handlePromoteMemory} project={project} />}
          {activeTab === "continuity" && (
            <ContinuityTab busy={busyAction === "continuity"} onRunCheck={handleContinuityCheck} project={project} />
          )}
          {activeTab === "settings" && (
            <SettingsTab
              busy={busyAction === "setup-save"}
              draft={setupDraft}
              onChange={applySetupPatch}
              onSave={handleSetupSave}
              projectId={project.id}
            />
          )}
          {activeTab === "about" && (
            <AboutTab
              onOpenProviders={openProviders}
              onOpenTab={setActiveTab}
            />
          )}
          {activeTab === "help" && (
            <HelpTab
              onOpenProviders={openProviders}
              onOpenTab={setActiveTab}
            />
          )}
        </section>

        {shouldShowOuterInspector ? (
          <div
            aria-label="Resize context pane"
            className="hidden cursor-col-resize rounded-full bg-[color:var(--panel-strong)]/70 transition hover:bg-[rgba(var(--accent-rgb),0.25)] min-[960px]:block"
            onDoubleClick={() => setRightPaneWidth(DEFAULT_RIGHT_PANE_WIDTH)}
            onMouseDown={beginPaneResize("right")}
            role="separator"
          />
        ) : null}

        {shouldShowOuterInspector ? (
          <div className={cn("hidden min-[960px]:block min-h-0 overflow-y-auto pr-1", dockPaddingClass)}>
            <ContextInspector aiMode={aiMode} contextPackage={contextPackage} project={project} />
          </div>
        ) : null}
      </div>

      <AppLegalNotice className="mt-3 shrink-0" />

      {phoneShell ? (
        <div className="fixed inset-x-0 bottom-0 z-30 px-2 pb-[max(0.35rem,env(safe-area-inset-bottom))]">
          <Card className="rounded-[20px] border-[color:var(--line-strong)] bg-[color:var(--panel)]/98 px-1.5 py-1.5 shadow-[0_-10px_24px_var(--shadow)] backdrop-blur">
            <div className="grid grid-cols-5 gap-1">
              <Button
                className="min-h-[46px] flex-col gap-0.5 px-1 py-1.5 text-[10px]"
                onClick={() => {
                  setActiveTab("chapters");
                  setCopilotExpanded(true);
                }}
                variant={copilotExpanded ? "primary" : "ghost"}
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">AI</span>
                <span>Coach</span>
              </Button>
              <Button
                className="min-h-[46px] flex-col gap-0.5 px-1 py-1.5 text-[10px]"
                onClick={() => setActiveTab("chapters")}
                variant={activeTab === "chapters" ? "primary" : "ghost"}
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">Write</span>
                <span>Draft</span>
              </Button>
              <Button
                className="min-h-[46px] flex-col gap-0.5 px-1 py-1.5 text-[10px]"
                onClick={() => setActiveTab("bible")}
                variant={activeTab === "bible" ? "primary" : "ghost"}
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">Bible</span>
                <span>Cast</span>
              </Button>
              <Button
                className="min-h-[46px] flex-col gap-0.5 px-1 py-1.5 text-[10px]"
                onClick={() => setActiveTab("skeleton")}
                variant={activeTab === "skeleton" ? "primary" : "ghost"}
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">Arc</span>
                <span>Plot</span>
              </Button>
              <Button
                className="min-h-[46px] flex-col gap-0.5 px-1 py-1.5 text-[10px]"
                onClick={() => setActiveTab("setup")}
                variant={activeTab === "setup" ? "primary" : "ghost"}
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">Setup</span>
                <span>Book</span>
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      <ProjectCopilotBar
        activeAiRole={activeAiRole}
        activeTab={activeTab}
        dockClassName={phoneShell ? "bottom-[calc(4.2rem+env(safe-area-inset-bottom))]" : "bottom-0"}
        expanded={copilotExpanded}
        phoneShell={phoneShell}
        onBeforeSubmit={handleCopilotBeforeSubmit}
        onContextPackage={setContextPackage}
        onExpandedChange={setCopilotExpanded}
        onOpenProviders={openProviders}
        onProjectUpdate={refreshProject}
        onRoleChange={setActiveAiRole}
        onTabChange={setActiveTab}
        project={project}
        selectedChapterId={chapterId}
      />
    </main>
  );
}
