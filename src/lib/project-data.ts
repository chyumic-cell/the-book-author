import "server-only";

import { prisma } from "@/lib/prisma";
import {
  normalizeCharacterCustomFields,
  normalizeCharacterDossier,
  normalizeCharacterQuickProfile,
  normalizeCharacterState,
} from "@/lib/character-dossier";
import { compactText, safeArray, wordCount } from "@/lib/utils";
import type {
  AiAssistRunRecord,
  ChapterRecord,
  ChapterSummaryRecord,
  ContinuityIssueRecord,
  MemoryItemRecord,
  ProjectWorkspace,
  SceneCardRecord,
  StructureBeatRecord,
  WorkingNoteRecord,
} from "@/types/storyforge";

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function mapMemoryItem(
  item: {
    id: string;
    title: string;
    content: string;
    category: string;
    tags: unknown;
    relevanceScore: number;
    durabilityScore: number;
    status: string;
    promotionReason: string | null;
    relatedChapterId: string | null;
    characters: { characterId: string }[];
    locations: { locationId: string }[];
    plotThreads: { plotThreadId: string }[];
  },
): MemoryItemRecord {
  return {
    id: item.id,
    title: item.title,
    content: item.content,
    category: item.category,
    tags: asStringArray(item.tags),
    relevanceScore: item.relevanceScore,
    durabilityScore: item.durabilityScore,
    status: item.status,
    promotionReason: item.promotionReason ?? "",
    relatedChapterId: item.relatedChapterId ?? null,
    relatedCharacterIds: item.characters.map((entry) => entry.characterId),
    relatedLocationIds: item.locations.map((entry) => entry.locationId),
    relatedPlotThreadIds: item.plotThreads.map((entry) => entry.plotThreadId),
  };
}

function mapChapterSummary(summary: {
  id: string;
  kind: string;
  summary: string;
  bridgeText: string | null;
  emotionalTone: string | null;
  unresolvedQuestions: unknown;
}): ChapterSummaryRecord {
  return {
    id: summary.id,
    kind: summary.kind,
    summary: summary.summary,
    bridgeText: summary.bridgeText ?? "",
    emotionalTone: summary.emotionalTone ?? "",
    unresolvedQuestions: asStringArray(summary.unresolvedQuestions),
  };
}

function mapContinuityIssue(issue: {
  id: string;
  chapterId: string | null;
  severity: "LOW" | "MEDIUM" | "HIGH";
  confidence: number;
  checkMode: "QUICK" | "CHAPTER" | "ARC" | "FULL_BOOK" | "PRE_GENERATION" | "POST_GENERATION";
  issueType: string;
  title: string;
  description: string;
  explanation: string | null;
  suggestedContext: string | null;
  relatedEntity: string | null;
  affectedElements: unknown;
  status: string;
}): ContinuityIssueRecord {
  return {
    id: issue.id,
    chapterId: issue.chapterId ?? null,
    severity: issue.severity,
    confidence: issue.confidence,
    checkMode: issue.checkMode,
    issueType: issue.issueType,
    title: issue.title,
    description: issue.description,
    explanation: issue.explanation ?? issue.description,
    suggestedContext: issue.suggestedContext ?? "",
    relatedEntity: issue.relatedEntity ?? "",
    affectedElements: asStringArray(issue.affectedElements),
    status: issue.status,
  };
}

function mapAssistRun(run: {
  id: string;
  chapterId: string;
  mode: AiAssistRunRecord["mode"];
  role: AiAssistRunRecord["role"];
  actionType: AiAssistRunRecord["actionType"];
  selectionText: string | null;
  instruction: string | null;
  contextNote: string | null;
  suggestion: string;
  status: AiAssistRunRecord["status"];
}): AiAssistRunRecord {
  return {
    id: run.id,
    chapterId: run.chapterId,
    mode: run.mode,
    role: run.role,
    actionType: run.actionType,
    selectionText: run.selectionText ?? "",
    instruction: run.instruction ?? "",
    contextNote: run.contextNote ?? "",
    suggestion: run.suggestion,
    status: run.status,
  };
}

function mapWorkingNote(note: {
  id: string;
  linkedChapterId: string | null;
  title: string;
  content: string;
  type: WorkingNoteRecord["type"];
  status: WorkingNoteRecord["status"];
  tags: unknown;
}): WorkingNoteRecord {
  return {
    id: note.id,
    linkedChapterId: note.linkedChapterId,
    title: note.title,
    content: note.content,
    type: note.type,
    status: note.status,
    tags: asStringArray(note.tags),
  };
}

function mapStructureBeat(beat: {
  id: string;
  chapterId: string | null;
  type: StructureBeatRecord["type"];
  label: string;
  description: string;
  notes: string | null;
  status: StructureBeatRecord["status"];
  orderIndex: number;
}): StructureBeatRecord {
  return {
    id: beat.id,
    chapterId: beat.chapterId,
    type: beat.type,
    label: beat.label,
    description: beat.description,
    notes: beat.notes ?? "",
    status: beat.status,
    orderIndex: beat.orderIndex,
  };
}

function mapSceneCard(scene: {
  id: string;
  chapterId: string | null;
  povCharacterId: string | null;
  title: string;
  summary: string | null;
  goal: string | null;
  conflict: string | null;
  outcome: string | null;
  outcomeType: SceneCardRecord["outcomeType"];
  locationHint: string | null;
  orderIndex: number;
  frozen: boolean;
}): SceneCardRecord {
  return {
    id: scene.id,
    chapterId: scene.chapterId,
    povCharacterId: scene.povCharacterId,
    title: scene.title,
    summary: scene.summary ?? "",
    goal: scene.goal ?? "",
    conflict: scene.conflict ?? "",
    outcome: scene.outcome ?? "",
    outcomeType: scene.outcomeType,
    locationHint: scene.locationHint ?? "",
    orderIndex: scene.orderIndex,
    frozen: scene.frozen,
  };
}

export async function listProjects() {
  return prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      seriesOrder: true,
      title: true,
      slug: true,
      premise: true,
      oneLineHook: true,
      updatedAt: true,
      series: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      chapters: { select: { id: true } },
      continuityIssues: { where: { status: "OPEN" }, select: { id: true } },
    },
  });
}

export async function getProjectWorkspace(projectId: string): Promise<ProjectWorkspace | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      series: {
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
        },
      },
      bookSettings: true,
      styleProfile: true,
      generationPresets: { orderBy: [{ isBuiltIn: "desc" }, { name: "asc" }] },
      characters: { orderBy: { name: "asc" } },
      relationships: {
        include: {
          sourceCharacter: { select: { id: true, name: true } },
          targetCharacter: { select: { id: true, name: true } },
        },
      },
      locations: { orderBy: { name: "asc" } },
      factions: { orderBy: { name: "asc" } },
      timelineEvents: { orderBy: { orderIndex: "asc" } },
      plotThreads: { orderBy: [{ heat: "desc" }, { updatedAt: "desc" }] },
      ideaEntries: { orderBy: [{ isFavorite: "desc" }, { updatedAt: "desc" }] },
      workingNotes: { orderBy: { updatedAt: "desc" } },
      structureBeats: { orderBy: { orderIndex: "asc" } },
      sceneCards: { orderBy: [{ chapterId: "asc" }, { orderIndex: "asc" }] },
      chapters: {
        orderBy: { number: "asc" },
        include: {
          summaries: { orderBy: { createdAt: "desc" } },
        },
      },
      longTermMemoryItems: {
        orderBy: [{ isPinned: "desc" }, { relevanceScore: "desc" }],
        include: {
          characters: true,
          locations: true,
          plotThreads: true,
        },
      },
      shortTermMemoryItems: {
        orderBy: [{ relevanceScore: "desc" }, { updatedAt: "desc" }],
        include: {
          characters: true,
          locations: true,
          plotThreads: true,
        },
      },
      continuityIssues: {
        orderBy: [{ severity: "desc" }, { updatedAt: "desc" }],
      },
      assistRuns: {
        orderBy: { createdAt: "desc" },
        take: 24,
      },
    },
  });

  if (!project || !project.bookSettings || !project.styleProfile) {
    return null;
  }

  const [availableSeries, seriesDetail] = await Promise.all([
    prisma.series.findMany({
      orderBy: { name: "asc" },
      select: { name: true },
    }),
    project.seriesId
      ? prisma.series.findUnique({
          where: { id: project.seriesId },
          include: {
            projects: {
              orderBy: [{ seriesOrder: "asc" }, { updatedAt: "desc" }],
              select: {
                id: true,
                title: true,
                slug: true,
                premise: true,
                oneLineHook: true,
                seriesOrder: true,
                chapters: { select: { id: true } },
                characters: {
                  select: {
                    name: true,
                    role: true,
                    summary: true,
                    quickProfile: true,
                    dossier: true,
                  },
                },
                locations: {
                  select: {
                    name: true,
                    summary: true,
                    atmosphere: true,
                  },
                },
                plotThreads: {
                  select: {
                    title: true,
                    summary: true,
                    status: true,
                    promisedPayoff: true,
                  },
                },
                longTermMemoryItems: {
                  where: {
                    status: { in: ["ACTIVE", "PROMOTED"] },
                  },
                  orderBy: [{ isPinned: "desc" }, { relevanceScore: "desc" }],
                  take: 8,
                  select: {
                    title: true,
                    content: true,
                  },
                },
              },
            },
          },
        })
      : null,
  ]);

  const bookSettings = project.bookSettings;
  const styleProfile = project.styleProfile;

  const chapters: ChapterRecord[] = project.chapters.map((chapter) => ({
    id: chapter.id,
    number: chapter.number,
    title: chapter.title,
    purpose: chapter.purpose,
    povCharacterId: chapter.povCharacterId,
    currentBeat: chapter.currentBeat ?? "",
    targetWordCount: chapter.targetWordCount ?? bookSettings.targetChapterLength,
    keyBeats: asStringArray(chapter.keyBeats),
    requiredInclusions: asStringArray(chapter.requiredInclusions),
    forbiddenElements: asStringArray(chapter.forbiddenElements),
    desiredMood: chapter.desiredMood ?? "",
    sceneList: asStringArray(chapter.sceneList),
    outline: chapter.outline ?? "",
    draft: chapter.draft ?? "",
    notes: chapter.notes ?? "",
    status: chapter.status,
    wordCount: wordCount(chapter.draft),
    summaries: chapter.summaries.map(mapChapterSummary),
  }));

  const series = seriesDetail
    ? {
        id: seriesDetail.id,
        name: seriesDetail.name,
        slug: seriesDetail.slug,
        description: seriesDetail.description ?? "",
        books: seriesDetail.projects.map((entry) => ({
          projectId: entry.id,
          title: entry.title,
          slug: entry.slug,
          premise: entry.premise,
          oneLineHook: entry.oneLineHook ?? "",
          seriesOrder: entry.seriesOrder,
          chapterCount: entry.chapters.length,
        })),
        sharedCharacterNames: Array.from(
          new Set(
            seriesDetail.projects
              .flatMap((entry) => entry.characters.map((character) => character.name))
              .filter(Boolean),
          ),
        ).slice(0, 18),
        sharedLocationNames: Array.from(
          new Set(
            seriesDetail.projects
              .flatMap((entry) => entry.locations.map((location) => location.name))
              .filter(Boolean),
          ),
        ).slice(0, 18),
        sharedPlotThreadTitles: Array.from(
          new Set(
            seriesDetail.projects
              .flatMap((entry) => entry.plotThreads.map((thread) => thread.title))
              .filter(Boolean),
          ),
        ).slice(0, 18),
      }
    : null;

  const seriesCanonicalAnchors = seriesDetail
    ? seriesDetail.projects
        .filter((entry) => entry.id !== project.id)
        .flatMap((entry) => [
          ...(entry.oneLineHook ? [`Series book ${entry.seriesOrder ?? "?"}: ${entry.title} - ${entry.oneLineHook}`] : []),
          ...entry.characters.slice(0, 4).map((character) => {
            const quickProfile = normalizeCharacterQuickProfile(character.quickProfile);
            const dossier = normalizeCharacterDossier(character.dossier, character.name);
            const details = [
              character.role ?? "",
              character.summary,
              quickProfile.accent ? `accent ${quickProfile.accent}` : "",
              quickProfile.speechPattern ? `speech ${quickProfile.speechPattern}` : "",
              dossier.motivationStory.arcDirection ? `arc ${dossier.motivationStory.arcDirection}` : "",
            ]
              .filter(Boolean)
              .join(" | ");

            return `Series character from ${entry.title}: ${character.name}${details ? ` - ${compactText(details, 220)}` : ""}`;
          }),
          ...entry.locations.slice(0, 3).map(
            (location) =>
              `Series location from ${entry.title}: ${location.name} - ${compactText([location.summary, location.atmosphere].filter(Boolean).join(" | "), 200)}`,
          ),
          ...entry.plotThreads.slice(0, 4).map(
            (thread) =>
              `Series arc from ${entry.title}: ${thread.title} - ${compactText([thread.summary, thread.promisedPayoff ?? "", thread.status].filter(Boolean).join(" | "), 220)}`,
          ),
          ...entry.longTermMemoryItems.slice(0, 4).map(
            (item) => `Series canon from ${entry.title}: ${item.title} - ${compactText(item.content, 200)}`,
          ),
        ])
        .filter(Boolean)
    : [];

  return {
    id: project.id,
    title: project.title,
    slug: project.slug,
    premise: project.premise,
    oneLineHook: project.oneLineHook ?? "",
    availableSeriesNames: availableSeries.map((entry) => entry.name),
    series,
    bookSettings: {
      authorName: bookSettings.authorName ?? "",
      seriesName: project.series?.name ?? bookSettings.seriesName ?? "",
      seriesOrder: project.seriesOrder ?? bookSettings.seriesOrder ?? null,
      genre: bookSettings.genre,
      tone: bookSettings.tone,
      audience: bookSettings.audience,
      themes: asStringArray(bookSettings.themes),
      pointOfView: bookSettings.pointOfView,
      tense: bookSettings.tense,
      targetChapterLength: bookSettings.targetChapterLength,
      targetBookLength: bookSettings.targetBookLength,
      storyBrief: bookSettings.storyBrief,
      plotDirection: bookSettings.plotDirection,
      pacingNotes: bookSettings.pacingNotes ?? "",
      romanceLevel: bookSettings.romanceLevel,
      darknessLevel: bookSettings.darknessLevel,
      proseStyle: bookSettings.proseStyle ?? "",
      comparableTitles: asStringArray(bookSettings.comparableTitles),
    },
    styleProfile: {
      guidanceIntensity: styleProfile.guidanceIntensity,
      proseDensity: styleProfile.proseDensity,
      pacing: styleProfile.pacing,
      darkness: styleProfile.darkness,
      romanceIntensity: styleProfile.romanceIntensity,
      humorLevel: styleProfile.humorLevel,
      actionFrequency: styleProfile.actionFrequency,
      mysteryDensity: styleProfile.mysteryDensity,
      dialogueDescriptionRatio: styleProfile.dialogueDescriptionRatio,
      literaryCommercialBalance: styleProfile.literaryCommercialBalance,
      aestheticGuide: styleProfile.aestheticGuide ?? "",
      styleGuide: styleProfile.styleGuide ?? "",
      voiceRules: asStringArray(styleProfile.voiceRules),
    },
    generationPresets: project.generationPresets.map((preset) => ({
      id: preset.id,
      name: preset.name,
      description: preset.description,
      genre: preset.genre,
      proseDensity: preset.proseDensity,
      pacing: preset.pacing,
      darkness: preset.darkness,
      romanceIntensity: preset.romanceIntensity,
      humorLevel: preset.humorLevel,
      actionFrequency: preset.actionFrequency,
      mysteryDensity: preset.mysteryDensity,
      dialogueDescriptionRatio: preset.dialogueDescriptionRatio,
      literaryCommercialBalance: preset.literaryCommercialBalance,
      guidanceIntensity: preset.guidanceIntensity,
      isBuiltIn: preset.isBuiltIn,
    })),
    characters: project.characters.map((character) => ({
      id: character.id,
      name: character.name,
      role: character.role ?? "",
      archetype: character.archetype ?? "",
      summary: character.summary,
      goal: character.goal ?? "",
      fear: character.fear ?? "",
      secret: character.secret ?? "",
      wound: character.wound ?? "",
      quirks: asStringArray(character.quirks),
      notes: character.notes ?? "",
      tags: asStringArray(character.tags),
      povEligible: character.povEligible,
      quickProfile: normalizeCharacterQuickProfile(character.quickProfile),
      dossier: normalizeCharacterDossier(character.dossier, character.name),
      currentState: normalizeCharacterState(character.currentState),
      customFields: normalizeCharacterCustomFields(character.customFields),
      pinnedFields: asStringArray(character.pinnedFields),
    })),
    relationships: project.relationships.map((relationship) => ({
      id: relationship.id,
      sourceCharacterId: relationship.sourceCharacterId,
      sourceCharacterName: relationship.sourceCharacter.name,
      targetCharacterId: relationship.targetCharacterId,
      targetCharacterName: relationship.targetCharacter.name,
      kind: relationship.kind,
      description: relationship.description,
      tension: relationship.tension ?? "",
      status: relationship.status ?? "",
    })),
    locations: project.locations.map((location) => ({
      id: location.id,
      name: location.name,
      summary: location.summary,
      atmosphere: location.atmosphere ?? "",
      rules: location.rules ?? "",
      notes: location.notes ?? "",
      tags: asStringArray(location.tags),
    })),
    factions: project.factions.map((faction) => ({
      id: faction.id,
      name: faction.name,
      summary: faction.summary,
      agenda: faction.agenda ?? "",
      resources: faction.resources ?? "",
      notes: faction.notes ?? "",
      tags: asStringArray(faction.tags),
    })),
    timelineEvents: project.timelineEvents.map((event) => ({
      id: event.id,
      label: event.label,
      description: event.description,
      orderIndex: event.orderIndex,
      occursAtChapter: event.occursAtChapter,
    })),
    plotThreads: project.plotThreads.map((thread) => ({
      id: thread.id,
      title: thread.title,
      summary: thread.summary,
      status: thread.status,
      heat: thread.heat,
      promisedPayoff: thread.promisedPayoff ?? "",
      lastTouchedChapter: thread.lastTouchedChapter,
      progressMarkers: Array.isArray(thread.progressMarkers)
        ? thread.progressMarkers.map((marker) => {
            const source = (marker as Record<string, unknown> | null) ?? {};
            return {
              chapterNumber: Number(source.chapterNumber) || 0,
              label: typeof source.label === "string" ? source.label : "",
              strength:
                (typeof source.strength === "string" ? source.strength : "DEVELOPED") as
                  | "INTRODUCED"
                  | "DEVELOPED"
                  | "ESCALATED"
                  | "STALLED"
                  | "RESOLVED",
              notes: typeof source.notes === "string" ? source.notes : "",
            };
          })
        : [],
    })),
    ideaEntries: project.ideaEntries.map((idea) => ({
      id: idea.id,
      title: idea.title,
      content: idea.content,
      type: idea.type,
      status: idea.status,
      source: idea.source ?? "",
      tags: asStringArray(idea.tags),
      isFavorite: idea.isFavorite,
    })),
    workingNotes: project.workingNotes.map(mapWorkingNote),
    structureBeats: project.structureBeats.map(mapStructureBeat),
    sceneCards: project.sceneCards.map(mapSceneCard),
    chapters,
    longTermMemoryItems: project.longTermMemoryItems.map(mapMemoryItem),
    shortTermMemoryItems: project.shortTermMemoryItems.map(mapMemoryItem),
    continuityIssues: project.continuityIssues.map(mapContinuityIssue),
    assistRuns: project.assistRuns.map(mapAssistRun),
    seriesCanonicalAnchors,
  };
}

export function getLatestChapterSummary(chapter: ChapterRecord | undefined) {
  return chapter?.summaries[0]?.summary ?? "";
}

export function getChapterById(project: ProjectWorkspace, chapterId: string | null | undefined) {
  return project.chapters.find((chapter) => chapter.id === chapterId) ?? project.chapters.at(-1) ?? null;
}

export function getDefaultThemeList(project: ProjectWorkspace) {
  return safeArray(project.bookSettings.themes);
}
