import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const base = process.env.STORYFORGE_BASE_URL ?? "http://localhost:3000";
const projectId = process.env.STORYFORGE_PROJECT_ID ?? "cmncxfjtu0000u8iw4betdpmg";
const targetModel = process.env.STORYFORGE_MODEL ?? "google/gemini-2.0-flash-001";
const exportsDir = path.join(process.cwd(), "exports");

type ApiResult<T> = {
  ok: boolean;
  data: T;
  error?: string;
};

type ChapterRecord = {
  id: string;
  number: number;
  title: string;
  purpose: string;
  currentBeat: string;
  targetWordCount: number;
  outline: string;
  draft: string;
  wordCount: number;
  status: string;
};

type ProjectWorkspace = {
  id: string;
  title: string;
  slug: string;
  chapters: ChapterRecord[];
};

function firstParagraph(text: string) {
  return text.split(/\n\s*\n/).map((part) => part.trim()).find(Boolean) ?? text.trim();
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function overlap(left: string, right: string) {
  const leftWords = new Set(normalize(left).split(" ").filter(Boolean));
  const rightWords = new Set(normalize(right).split(" ").filter(Boolean));
  if (!leftWords.size || !rightWords.size) {
    return 0;
  }

  let shared = 0;
  for (const word of leftWords) {
    if (rightWords.has(word)) {
      shared += 1;
    }
  }

  return shared / Math.min(leftWords.size, rightWords.size);
}

async function requestJson<T>(requestPath: string, options: RequestInit = {}) {
  const response = await fetch(`${base}${requestPath}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });

  const payload = (await response.json()) as ApiResult<T>;
  if (!response.ok || !payload.ok) {
    throw new Error(
      `${options.method ?? "GET"} ${requestPath} failed: ${response.status} ${payload.error ?? JSON.stringify(payload)}`,
    );
  }

  return payload.data;
}

async function ensureProvider() {
  await requestJson<{ settings: unknown }>("/api/settings/providers/model", {
    method: "PATCH",
    body: JSON.stringify({
      provider: "OPENROUTER",
      model: targetModel,
      activate: true,
    }),
  });
}

async function refreshProject() {
  return requestJson<{ project: ProjectWorkspace }>(`/api/projects/${projectId}`);
}

async function applyRun(
  assistRunId: string,
  fieldKey: "draft" | "outline" | "notes",
  currentContent: string,
  applyMode: "replace-draft" | "replace-selection" | "append",
  selectionStart = 0,
  selectionEnd = currentContent.length,
) {
  await requestJson<{ project: ProjectWorkspace }>(`/api/assist-runs/${assistRunId}/apply`, {
    method: "POST",
    body: JSON.stringify({
      fieldKey,
      currentContent,
      selectionStart,
      selectionEnd,
      applyMode,
    }),
  });
}

async function reviseAndReplaceDraft(chapter: ChapterRecord, instruction: string) {
  const revision = await requestJson<{ run: { id: string } }>(`/api/chapters/${chapter.id}/revise`, {
    method: "POST",
    body: JSON.stringify({
      actionType: "REVISE",
      instruction,
    }),
  });

  await applyRun(revision.run.id, "draft", chapter.draft, "replace-draft", 0, chapter.draft.length);
}

async function syncChapter(chapterId: string) {
  await requestJson<{ project: ProjectWorkspace }>(`/api/chapters/${chapterId}/sync`, {
    method: "POST",
  });
}

async function reviewBookGuide() {
  return requestJson<{
    report: {
      alignmentScore: number;
      recommendations: Array<{
        title: string;
        fixInstruction: string;
        targetChapterId: string | null;
        targetChapterNumber: number | null;
      }>;
    };
  }>(`/api/projects/${projectId}/bestseller-guide`, {
    method: "POST",
  });
}

async function downloadFile(requestPath: string, destination: string) {
  const response = await fetch(`${base}${requestPath}`);
  if (!response.ok) {
    throw new Error(`Download failed: ${requestPath}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  await writeFile(destination, Buffer.from(arrayBuffer));
}

function needsUniqueOpeningRewrite(chapter: ChapterRecord, previousChapter: ChapterRecord | undefined) {
  if (!previousChapter) {
    return false;
  }

  return overlap(firstParagraph(chapter.draft), firstParagraph(previousChapter.draft)) >= 0.35;
}

function buildRepairInstruction(chapter: ChapterRecord, previousChapter: ChapterRecord | undefined) {
  const uniqueOpeningRule = needsUniqueOpeningRewrite(chapter, previousChapter)
    ? "Give this chapter a completely new opening image and first paragraph. Do not reuse any prior chapter's opening phrase, mantra, smell-image, or sentence rhythm."
    : "If the opening feels generic, refresh it so the chapter starts with its own distinct image and motion.";
  const chapterTarget = Math.max(3900, chapter.targetWordCount || 3910);

  return [
    `Rewrite chapter ${chapter.number}, "${chapter.title}," as a complete polished historical-fiction chapter.`,
    `Land between ${chapterTarget} and ${chapterTarget + 150} words.`,
    "Preserve the existing outline, story bible, story skeleton, long-term memory, short-term memory, canon facts, and chronology.",
    "Keep the current chapter purpose and current beat, but deepen the scene work so it feels fully built rather than abbreviated.",
    uniqueOpeningRule,
    "Add concrete scene progression, dialogue, setting pressure, and emotional consequence rather than summary-only explanation.",
    "Keep all spoken dialogue inside quotation marks.",
    "Keep internal thought as italics only, not spoken dialogue.",
    "Do not insert any meta commentary, editor notes, chapter headings, or alternate versions.",
    "Do not append an extra copy of the chapter or an 'extended' section.",
    `Chapter purpose: ${chapter.purpose}`,
    `Current beat: ${chapter.currentBeat}`,
  ].join("\n");
}

async function main() {
  await mkdir(exportsDir, { recursive: true });
  await ensureProvider();

  let project = (await refreshProject()).project;
  const chaptersNeedingGrowth = project.chapters.filter((chapter) => chapter.wordCount < 3900);
  const forcedRewriteNumbers = new Set([3, 12, 13, 16]);
  const targets = project.chapters.filter(
    (chapter) => chapter.wordCount < 3900 || forcedRewriteNumbers.has(chapter.number),
  );

  for (const chapter of targets) {
    project = (await refreshProject()).project;
    const freshChapter = project.chapters.find((entry) => entry.id === chapter.id);
    if (!freshChapter) {
      throw new Error(`Missing chapter ${chapter.number}.`);
    }

    const previousChapter = project.chapters.find((entry) => entry.number === freshChapter.number - 1);
    await reviseAndReplaceDraft(freshChapter, buildRepairInstruction(freshChapter, previousChapter));
    await syncChapter(freshChapter.id);

    project = (await refreshProject()).project;
    const afterPass = project.chapters.find((entry) => entry.id === freshChapter.id);
    if (!afterPass) {
      throw new Error(`Missing chapter ${chapter.number} after repair.`);
    }

    if (afterPass.wordCount < 3850) {
      await reviseAndReplaceDraft(
        afterPass,
        [
          `Expand chapter ${afterPass.number} to between 3950 and 4100 words without changing its canon events.`,
          "Build out beats that are currently compressed. Add dialogue, physical action, setting detail, and aftermath.",
          "Do not reuse any previous chapter opener or stock phrase.",
          "Return only the final clean chapter prose.",
        ].join("\n"),
      );
      await syncChapter(afterPass.id);
    }
  }

  project = (await refreshProject()).project;
  const guide = await reviewBookGuide();
  for (const recommendation of guide.report.recommendations.slice(0, 2)) {
    const targetChapter =
      (recommendation.targetChapterId
        ? project.chapters.find((chapter) => chapter.id === recommendation.targetChapterId)
        : null) ??
      (recommendation.targetChapterNumber
        ? project.chapters.find((chapter) => chapter.number === recommendation.targetChapterNumber)
        : null);
    if (!targetChapter) {
      continue;
    }

    await reviseAndReplaceDraft(
      targetChapter,
      [
        recommendation.fixInstruction,
        "Keep the chapter's canon, chronology, and character logic intact.",
        "Return only the revised chapter prose.",
      ].join("\n"),
    );
    await syncChapter(targetChapter.id);
  }

  project = (await refreshProject()).project;
  const exportSlug = project.slug || "ember-in-zion";
  const pdfPath = path.join(exportsDir, `${exportSlug}.pdf`);
  const mdPath = path.join(exportsDir, `${exportSlug}.md`);
  const jsonPath = path.join(exportsDir, `${exportSlug}.json`);
  const reportPath = path.join(exportsDir, `${exportSlug}-polish-report.json`);

  await downloadFile(`/api/projects/${projectId}/export?format=pdf`, pdfPath);
  await downloadFile(`/api/projects/${projectId}/export?format=md`, mdPath);
  await downloadFile(`/api/projects/${projectId}/export?format=json`, jsonPath);

  await writeFile(
    reportPath,
    JSON.stringify(
      {
        projectId,
        title: project.title,
        totalWords: project.chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
        chaptersNeedingGrowth: chaptersNeedingGrowth.map((chapter) => chapter.number),
        repairedChapters: targets.map((chapter) => chapter.number),
        guideAlignmentScore: guide.report.alignmentScore,
        exports: { pdfPath, mdPath, jsonPath },
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        projectId,
        title: project.title,
        totalWords: project.chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
        pdfPath,
        mdPath,
        jsonPath,
        reportPath,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("POLISH_FAIL");
  console.error(error);
  process.exit(1);
});
