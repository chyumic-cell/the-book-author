import type { ProjectWorkspace } from "@/types/storyforge";

export type EditorState = {
  title: string;
  purpose: string;
  currentBeat: string;
  targetWordCount: number;
  keyBeats: string;
  requiredInclusions: string;
  forbiddenElements: string;
  desiredMood: string;
  sceneList: string;
  outline: string;
  draft: string;
  notes: string;
  povCharacterId: string | null;
};

export type SetupDraft = {
  title: string;
  premise: string;
  oneLineHook: string;
  authorName: string;
  seriesName: string;
  seriesOrder: number | null;
  genre: string;
  tone: string;
  audience: string;
  themes: string;
  pointOfView: string;
  tense: string;
  targetChapterLength: number;
  targetBookLength: number;
  storyBrief: string;
  plotDirection: string;
  pacingNotes: string;
  romanceLevel: number;
  darknessLevel: number;
  proseStyle: string;
  comparableTitles: string;
  guidanceIntensity: ProjectWorkspace["styleProfile"]["guidanceIntensity"];
  proseDensity: number;
  pacing: number;
  darkness: number;
  romanceIntensity: number;
  humorLevel: number;
  actionFrequency: number;
  mysteryDensity: number;
  dialogueDescriptionRatio: number;
  literaryCommercialBalance: number;
  aestheticGuide: string;
  styleGuide: string;
  voiceRules: string;
};

export const EDITOR_STATE_KEYS = [
  "title",
  "purpose",
  "currentBeat",
  "targetWordCount",
  "keyBeats",
  "requiredInclusions",
  "forbiddenElements",
  "desiredMood",
  "sceneList",
  "outline",
  "draft",
  "notes",
  "povCharacterId",
] as const satisfies readonly (keyof EditorState)[];

export const SETUP_DRAFT_KEYS = [
  "title",
  "premise",
  "oneLineHook",
  "authorName",
  "seriesName",
  "seriesOrder",
  "genre",
  "tone",
  "audience",
  "themes",
  "pointOfView",
  "tense",
  "targetChapterLength",
  "targetBookLength",
  "storyBrief",
  "plotDirection",
  "pacingNotes",
  "romanceLevel",
  "darknessLevel",
  "proseStyle",
  "comparableTitles",
  "guidanceIntensity",
  "proseDensity",
  "pacing",
  "darkness",
  "romanceIntensity",
  "humorLevel",
  "actionFrequency",
  "mysteryDensity",
  "dialogueDescriptionRatio",
  "literaryCommercialBalance",
  "aestheticGuide",
  "styleGuide",
  "voiceRules",
] as const satisfies readonly (keyof SetupDraft)[];

export function splitLines(value: string) {
  return value
    .split(/\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function shallowEqualByKeys<T extends object, K extends keyof T>(
  left: T,
  right: T,
  keys: readonly K[],
) {
  return keys.every((key) => left[key] === right[key]);
}

export function toSetupDraft(project: ProjectWorkspace): SetupDraft {
  return {
    title: project.title,
    premise: project.premise,
    oneLineHook: project.oneLineHook,
    authorName: project.bookSettings.authorName,
    seriesName: project.bookSettings.seriesName,
    seriesOrder: project.bookSettings.seriesOrder,
    genre: project.bookSettings.genre,
    tone: project.bookSettings.tone,
    audience: project.bookSettings.audience,
    themes: project.bookSettings.themes.join("\n"),
    pointOfView: project.bookSettings.pointOfView,
    tense: project.bookSettings.tense,
    targetChapterLength: project.bookSettings.targetChapterLength,
    targetBookLength: project.bookSettings.targetBookLength,
    storyBrief: project.bookSettings.storyBrief,
    plotDirection: project.bookSettings.plotDirection,
    pacingNotes: project.bookSettings.pacingNotes,
    romanceLevel: project.bookSettings.romanceLevel,
    darknessLevel: project.bookSettings.darknessLevel,
    proseStyle: project.bookSettings.proseStyle,
    comparableTitles: project.bookSettings.comparableTitles.join("\n"),
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
    aestheticGuide: project.styleProfile.aestheticGuide,
    styleGuide: project.styleProfile.styleGuide,
    voiceRules: project.styleProfile.voiceRules.join("\n"),
  };
}

export function toEditorState(project: ProjectWorkspace, chapterId: string | null): EditorState {
  const chapter = project.chapters.find((entry) => entry.id === chapterId) ?? project.chapters.at(-1);

  return {
    title: chapter?.title ?? "",
    purpose: chapter?.purpose ?? "",
    currentBeat: chapter?.currentBeat ?? "",
    targetWordCount: chapter?.targetWordCount ?? project.bookSettings.targetChapterLength,
    keyBeats: chapter?.keyBeats.join("\n") ?? "",
    requiredInclusions: chapter?.requiredInclusions.join("\n") ?? "",
    forbiddenElements: chapter?.forbiddenElements.join("\n") ?? "",
    desiredMood: chapter?.desiredMood ?? "",
    sceneList: chapter?.sceneList.join("\n") ?? "",
    outline: chapter?.outline ?? "",
    draft: chapter?.draft ?? "",
    notes: chapter?.notes ?? "",
    povCharacterId: chapter?.povCharacterId ?? null,
  };
}

export function toProjectUpdatePayload(draft: SetupDraft) {
  return {
    title: draft.title,
    premise: draft.premise,
    oneLineHook: draft.oneLineHook,
    bookSettings: {
      authorName: draft.authorName,
      seriesName: draft.seriesName,
      seriesOrder: draft.seriesOrder,
      genre: draft.genre,
      tone: draft.tone,
      audience: draft.audience,
      themes: splitLines(draft.themes),
      pointOfView: draft.pointOfView,
      tense: draft.tense,
      targetChapterLength: draft.targetChapterLength,
      targetBookLength: draft.targetBookLength,
      storyBrief: draft.storyBrief,
      plotDirection: draft.plotDirection,
      pacingNotes: draft.pacingNotes,
      romanceLevel: draft.romanceLevel,
      darknessLevel: draft.darknessLevel,
      proseStyle: draft.proseStyle,
      comparableTitles: splitLines(draft.comparableTitles),
    },
    styleProfile: {
      guidanceIntensity: draft.guidanceIntensity,
      proseDensity: draft.proseDensity,
      pacing: draft.pacing,
      darkness: draft.darkness,
      romanceIntensity: draft.romanceIntensity,
      humorLevel: draft.humorLevel,
      actionFrequency: draft.actionFrequency,
      mysteryDensity: draft.mysteryDensity,
      dialogueDescriptionRatio: draft.dialogueDescriptionRatio,
      literaryCommercialBalance: draft.literaryCommercialBalance,
      aestheticGuide: draft.aestheticGuide,
      styleGuide: draft.styleGuide,
      voiceRules: splitLines(draft.voiceRules),
    },
  };
}

export async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const json = await response.json();

  if (!response.ok || !json.ok) {
    throw new Error(json.error || "Request failed.");
  }

  return json.data as T;
}
