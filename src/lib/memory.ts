import { Prisma } from "@prisma/client";

import { buildCharacterPromptCard, buildCharacterVoicePromptCard } from "@/lib/character-dossier";
import { isBookRuleNote } from "@/lib/book-rules";
import { cleanCharacterNotes, cleanSummaryText, sanitizeManuscriptText } from "@/lib/ai-output";
import { prisma } from "@/lib/prisma";
import { getChapterById, getLatestChapterSummary, getProjectWorkspace } from "@/lib/project-data";
import { detectPlotThreadSignal } from "@/lib/story-analysis";
import { compactText, wordCount } from "@/lib/utils";
import type {
  ContextPackage,
  MemoryExtractionResult,
  MemoryItemRecord,
  ProjectWorkspace,
} from "@/types/storyforge";

function uniqueNonEmpty(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => (value ?? "").trim())
        .filter(Boolean),
    ),
  );
}

function scoreNameMention(name: string, text: string) {
  if (!name || !text) {
    return 0;
  }

  return text.toLowerCase().includes(name.toLowerCase()) ? 1 : 0;
}

function scoreTextMatch(text: string, needles: string[]) {
  const haystack = text.toLowerCase();

  return needles.reduce((score, needle) => {
    if (!needle) {
      return score;
    }

    return haystack.includes(needle.toLowerCase()) ? score + 1 : score;
  }, 0);
}

function scoreMemoryItem(
  item: MemoryItemRecord,
  seeds: string[],
  relatedCharacterIds: string[],
  relatedPlotThreadIds: string[],
) {
  const tagScore = scoreTextMatch(item.tags.join(" "), seeds) * 0.2;
  const contentScore = scoreTextMatch(`${item.title} ${item.content}`, seeds) * 0.18;
  const characterScore = item.relatedCharacterIds.some((id) => relatedCharacterIds.includes(id))
    ? 0.35
    : 0;
  const threadScore = item.relatedPlotThreadIds.some((id) => relatedPlotThreadIds.includes(id))
    ? 0.25
    : 0;

  return (
    item.relevanceScore * 0.3 +
    item.durabilityScore * 0.15 +
    tagScore +
    contentScore +
    characterScore +
    threadScore
  );
}

function approximateTokens(parts: string[]) {
  const words = parts.reduce((sum, part) => sum + wordCount(part), 0);
  return Math.ceil(words * 1.35);
}

function pickRelevantSeriesContext(project: ProjectWorkspace, seeds: string[]) {
  return (project.seriesCanonicalAnchors ?? [])
    .map((entry) => ({
      entry,
      score: scoreTextMatch(entry, seeds) + (seeds.length === 0 ? 0 : 0.1),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 10)
    .map(({ entry }) => entry);
}

function scorePlotThreadMention(thread: ProjectWorkspace["plotThreads"][number], text: string) {
  const signal = detectPlotThreadSignal(thread, text);
  return signal.touched ? signal.score : 0;
}

function buildChapterSignal(project: ProjectWorkspace, chapter: ProjectWorkspace["chapters"][number], localExcerpt?: string) {
  return [
    chapter.title,
    chapter.purpose,
    chapter.currentBeat,
    chapter.desiredMood,
    chapter.outline,
    chapter.notes,
    chapter.draft,
    ...chapter.keyBeats,
    ...chapter.requiredInclusions,
    ...chapter.sceneList,
    project.bookSettings.storyBrief,
    project.bookSettings.plotDirection,
    ...project.bookSettings.themes,
    project.bookSettings.pacingNotes,
    project.bookSettings.proseStyle,
    ...(localExcerpt ? [localExcerpt] : []),
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

function buildChapterBlueprint(chapter: ProjectWorkspace["chapters"][number]) {
  return [
    `Chapter ${chapter.number}: ${chapter.title}`,
    chapter.purpose ? `Purpose: ${chapter.purpose}` : "",
    chapter.currentBeat ? `Current beat: ${chapter.currentBeat}` : "",
    chapter.desiredMood ? `Desired mood: ${chapter.desiredMood}` : "",
    chapter.keyBeats.length ? `Key beats: ${chapter.keyBeats.join(" | ")}` : "",
    chapter.requiredInclusions.length ? `Required inclusions: ${chapter.requiredInclusions.join(" | ")}` : "",
    chapter.forbiddenElements.length ? `Forbidden elements: ${chapter.forbiddenElements.join(" | ")}` : "",
    chapter.sceneList.length ? `Scene list: ${chapter.sceneList.join(" | ")}` : "",
    chapter.outline ? `Outline: ${compactText(chapter.outline, 420)}` : "",
    chapter.notes ? `Notes: ${compactText(chapter.notes, 320)}` : "",
  ].filter(Boolean);
}

function pickRelevantCharacters(
  project: ProjectWorkspace,
  chapter: ProjectWorkspace["chapters"][number],
  activeThreads: ProjectWorkspace["plotThreads"],
  localExcerpt?: string,
) {
  const chapterSignal = buildChapterSignal(project, chapter, localExcerpt);
  const seeds = [
    chapter.title,
    chapter.purpose,
    chapter.currentBeat,
    chapter.desiredMood,
    ...chapter.keyBeats,
    ...chapter.requiredInclusions,
  ].filter(Boolean);
  const activeThreadText = activeThreads.map((thread) => `${thread.title} ${thread.summary}`).join(" ");

  return project.characters
    .map((character) => {
      const relationshipScore = project.relationships.some(
        (relationship) =>
          relationship.sourceCharacterId === character.id || relationship.targetCharacterId === character.id,
      )
        ? 0.2
        : 0;
      const score =
        (character.id === chapter.povCharacterId ? 5 : 0) +
        scoreNameMention(character.name, chapterSignal) * 4 +
        scoreTextMatch(
          [
            character.name,
            character.role,
            character.summary,
            character.goal,
            character.fear,
            character.secret,
            character.quickProfile.accent,
            character.quickProfile.speechPattern,
            character.dossier.freeTextCore,
            character.currentState.emotionalState,
            activeThreadText,
          ]
            .filter(Boolean)
            .join(" "),
          seeds,
        ) *
          0.35 +
        relationshipScore;

      return { character, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
    .map(({ character }) => character);
}

function pickRelevantLocations(
  project: ProjectWorkspace,
  chapter: ProjectWorkspace["chapters"][number],
  localExcerpt?: string,
) {
  const chapterSignal = buildChapterSignal(project, chapter, localExcerpt);
  const seeds = [chapter.title, chapter.purpose, chapter.currentBeat, ...chapter.sceneList].filter(Boolean);

  return project.locations
    .map((location) => ({
      location,
      score:
        scoreNameMention(location.name, chapterSignal) * 4 +
        scoreTextMatch(`${location.name} ${location.summary} ${location.atmosphere} ${location.rules}`, seeds) * 0.4,
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map(({ location }) => location);
}

function pickRelevantFactions(
  project: ProjectWorkspace,
  chapter: ProjectWorkspace["chapters"][number],
  localExcerpt?: string,
) {
  const chapterSignal = buildChapterSignal(project, chapter, localExcerpt);
  const seeds = [chapter.title, chapter.purpose, chapter.currentBeat, ...chapter.requiredInclusions].filter(Boolean);

  return project.factions
    .map((faction) => ({
      faction,
      score:
        scoreNameMention(faction.name, chapterSignal) * 4 +
        scoreTextMatch(`${faction.name} ${faction.summary} ${faction.agenda} ${faction.resources}`, seeds) * 0.35,
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map(({ faction }) => faction);
}

function pickRelevantTimelineEvents(project: ProjectWorkspace, chapter: ProjectWorkspace["chapters"][number]) {
  return (project.timelineEvents ?? [])
    .filter(
      (event) =>
        event.occursAtChapter === null ||
        event.occursAtChapter === chapter.number ||
        Math.abs(event.occursAtChapter - chapter.number) <= 1,
    )
    .slice(0, 4);
}

function pickRelevantStructureBeats(project: ProjectWorkspace, chapter: ProjectWorkspace["chapters"][number]) {
  return (project.structureBeats ?? [])
    .filter(
      (beat) =>
        beat.chapterId === null ||
        beat.chapterId === chapter.id ||
        Math.abs(beat.orderIndex - chapter.number) <= 1,
    )
    .slice(0, 4);
}

function pickRelevantSceneCards(project: ProjectWorkspace, chapter: ProjectWorkspace["chapters"][number]) {
  return (project.sceneCards ?? [])
    .filter((scene) => scene.chapterId === chapter.id || scene.chapterId === null)
    .slice(0, 4);
}

function buildStoryBibleContext(
  project: ProjectWorkspace,
  chapter: ProjectWorkspace["chapters"][number],
  activeThreads: ProjectWorkspace["plotThreads"],
  localExcerpt?: string,
) {
  const relevantCharacters = pickRelevantCharacters(project, chapter, activeThreads, localExcerpt);
  const relevantLocations = pickRelevantLocations(project, chapter, localExcerpt);
  const relevantFactions = pickRelevantFactions(project, chapter, localExcerpt);
  const relevantTimelineEvents = pickRelevantTimelineEvents(project, chapter);
  const relevantBookRules = (project.workingNotes ?? [])
    .filter((note) => isBookRuleNote(note))
    .map((note) => ({
      note,
      score:
        scoreTextMatch(`${note.title} ${note.content} ${note.tags.join(" ")}`, [
          chapter.title,
          chapter.purpose,
          chapter.currentBeat,
          chapter.desiredMood,
          ...chapter.keyBeats,
          ...chapter.requiredInclusions,
          ...(localExcerpt ? [localExcerpt] : []),
        ].filter(Boolean)) + 0.5,
    }))
    .filter(({ score }) => score > 0.5)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
    .map(({ note }) => note);

  return [
    project.oneLineHook ? `Hook: ${project.oneLineHook}` : "",
    project.bookSettings.themes.length ? `Themes: ${project.bookSettings.themes.join(" | ")}` : "",
    project.bookSettings.pacingNotes ? `Pacing notes: ${project.bookSettings.pacingNotes}` : "",
    project.bookSettings.proseStyle ? `Prose style: ${project.bookSettings.proseStyle}` : "",
    project.bookSettings.comparableTitles.length
      ? `Comparable titles: ${project.bookSettings.comparableTitles.join(" | ")}`
      : "",
    ...relevantCharacters.map((character) => `Character dossier: ${buildCharacterPromptCard(character)}`),
    ...relevantLocations.map((location) =>
      `Location: ${location.name} - ${compactText([location.summary, location.atmosphere, location.rules].filter(Boolean).join(" | "), 220)}`,
    ),
    ...relevantFactions.map((faction) =>
      `Faction: ${faction.name} - ${compactText([faction.summary, faction.agenda, faction.resources].filter(Boolean).join(" | "), 220)}`,
    ),
    ...relevantTimelineEvents.map((event) =>
      `Timeline: ${event.label} - ${compactText(event.description, 180)}`,
    ),
    ...relevantBookRules.map((note) =>
      `Book rule: ${note.title} - ${compactText(note.content, 220)}`,
    ),
  ].filter(Boolean);
}

function buildDialogueVoiceContext(
  project: ProjectWorkspace,
  chapter: ProjectWorkspace["chapters"][number],
  activeThreads: ProjectWorkspace["plotThreads"],
  localExcerpt?: string,
) {
  const relevantCharacters = pickRelevantCharacters(project, chapter, activeThreads, localExcerpt).slice(0, 4);
  const relevantIds = new Set(relevantCharacters.map((character) => character.id));
  const relevantRelationships = project.relationships.filter(
    (relationship) =>
      relevantIds.has(relationship.sourceCharacterId) && relevantIds.has(relationship.targetCharacterId),
  );

  const relationshipLines = relevantRelationships.slice(0, 4).map((relationship) => {
    const details = [
      relationship.kind ? `Relationship: ${relationship.kind}` : "",
      relationship.description ? `Dynamic: ${compactText(relationship.description, 140)}` : "",
      relationship.tension ? `Tension: ${compactText(relationship.tension, 120)}` : "",
    ]
      .filter(Boolean)
      .join(" | ");

    return `${relationship.sourceCharacterName} <-> ${relationship.targetCharacterName}${details ? ` - ${details}` : ""}`;
  });

  return [
    ...relevantCharacters.map((character) => `Voice map:\n${buildCharacterVoicePromptCard(character)}`),
    ...relationshipLines.map((line) => `Voice friction: ${line}`),
  ].filter(Boolean);
}

function buildStorySkeletonContext(project: ProjectWorkspace, chapter: ProjectWorkspace["chapters"][number]) {
  const relevantStructureBeats = pickRelevantStructureBeats(project, chapter);
  const relevantSceneCards = pickRelevantSceneCards(project, chapter);

  return [
    ...relevantStructureBeats.map((beat) =>
      `Structure beat: ${beat.label} (${beat.type}) - ${compactText([beat.description, beat.notes].filter(Boolean).join(" | "), 200)}`,
    ),
    ...relevantSceneCards.map((scene) =>
      `Scene card: ${scene.title} - ${compactText([scene.summary, scene.goal, scene.conflict, scene.outcome].filter(Boolean).join(" | "), 220)}`,
    ),
  ].filter(Boolean);
}

export function buildContextPackage(
  project: ProjectWorkspace,
  chapterId: string,
  localExcerpt?: string,
): ContextPackage {
  const chapter = getChapterById(project, chapterId);
  if (!chapter) {
    throw new Error("Chapter not found for context package.");
  }

  const chapterIndex = project.chapters.findIndex((entry) => entry.id === chapter.id);
  const previousChapter = chapterIndex > 0 ? project.chapters[chapterIndex - 1] : undefined;
  const previousChapterSummary = getLatestChapterSummary(previousChapter);
  const chapterBlueprint = buildChapterBlueprint(chapter);

  const seeds = [
    chapter.title,
    chapter.purpose,
    chapter.currentBeat,
    chapter.desiredMood,
    chapter.outline,
    chapter.notes,
    ...chapter.keyBeats,
    ...chapter.requiredInclusions,
    ...chapter.sceneList,
    ...(localExcerpt ? [localExcerpt] : []),
  ].filter(Boolean);

  const activeThreads = project.plotThreads
    .map((thread) => ({
      thread,
      score:
        scoreTextMatch(`${thread.title} ${thread.summary} ${thread.promisedPayoff ?? ""}`, seeds) +
        scorePlotThreadMention(thread, buildChapterSignal(project, chapter, localExcerpt)) +
        thread.heat,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ thread }) => thread);

  const relevantCharacters = pickRelevantCharacters(project, chapter, activeThreads, localExcerpt);
  const relatedCharacterIds = uniqueNonEmpty([
    chapter.povCharacterId,
    ...relevantCharacters.map((character) => character.id),
  ]);

  const storyBibleContext = buildStoryBibleContext(project, chapter, activeThreads, localExcerpt);
  const dialogueVoiceContext = buildDialogueVoiceContext(project, chapter, activeThreads, localExcerpt);
  const storySkeletonContext = buildStorySkeletonContext(project, chapter);
  const seriesContext = pickRelevantSeriesContext(project, seeds);

  const longTerm = project.longTermMemoryItems
    .map((item) => ({
      item,
      score: scoreMemoryItem(
        item,
        seeds,
        relatedCharacterIds,
        activeThreads.map((thread) => thread.id),
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(({ item }) => item);

  const shortTerm = project.shortTermMemoryItems
    .map((item) => ({
      item,
      score: scoreMemoryItem(
        item,
        seeds,
        relatedCharacterIds,
        activeThreads.map((thread) => thread.id),
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ item }) => item);

  const continuityConstraints = project.continuityIssues.filter(
    (issue) => issue.status === "OPEN" && (!issue.chapterId || issue.chapterId === chapter.id),
  );

  const stylisticInstructions = [
    `${project.bookSettings.genre} for ${project.bookSettings.audience}.`,
    `Tone: ${project.bookSettings.tone}.`,
    `POV: ${project.bookSettings.pointOfView}.`,
    `Tense: ${project.bookSettings.tense}.`,
    `Guidance intensity: ${project.styleProfile.guidanceIntensity}.`,
    project.styleProfile.aestheticGuide,
    project.styleProfile.styleGuide,
    ...project.styleProfile.voiceRules,
  ].filter(Boolean) as string[];

  const tokenEstimate = approximateTokens([
    project.bookSettings.storyBrief,
    chapter.purpose,
    previousChapterSummary,
    ...chapterBlueprint,
    ...seriesContext,
    ...storyBibleContext,
    ...dialogueVoiceContext,
    ...storySkeletonContext,
    ...longTerm.map((item) => item.content),
    ...shortTerm.map((item) => item.content),
    ...activeThreads.map((item) => item.summary),
    ...continuityConstraints.map((item) => item.description),
    ...stylisticInstructions,
    localExcerpt ?? "",
  ]);

  return {
    projectBrief: project.bookSettings.storyBrief,
    chapterGoal: chapter.purpose,
    previousChapterSummary,
    chapterBlueprint,
    seriesContext,
    storyBibleContext,
    dialogueVoiceContext,
    storySkeletonContext,
    relevantLongTermMemory: longTerm,
    recentShortTermMemory: shortTerm,
    activePlotThreads: activeThreads,
    stylisticInstructions,
    continuityConstraints,
    localExcerpt,
    tokenEstimate,
  };
}

export async function retrieveRelevantMemory(projectId: string, chapterId: string, localExcerpt?: string) {
  const project = await getProjectWorkspace(projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  return buildContextPackage(project, chapterId, localExcerpt);
}

export function extractMemoryFromDraft(
  project: ProjectWorkspace,
  chapterId: string,
  overrides?: Partial<
    Pick<
      ProjectWorkspace["chapters"][number],
      "title" | "purpose" | "currentBeat" | "desiredMood" | "outline" | "notes" | "draft"
    >
  >,
): MemoryExtractionResult {
  const chapter = getChapterById(project, chapterId);
  if (!chapter) {
    throw new Error("Chapter not found.");
  }
  const workingChapter = {
    ...chapter,
    ...overrides,
  };
  const cleanedDraft = sanitizeManuscriptText(chapter.draft, {
    chapterTitle: workingChapter.title,
    chapterNumber: workingChapter.number,
    previousChapterDrafts: project.chapters
      .filter((entry) => entry.number < chapter.number)
      .map((entry) => entry.draft)
      .filter(Boolean),
  }).text;
  const chapterSignalText = [
    workingChapter.title,
    workingChapter.purpose,
    workingChapter.currentBeat,
    workingChapter.desiredMood,
    workingChapter.outline,
    workingChapter.notes,
    cleanedDraft,
    ...workingChapter.keyBeats,
    ...workingChapter.requiredInclusions,
    ...workingChapter.sceneList,
  ]
    .filter(Boolean)
    .join("\n");
  const sentences = cleanedDraft
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const touchedCharacters = pickRelevantCharacters(project, workingChapter, [], chapterSignalText).slice(0, 5);
  const touchedLocations = pickRelevantLocations(project, workingChapter, chapterSignalText).slice(0, 3);
  const activeThreads = project.plotThreads
    .map((thread) => ({
      thread,
      score: scorePlotThreadMention(thread, chapterSignalText),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
    .map(({ thread }) => thread);
  const relatedCharacterIds = uniqueNonEmpty([
    workingChapter.povCharacterId ?? "",
    ...touchedCharacters.map((character) => character.id),
  ]);
  const relatedLocationIds = touchedLocations.map((location) => location.id);
  const relatedPlotThreadIds = activeThreads.map((thread) => thread.id);

  const summary = cleanSummaryText(
    sentences.slice(0, 2).join(" ") || compactText(workingChapter.outline || workingChapter.purpose, 220),
  );
  const emotionalTone = workingChapter.desiredMood || chapter.summaries[0]?.emotionalTone || "Tense forward motion";
  const candidates = [
    {
      title: `${workingChapter.title} summary`,
      content: summary,
      category: "PLOT_POINT",
      tags: ["chapter", "summary"],
      relatedCharacterIds,
      relatedLocationIds,
      relatedPlotThreadIds,
      classification: "long-term durable fact" as const,
      relevanceScore: 0.8,
      durabilityScore: 0.85,
      promotionReason: "Chapter events change story state or reader understanding.",
    },
    {
      title: `${workingChapter.title} immediate tone`,
      content: emotionalTone,
      category: "EMOTION",
      tags: ["tone", "recent"],
      relatedCharacterIds,
      relatedLocationIds,
      relatedPlotThreadIds,
      classification: "short-term temporary fact" as const,
      relevanceScore: 0.66,
      durabilityScore: 0.35,
      promotionReason: "Useful for the next chapter bridge, not permanent.",
    },
    ...(workingChapter.currentBeat
      ? [
          {
            title: `${workingChapter.title} active beat`,
            content: `Current pressure in motion: ${workingChapter.currentBeat}`,
            category: "SCENE_STATE",
            tags: ["beat", "scene", "active"],
            relatedCharacterIds,
            relatedLocationIds,
            relatedPlotThreadIds,
            classification: "short-term temporary fact" as const,
            relevanceScore: 0.72,
            durabilityScore: 0.42,
            promotionReason: "Helps the next chapter continue the immediate dramatic lane.",
          },
        ]
      : []),
    ...touchedCharacters.slice(0, 3).map((character) => ({
      title: `${character.name} after ${chapter.title}`,
      content: cleanSummaryText(
        `${character.name} is active in Chapter ${chapter.number}. Track this state against the chapter summary: ${summary} Tone and pressure: ${emotionalTone}.`,
      ),
      category: "CHARACTER",
      tags: ["character", "state", character.name.toLowerCase()],
      relatedCharacterIds: [character.id],
      relatedLocationIds,
      relatedPlotThreadIds,
      classification: "short-term temporary fact" as const,
      relevanceScore: 0.79,
      durabilityScore: 0.49,
      promotionReason: "Character state should stay live across the next few scenes or chapters.",
    })),
    ...activeThreads.slice(0, 3).map((thread) => ({
      title: `${thread.title} touched in ${workingChapter.title}`,
      content: cleanSummaryText(`Chapter ${chapter.number} develops this thread: ${summary}`),
      category: "THREAD",
      tags: ["thread", "active", thread.title.toLowerCase()],
      relatedCharacterIds,
      relatedLocationIds,
      relatedPlotThreadIds: [thread.id],
      classification: "unresolved thread" as const,
      relevanceScore: 0.82,
      durabilityScore: 0.63,
      promotionReason: "This promise is still in motion and should remain retrievable.",
    })),
    ...workingChapter.requiredInclusions.slice(0, 3).map((item) => ({
      title: item,
      content: `This chapter foregrounds ${item}, so future prompts should confirm whether it remains active.`,
      category: "THREAD",
      tags: ["follow-up", item.toLowerCase()],
      relatedCharacterIds,
      relatedLocationIds,
      relatedPlotThreadIds,
      classification: "unresolved thread" as const,
      relevanceScore: 0.74,
      durabilityScore: 0.58,
      promotionReason: "Likely to matter in the next 1 to 3 chapters.",
    })),
    ...(touchedLocations.length
      ? [
          {
            title: `${workingChapter.title} setting state`,
            content: cleanSummaryText(
              `Current location pressure: ${touchedLocations.map((location) => location.name).join(", ")}. ${summary}`,
            ),
            category: "LOCATION",
            tags: ["location", "recent"],
            relatedCharacterIds,
            relatedLocationIds,
            relatedPlotThreadIds,
            classification: "short-term temporary fact" as const,
            relevanceScore: 0.64,
            durabilityScore: 0.38,
            promotionReason: "Keeps recent setting logic available for the next scene bridge.",
          },
        ]
      : []),
  ];

  return {
    summary,
    emotionalTone,
    candidates,
  };
}

export async function persistMemoryExtraction(
  projectId: string,
  chapterId: string,
  overrides?: Partial<
    Pick<
      ProjectWorkspace["chapters"][number],
      "title" | "purpose" | "currentBeat" | "desiredMood" | "outline" | "notes" | "draft"
    >
  >,
) {
  const project = await getProjectWorkspace(projectId);
  if (!project) {
    throw new Error("Project not found.");
  }
  const chapter = getChapterById(project, chapterId);
  if (!chapter) {
    throw new Error("Chapter not found.");
  }
  const extraction = extractMemoryFromDraft(project, chapterId, overrides);
  const cleanedDraft = sanitizeManuscriptText(chapter.draft, {
    chapterTitle: overrides?.title ?? chapter.title,
    chapterNumber: chapter.number,
    previousChapterDrafts: project.chapters
      .filter((entry) => entry.number < chapter.number)
      .map((entry) => entry.draft)
      .filter(Boolean),
  }).text;
  const liveChapter = {
    ...chapter,
    ...overrides,
  };
  const draftLower = cleanedDraft.toLowerCase();

  await prisma.chapterSummary.deleteMany({
    where: {
      projectId,
      chapterId,
      kind: "MEMORY",
    },
  });

  await prisma.longTermMemoryItem.deleteMany({
    where: {
      projectId,
      relatedChapterId: chapterId,
      sourceType: "EXTRACTED",
    },
  });

  await prisma.shortTermMemoryItem.deleteMany({
    where: {
      projectId,
      relatedChapterId: chapterId,
      sourceType: "EXTRACTED",
    },
  });

  await prisma.chapterSummary.create({
    data: {
      projectId,
      chapterId,
      kind: "MEMORY",
      summary: extraction.summary,
      emotionalTone: extraction.emotionalTone,
      unresolvedQuestions: extraction.candidates
        .filter((candidate) => candidate.classification === "unresolved thread")
        .map((candidate) => candidate.title),
      bridgeText: `Carry forward ${liveChapter.requiredInclusions.slice(0, 2).join(", ") || liveChapter.title}.`,
    },
  });

  for (const candidate of extraction.candidates) {
    if (candidate.classification === "discard/noise") {
      continue;
    }

    const characters =
      candidate.relatedCharacterIds && candidate.relatedCharacterIds.length
        ? {
            createMany: {
              data: candidate.relatedCharacterIds.map((characterId) => ({ characterId })),
            },
          }
        : undefined;
    const locations =
      candidate.relatedLocationIds && candidate.relatedLocationIds.length
        ? {
            createMany: {
              data: candidate.relatedLocationIds.map((locationId) => ({ locationId })),
            },
          }
        : undefined;
    const plotThreads =
      candidate.relatedPlotThreadIds && candidate.relatedPlotThreadIds.length
        ? {
            createMany: {
              data: candidate.relatedPlotThreadIds.map((plotThreadId) => ({ plotThreadId })),
            },
          }
        : undefined;

    if (candidate.classification === "long-term durable fact") {
      await prisma.longTermMemoryItem.create({
        data: {
          projectId,
          relatedChapterId: chapterId,
          title: candidate.title,
          content: candidate.content,
          category: candidate.category as never,
          tags: candidate.tags,
          relevanceScore: candidate.relevanceScore,
          durabilityScore: candidate.durabilityScore,
          status: "ACTIVE",
          sourceType: "EXTRACTED",
          promotionReason: candidate.promotionReason,
          characters,
          locations,
          plotThreads,
        },
      });
    } else {
      await prisma.shortTermMemoryItem.create({
        data: {
          projectId,
          relatedChapterId: chapterId,
          title: candidate.title,
          content: candidate.content,
          category: candidate.category as never,
          tags: candidate.tags,
          relevanceScore: candidate.relevanceScore,
          durabilityScore: candidate.durabilityScore,
          status: "ACTIVE",
          sourceType: "EXTRACTED",
          promotionReason: candidate.promotionReason,
          characters,
          locations,
          plotThreads,
        },
      });
    }
  }
  const touchedCharacters = project.characters.filter((character) =>
    [character.name, character.role, character.summary]
      .filter(Boolean)
      .some((token) => draftLower.includes(String(token).toLowerCase())),
  );

  for (const character of touchedCharacters.slice(0, 4)) {
    const syncLine = `Ch. ${chapter.number}: ${extraction.summary}`;
    const nextNotes = character.notes.includes(syncLine)
      ? cleanCharacterNotes(character.notes)
      : cleanCharacterNotes([character.notes, syncLine].filter(Boolean).join("\n"));
    const nextState = {
      ...character.currentState,
      emotionalState: extraction.emotionalTone || character.currentState.emotionalState,
      recentChanges: cleanSummaryText(syncLine),
      lastMeaningfulAppearance: cleanSummaryText(extraction.summary),
      lastMeaningfulAppearanceChapter: chapter.number,
    };

    await prisma.character.update({
      where: { id: character.id },
      data: {
        notes: nextNotes,
        currentState: nextState,
      },
    });
  }

  const povCharacter = project.characters.find((character) => character.id === liveChapter.povCharacterId);
  if (povCharacter) {
    const arcTitle = `${povCharacter.name} arc`;
    const existingArc = project.plotThreads.find((thread) => thread.title.toLowerCase() === arcTitle.toLowerCase());
    const arcSummary = `${povCharacter.name}'s arc advances in Chapter ${chapter.number}: ${extraction.summary}`;
    const nextMarker = {
      chapterNumber: chapter.number,
      label: liveChapter.title,
      strength: existingArc ? "DEVELOPED" : "INTRODUCED",
      notes: extraction.summary,
    };

    if (existingArc) {
      await prisma.plotThread.update({
        where: { id: existingArc.id },
        data: {
          summary: arcSummary,
          lastTouchedChapter: chapter.number,
          heat: Math.max(existingArc.heat, 3),
          progressMarkers: [
            ...existingArc.progressMarkers.filter((marker) => marker.chapterNumber !== chapter.number),
            nextMarker,
          ],
        },
      });
    } else {
      await prisma.plotThread.create({
        data: {
          projectId,
          title: arcTitle,
          summary: arcSummary,
          status: "ACTIVE",
          heat: 3,
          promisedPayoff: `${povCharacter.name} must change or fail by the end of the book.`,
          lastTouchedChapter: chapter.number,
          progressMarkers: [nextMarker],
        },
      });
    }
  }

  const chapterSignal = [liveChapter.title, liveChapter.purpose, liveChapter.currentBeat, liveChapter.outline, cleanedDraft]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  for (const thread of project.plotThreads) {
    const signal = detectPlotThreadSignal(thread, chapterSignal);
    if (!signal.touched) {
      continue;
    }

    const existingMarker = thread.progressMarkers.find((marker) => marker.chapterNumber === chapter.number);
    const markerStrength =
      signal.score >= 3.4
        ? "ESCALATED"
        : existingMarker?.strength ?? (thread.lastTouchedChapter ? "DEVELOPED" : "INTRODUCED");
    const nextMarker = {
      chapterNumber: chapter.number,
      label: liveChapter.title,
      strength: markerStrength,
      notes: extraction.summary,
    };

    await prisma.plotThread.update({
      where: { id: thread.id },
      data: {
        lastTouchedChapter: chapter.number,
        heat: Math.min(5, Math.max(thread.heat, signal.score >= 3.4 ? thread.heat + 1 : thread.heat)),
        progressMarkers: [
          ...thread.progressMarkers.filter((marker) => marker.chapterNumber !== chapter.number),
          nextMarker,
        ],
      },
    });
  }

  return extraction;
}

export async function promoteMemory(projectId: string, memoryItemId: string) {
  const item = await prisma.shortTermMemoryItem.findUnique({
    where: { id: memoryItemId },
    include: {
      characters: true,
      locations: true,
      plotThreads: true,
    },
  });

  if (!item || item.projectId !== projectId) {
    throw new Error("Short-term memory item not found.");
  }

  const longTerm = await prisma.longTermMemoryItem.create({
    data: {
      projectId,
      relatedChapterId: item.relatedChapterId,
      title: item.title,
      content: item.content,
      category: item.category,
      tags: (item.tags ?? undefined) as Prisma.InputJsonValue | undefined,
      relevanceScore: Math.max(item.relevanceScore, 0.72),
      durabilityScore: Math.max(item.durabilityScore, 0.74),
      status: "PROMOTED",
      sourceType: "PROMOTED",
      promotionReason: item.promotionReason ?? "Promoted by user review.",
      timesReinforced: item.timesReinforced + 1,
      isPinned: item.isPinned,
      characters: {
        createMany: {
          data: item.characters.map((entry) => ({ characterId: entry.characterId })),
        },
      },
      locations: {
        createMany: {
          data: item.locations.map((entry) => ({ locationId: entry.locationId })),
        },
      },
      plotThreads: {
        createMany: {
          data: item.plotThreads.map((entry) => ({ plotThreadId: entry.plotThreadId })),
        },
      },
    },
  });

  await prisma.shortTermMemoryItem.update({
    where: { id: memoryItemId },
    data: { status: "PROMOTED" },
  });

  return longTerm;
}
