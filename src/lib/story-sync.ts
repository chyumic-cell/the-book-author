import "server-only";

import { cleanCharacterNotes, cleanSummaryText } from "@/lib/ai-output";
import { runContinuityCheck } from "@/lib/continuity";
import { persistMemoryExtraction } from "@/lib/memory";
import { getChapterById, getProjectWorkspace } from "@/lib/project-data";
import { prisma } from "@/lib/prisma";
import type { ContinuityCheckMode, ContinuityReport, MemoryExtractionResult, ProjectWorkspace } from "@/types/storyforge";

function buildBridgeText(
  chapter: ProjectWorkspace["chapters"][number],
  extraction: MemoryExtractionResult,
) {
  const unresolved = extraction.candidates
    .filter((candidate) => candidate.classification === "unresolved thread")
    .map((candidate) => candidate.title)
    .slice(0, 2);

  if (unresolved.length) {
    return `Carry forward ${unresolved.join(" and ")}.`;
  }

  if (chapter.currentBeat) {
    return `Carry forward the chapter pressure around ${cleanSummaryText(chapter.currentBeat)}.`;
  }

  return `Carry forward the pressure from ${cleanSummaryText(extraction.summary).slice(0, 120)}.`;
}

async function upsertCoreSummary(
  projectId: string,
  chapter: ProjectWorkspace["chapters"][number],
  extraction: MemoryExtractionResult,
) {
  await prisma.chapterSummary.deleteMany({
    where: {
      projectId,
      chapterId: chapter.id,
      kind: "CORE",
    },
  });

  await prisma.chapterSummary.create({
    data: {
      projectId,
      chapterId: chapter.id,
      kind: "CORE",
      summary: extraction.summary,
      emotionalTone: extraction.emotionalTone,
      unresolvedQuestions: extraction.candidates
        .filter((candidate) => candidate.classification === "unresolved thread")
        .map((candidate) => candidate.title),
      bridgeText: buildBridgeText(chapter, extraction),
    },
  });
}

async function syncSceneCardSnapshot(
  projectId: string,
  chapter: ProjectWorkspace["chapters"][number],
  extraction: MemoryExtractionResult,
) {
  const existingCard = await prisma.sceneCard.findFirst({
    where: {
      projectId,
      chapterId: chapter.id,
      frozen: false,
    },
    orderBy: {
      orderIndex: "asc",
    },
  });

  const unresolved = extraction.candidates
    .filter((candidate) => candidate.classification === "unresolved thread")
    .map((candidate) => candidate.title)
    .join(", ");
  const outcome = unresolved
    ? `Leaves open: ${unresolved}`
    : `Carries emotional tone: ${extraction.emotionalTone}`;

  if (existingCard) {
    await prisma.sceneCard.update({
      where: { id: existingCard.id },
      data: {
        title: chapter.title,
        summary: extraction.summary,
        goal: chapter.purpose,
        conflict: chapter.currentBeat,
        outcome,
        outcomeType: unresolved ? "COMPLICATION" : "REVELATION",
        povCharacterId: chapter.povCharacterId ?? undefined,
      },
    });
    return;
  }

  const existingCount = await prisma.sceneCard.count({
    where: {
      projectId,
      chapterId: chapter.id,
    },
  });

  await prisma.sceneCard.create({
    data: {
      projectId,
      chapterId: chapter.id,
      povCharacterId: chapter.povCharacterId ?? undefined,
      title: chapter.title,
      summary: extraction.summary,
      goal: chapter.purpose,
      conflict: chapter.currentBeat,
      outcome,
      outcomeType: unresolved ? "COMPLICATION" : "REVELATION",
      locationHint: "",
      orderIndex: existingCount + 1,
      frozen: false,
    },
  });
}

export async function syncChapterToStoryState(
  projectId: string,
  chapterId: string,
  options?: {
    continuityMode?: ContinuityCheckMode;
    draftOverride?: string;
    chapterOverride?: Partial<
      Pick<
        ProjectWorkspace["chapters"][number],
        "title" | "purpose" | "currentBeat" | "desiredMood" | "outline" | "notes" | "draft"
      >
    >;
  },
): Promise<{
  extraction: MemoryExtractionResult;
  report: ContinuityReport;
  project: ProjectWorkspace;
}> {
  const chapterOverride = {
    ...(options?.chapterOverride ?? {}),
    ...(options?.draftOverride ? { draft: options.draftOverride } : {}),
  };
  const extraction = await persistMemoryExtraction(projectId, chapterId, chapterOverride);
  let project = await getProjectWorkspace(projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  const chapter = getChapterById(project, chapterId);
  if (!chapter) {
    throw new Error("Chapter not found.");
  }
  const liveChapter = {
    ...chapter,
    ...chapterOverride,
  };

  await upsertCoreSummary(projectId, liveChapter, extraction);
  await syncSceneCardSnapshot(projectId, liveChapter, extraction);

  const report = await runContinuityCheck(
    projectId,
    chapterId,
    chapterOverride.draft ?? chapter.draft,
    options?.continuityMode ?? "CHAPTER",
  );

  project = await getProjectWorkspace(projectId);
  if (!project) {
    throw new Error("Project not found after sync.");
  }

  return {
    extraction,
    report,
    project,
  };
}

export async function resyncProjectStoryState(projectId: string) {
  const project = await getProjectWorkspace(projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  await prisma.chapterSummary.deleteMany({
    where: {
      projectId,
      kind: {
        in: ["CORE", "MEMORY"],
      },
    },
  });

  await prisma.longTermMemoryItem.deleteMany({
    where: {
      projectId,
      sourceType: "EXTRACTED",
    },
  });

  await prisma.shortTermMemoryItem.deleteMany({
    where: {
      projectId,
      sourceType: "EXTRACTED",
    },
  });

  await prisma.continuityIssue.deleteMany({
    where: {
      projectId,
    },
  });

  for (const thread of project.plotThreads) {
    await prisma.plotThread.update({
      where: { id: thread.id },
      data: {
        lastTouchedChapter: null,
        progressMarkers: [],
      },
    });
  }

  for (const character of project.characters) {
    await prisma.character.update({
      where: { id: character.id },
      data: {
        notes: cleanCharacterNotes(
          character.notes
            .split("\n")
            .filter((line) => !/^Ch\.\s+\d+:/i.test(line.trim()))
            .join("\n"),
        ),
        currentState: {
          ...character.currentState,
          recentChanges: "",
          lastMeaningfulAppearance: "",
          lastMeaningfulAppearanceChapter: null,
        },
      },
    });
  }

  for (const chapter of project.chapters) {
    await syncChapterToStoryState(projectId, chapter.id, {
      continuityMode: "CHAPTER",
      draftOverride: chapter.draft,
    });
  }

  const refreshedProject = await getProjectWorkspace(projectId);
  if (!refreshedProject) {
    throw new Error("Project not found after resync.");
  }

  return refreshedProject;
}
