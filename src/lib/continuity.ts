import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { getChapterById, getProjectWorkspace } from "@/lib/project-data";
import {
  buildOpeningSignature,
  compareOverlapRatio,
  countDistinctTermMatches,
  extractSignificantTerms,
  normalizeAnalysisText,
} from "@/lib/story-analysis";
import { compactText } from "@/lib/utils";
import type { ContinuityIssueRecord, ContinuityReport, ProjectWorkspace } from "@/types/storyforge";

function createIssue(
  severity: ContinuityIssueRecord["severity"],
  issueType: string,
  title: string,
  description: string,
  suggestedContext: string,
  relatedEntity = "",
  chapterId: string | null = null,
  checkMode: ContinuityIssueRecord["checkMode"] = "CHAPTER",
  confidence = 0.7,
  explanation = description,
  affectedElements: string[] = relatedEntity ? [relatedEntity] : [],
): ContinuityIssueRecord {
  return {
    id: randomUUID(),
    chapterId,
    severity,
    confidence,
    checkMode,
    issueType,
    title,
    description,
    explanation,
    suggestedContext,
    relatedEntity,
    affectedElements,
    status: "OPEN",
  };
}

function getCoreSummary(chapter: ProjectWorkspace["chapters"][number] | null) {
  if (!chapter) {
    return null;
  }

  return chapter.summaries.find((summary) => summary.kind === "CORE") ?? chapter.summaries[0] ?? null;
}

function getChapterIndex(project: ProjectWorkspace, chapterId: string) {
  return project.chapters.findIndex((chapter) => chapter.id === chapterId);
}

function buildChapterSignal(chapter: ProjectWorkspace["chapters"][number], draft: string) {
  return [
    chapter.title,
    chapter.purpose,
    chapter.currentBeat,
    chapter.outline,
    chapter.notes,
    ...chapter.keyBeats,
    ...chapter.requiredInclusions,
    ...chapter.sceneList,
    draft,
  ]
    .filter(Boolean)
    .join("\n");
}

function getMentionedCharacters(project: ProjectWorkspace, text: string) {
  const normalized = normalizeAnalysisText(text);

  return project.characters.filter((character) => normalized.includes(normalizeAnalysisText(character.name)));
}

function hasIntentionalShiftSignal(chapter: ProjectWorkspace["chapters"][number]) {
  return /(meanwhile|elsewhere|later that night|the next day|days later|weeks later|months later|back in the roman camp|outside the walls|outside jerusalem|in the camp)/i.test(
    [chapter.title, chapter.purpose, chapter.currentBeat, chapter.outline, chapter.notes].filter(Boolean).join("\n"),
  );
}

function buildPlanningSeeds(chapter: ProjectWorkspace["chapters"][number]) {
  return [
    ...chapter.requiredInclusions.map((value) => ({ text: value, severity: "MEDIUM" as const, kind: "Required inclusion" })),
    ...chapter.keyBeats.map((value) => ({ text: value, severity: "LOW" as const, kind: "Key beat" })),
  ]
    .filter((entry) => entry.text.trim().length > 0)
    .slice(0, 5);
}

function dedupeIssues(issues: ContinuityIssueRecord[]) {
  const seen = new Set<string>();

  return issues.filter((issue) => {
    const key = `${issue.chapterId}|${issue.issueType}|${issue.title}|${issue.description}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function runContinuityRuleChecks(
  project: ProjectWorkspace,
  chapterId: string,
  draft: string,
  mode: ContinuityIssueRecord["checkMode"],
) {
  const issues: ContinuityIssueRecord[] = [];
  const chapterIndex = getChapterIndex(project, chapterId);
  const chapter = chapterIndex >= 0 ? project.chapters[chapterIndex] : null;
  if (!chapter) {
    return issues;
  }

  const cleanedDraft = draft.trim();
  if (!cleanedDraft) {
    return issues;
  }

  const chapterSignal = buildChapterSignal(chapter, cleanedDraft);
  const previousChapter = chapterIndex > 0 ? project.chapters[chapterIndex - 1] : null;
  const previousSummary = getCoreSummary(previousChapter);
  const currentCharacters = getMentionedCharacters(project, chapterSignal);
  const intentionalShift = hasIntentionalShiftSignal(chapter);

  const openingSignature = buildOpeningSignature(cleanedDraft);
  if (openingSignature) {
    const recentChapters = project.chapters.slice(Math.max(0, chapterIndex - 4), chapterIndex);
    const openingTerms = openingSignature.split(/\s+/).filter(Boolean);

    for (const previous of recentChapters) {
      const previousOpening = buildOpeningSignature(previous.draft);
      if (!previousOpening) {
        continue;
      }

      const overlap = compareOverlapRatio(openingTerms, previousOpening);
      if (overlap >= 0.65) {
        issues.push(
          createIssue(
            "MEDIUM",
            "Repeated setup",
            "Chapter opening reuses an earlier setup",
            `Chapter ${chapter.number} opens with imagery or phrasing that overlaps heavily with Chapter ${previous.number}.`,
            "Give this chapter a more distinct opening image, motion, or first beat so it does not feel like the story reset itself.",
            "",
            chapter.id,
            mode,
            0.8,
            `The opening signature of Chapter ${chapter.number} overlaps with Chapter ${previous.number}, which makes the story feel like it resets instead of progressing.`,
            [`chapter-${previous.number}`, `chapter-${chapter.number}`],
          ),
        );
        break;
      }
    }
  }

  for (const seed of buildPlanningSeeds(chapter)) {
    const seedTerms = extractSignificantTerms(seed.text, 4);
    if (seedTerms.length === 0) {
      continue;
    }

    const seedHits = countDistinctTermMatches(cleanedDraft, seedTerms);
    if (seedHits > 0) {
      continue;
    }

    issues.push(
      createIssue(
        seed.severity,
        "Dropped planned element",
        `${seed.kind} disappears from the chapter`,
        `${seed.kind} "${seed.text}" is present in the chapter plan but leaves almost no trace in the actual draft.`,
        `Carry ${seed.text} onto the page directly or adjust the chapter plan so the manuscript and outline agree.`,
        seed.text,
        chapter.id,
        mode,
        seed.severity === "MEDIUM" ? 0.76 : 0.66,
        `The chapter blueprint says this beat or inclusion matters, but the prose does not meaningfully stage it.`,
        [seed.text],
      ),
    );
  }

  if (previousChapter && previousSummary) {
    const previousBridgeText = [previousSummary.summary, previousSummary.bridgeText, previousChapter.currentBeat]
      .filter(Boolean)
      .join(" ");
    const bridgeTerms = extractSignificantTerms(previousBridgeText, 8);
    const bridgeOverlap = compareOverlapRatio(bridgeTerms, chapterSignal);
    const previousCharacters = getMentionedCharacters(project, previousBridgeText || previousChapter.draft);
    const sharedCharacters = previousCharacters.filter((character) =>
      currentCharacters.some((current) => current.id === character.id),
    );

    if (bridgeTerms.length >= 3 && bridgeOverlap < 0.2 && sharedCharacters.length === 0 && !intentionalShift) {
      issues.push(
        createIssue(
          "MEDIUM",
          "Abrupt chapter handoff",
          "The chapter drops the previous handoff without explanation",
          `Chapter ${chapter.number} does not appear to carry forward the main pressure, bridge, or cast from Chapter ${previousChapter.number}.`,
          "Either connect this chapter more clearly to the previous pressure, or signal the deliberate shift in place, time, or focus much more explicitly.",
          "",
          chapter.id,
          mode,
          0.74,
          `The transition from Chapter ${previousChapter.number} to Chapter ${chapter.number} feels abrupt because the handoff terms and cast nearly vanish at once.`,
          [`chapter-${previousChapter.number}`, `chapter-${chapter.number}`],
        ),
      );
    }
  }

  return dedupeIssues(issues);
}

export async function runContinuityCheck(
  projectId: string,
  chapterId: string,
  draft?: string,
  mode: ContinuityIssueRecord["checkMode"] = "CHAPTER",
): Promise<ContinuityReport> {
  const project = await getProjectWorkspace(projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  const chapter = getChapterById(project, chapterId);
  if (!chapter) {
    throw new Error("Chapter not found.");
  }

  const issues = runContinuityRuleChecks(project, chapterId, draft ?? chapter.draft, mode);
  const suggestedContext = issues.map((issue) => compactText(issue.suggestedContext, 240)).filter(Boolean);

  await prisma.continuityIssue.deleteMany({
    where: {
      projectId,
      chapterId,
      checkMode: mode,
    },
  });

  if (issues.length > 0) {
    await prisma.continuityIssue.createMany({
      data: issues.map((issue) => ({
        id: issue.id,
        projectId,
        chapterId: issue.chapterId,
        severity: issue.severity,
        confidence: issue.confidence,
        checkMode: issue.checkMode,
        issueType: issue.issueType,
        title: issue.title,
        description: issue.description,
        explanation: issue.explanation,
        suggestedContext: issue.suggestedContext,
        relatedEntity: issue.relatedEntity,
        affectedElements: issue.affectedElements,
        status: "OPEN",
      })),
    });
  }

  return {
    issues,
    suggestedContext,
    verdict:
      issues.length === 0
        ? `No blocking continuity issues detected in ${mode.toLowerCase().replaceAll("_", " ")} review.`
        : `${issues.length} continuity issue${issues.length === 1 ? "" : "s"} need attention in ${mode.toLowerCase().replaceAll("_", " ")} review.`,
  };
}
