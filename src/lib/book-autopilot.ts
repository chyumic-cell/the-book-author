import "server-only";

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { generateChapterDraft, generateChapterOutline } from "@/lib/openai";
import { getChapterById, getProjectWorkspace } from "@/lib/project-data";
import { syncChapterToStoryState } from "@/lib/story-sync";
import { updateChapter } from "@/lib/story-service";
import type { AiAutopilotMode, AutopilotRunRecord, ProjectWorkspace } from "@/types/storyforge";

function resolveAutopilotConfigRoot() {
  // Vercel deployments run from a read-only bundle, so hosted runs need temp storage.
  if (process.env.VERCEL || process.env.THE_BOOK_AUTHOR_HOSTED_BETA === "true" || process.env.STORYFORGE_HOSTED_BETA === "true") {
    return os.tmpdir();
  }

  return process.env.THE_BOOK_AUTHOR_CONFIG_DIR || process.env.STORYFORGE_CONFIG_DIR || process.cwd();
}

const autopilotConfigRoot = resolveAutopilotConfigRoot();
const autopilotConfigPath = path.join(autopilotConfigRoot, ".the-book-author.autopilot.json");

type AutopilotStore = {
  jobs: AutopilotRunRecord[];
};

function countWords(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function chapterNeedsDraft(chapter: ProjectWorkspace["chapters"][number]) {
  const minimum = Math.max(250, chapter.targetWordCount - 200);
  return countWords(chapter.draft) < minimum;
}

function dedupeIds(values: string[]) {
  return Array.from(new Set(values));
}

function isLikelyProviderPause(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("rate limit") ||
    message.includes("key limit") ||
    message.includes("daily limit") ||
    message.includes("quota") ||
    message.includes("temporarily unavailable") ||
    message.includes("timeout")
  );
}

async function readStore(): Promise<AutopilotStore> {
  try {
    const raw = await fs.readFile(autopilotConfigPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<AutopilotStore>;
    return { jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [] };
  } catch {
    return { jobs: [] };
  }
}

async function writeStore(store: AutopilotStore) {
  await fs.mkdir(path.dirname(autopilotConfigPath), { recursive: true });
  await fs.writeFile(autopilotConfigPath, JSON.stringify(store, null, 2), "utf8");
}

function sortJobs(jobs: AutopilotRunRecord[]) {
  return [...jobs].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

function selectChapterIds(project: ProjectWorkspace, mode: AiAutopilotMode, chapterId?: string | null) {
  const chapters = project.chapters;
  if (chapters.length === 0) {
    return [];
  }

  const selected = chapterId ? chapters.find((chapter) => chapter.id === chapterId) ?? chapters.at(-1)! : chapters.at(-1)!;
  if (mode === "CURRENT_CHAPTER") {
    return [selected.id];
  }

  const explicitStartIndex = chapterId ? chapters.findIndex((chapter) => chapter.id === chapterId) : -1;
  const firstIncompleteIndex = chapters.findIndex((chapter) => chapterNeedsDraft(chapter));
  const startIndex = explicitStartIndex >= 0 ? explicitStartIndex : firstIncompleteIndex >= 0 ? firstIncompleteIndex : 0;
  return chapters.slice(startIndex).map((chapter) => chapter.id);
}

async function persistJob(nextJob: AutopilotRunRecord) {
  const store = await readStore();
  const remaining = store.jobs.filter((job) => job.id !== nextJob.id);
  remaining.unshift(nextJob);
  await writeStore({
    jobs: remaining.slice(0, 24),
  });
  return nextJob;
}

export async function getAutopilotRun(projectId: string) {
  const store = await readStore();
  const jobs = sortJobs(store.jobs.filter((job) => job.projectId === projectId));
  return jobs.find((job) => job.status !== "COMPLETED") ?? jobs[0] ?? null;
}

async function getAutopilotRunById(jobId: string) {
  const store = await readStore();
  return store.jobs.find((job) => job.id === jobId) ?? null;
}

function createJob(projectId: string, mode: AiAutopilotMode, chapterIds: string[], generalPrompt: string): AutopilotRunRecord {
  const timestamp = new Date().toISOString();
  return {
    id: randomUUID(),
    projectId,
    mode,
    status: "IDLE",
    generalPrompt: generalPrompt.trim(),
    chapterIds,
    nextChapterIndex: 0,
    processedChapterIds: [],
    activeChapterId: null,
    lastMessage: "",
    lastError: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function markJob(
  job: AutopilotRunRecord,
  patch: Partial<AutopilotRunRecord>,
) {
  return persistJob({
    ...job,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

async function processJob(job: AutopilotRunRecord, maxChapters: number) {
  let activeJob = await markJob(job, {
    status: "RUNNING",
    lastError: "",
    lastMessage: job.nextChapterIndex === 0 ? "Starting AI writing run..." : "Resuming AI writing run...",
  });

  let processedThisRun = 0;

  while (activeJob.nextChapterIndex < activeJob.chapterIds.length && processedThisRun < maxChapters) {
    const project = await getProjectWorkspace(activeJob.projectId);
    if (!project) {
      throw new Error("Project not found.");
    }

    const chapterId = activeJob.chapterIds[activeJob.nextChapterIndex];
    const chapter = getChapterById(project, chapterId);

    if (!chapter) {
      activeJob = await markJob(activeJob, {
        nextChapterIndex: activeJob.nextChapterIndex + 1,
        lastMessage: "Skipped a missing chapter and moved to the next one.",
      });
      continue;
    }

    activeJob = await markJob(activeJob, {
      activeChapterId: chapterId,
      lastMessage: `Writing Chapter ${chapter.number}: ${chapter.title}`,
    });

    if (!chapter.outline.trim()) {
      const outline = await generateChapterOutline(activeJob.projectId, chapterId, activeJob.generalPrompt);
      await updateChapter(chapterId, {
        outline: outline.content,
        status: chapter.draft.trim() ? chapter.status : "OUTLINED",
      });
    }

    const refreshedProject = await getProjectWorkspace(activeJob.projectId);
    const refreshedChapter = refreshedProject ? getChapterById(refreshedProject, chapterId) : null;
    if (!refreshedProject || !refreshedChapter) {
      throw new Error("Chapter disappeared during the AI writing run.");
    }

    if (chapterNeedsDraft(refreshedChapter)) {
      const draft = await generateChapterDraft(activeJob.projectId, chapterId, activeJob.generalPrompt);
      await updateChapter(chapterId, {
        draft: draft.content,
        status: "DRAFTING",
      });
    }

    const syncedProject = await getProjectWorkspace(activeJob.projectId);
    const syncedChapter = syncedProject ? getChapterById(syncedProject, chapterId) : null;
    if (!syncedProject || !syncedChapter) {
      throw new Error("Chapter could not be reloaded for sync.");
    }

    await syncChapterToStoryState(activeJob.projectId, chapterId, {
      draftOverride: syncedChapter.draft,
      continuityMode: "POST_GENERATION",
    });

    processedThisRun += 1;
    activeJob = await markJob(activeJob, {
      activeChapterId: null,
      nextChapterIndex: activeJob.nextChapterIndex + 1,
      processedChapterIds: dedupeIds([...activeJob.processedChapterIds, chapterId]),
      lastMessage: `Finished Chapter ${syncedChapter.number}: ${syncedChapter.title}.`,
    });
  }

  const finished = activeJob.nextChapterIndex >= activeJob.chapterIds.length;
  activeJob = await markJob(activeJob, {
    activeChapterId: null,
    status: finished ? "COMPLETED" : "PAUSED",
    lastMessage: finished
      ? "AI writing run completed."
      : "This run paused safely. Resume it later to keep drafting the book.",
  });

  return {
    job: activeJob,
    project: await getProjectWorkspace(activeJob.projectId),
  };
}

export async function startAutopilotRun(options: {
  projectId: string;
  mode: AiAutopilotMode;
  chapterId?: string | null;
  generalPrompt?: string;
  maxChapters?: number;
}) {
  const project = await getProjectWorkspace(options.projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  const chapterIds = selectChapterIds(project, options.mode, options.chapterId);
  if (chapterIds.length === 0) {
    throw new Error("There are no chapters available for AI writing yet.");
  }

  const job = await persistJob(createJob(options.projectId, options.mode, chapterIds, options.generalPrompt ?? ""));

  try {
    return await processJob(job, options.maxChapters ?? 2);
  } catch (error) {
    const latest = (await getAutopilotRunById(job.id)) ?? job;
    const failed = await markJob(latest, {
      status: isLikelyProviderPause(error) ? "PAUSED" : "FAILED",
      activeChapterId: null,
      lastError: error instanceof Error ? error.message : "The AI writing run stopped unexpectedly.",
      lastMessage: isLikelyProviderPause(error)
        ? "The AI run paused because the provider stopped or limited the session. Resume it later to continue."
        : "The AI writing run failed before it could finish this batch.",
    });

    return {
      job: failed,
      project,
    };
  }
}

export async function resumeAutopilotRun(projectId: string, jobId?: string, maxChapters = 2) {
  const job = jobId ? await getAutopilotRunById(jobId) : await getAutopilotRun(projectId);
  if (!job || job.projectId !== projectId) {
    throw new Error("No paused AI writing run was found for this project.");
  }

  if (job.status === "COMPLETED") {
    return {
      job,
      project: await getProjectWorkspace(projectId),
    };
  }

  try {
    return await processJob(job, maxChapters);
  } catch (error) {
    const latest = (await getAutopilotRunById(job.id)) ?? job;
    const failed = await markJob(latest, {
      status: isLikelyProviderPause(error) ? "PAUSED" : "FAILED",
      activeChapterId: null,
      lastError: error instanceof Error ? error.message : "The AI writing run stopped unexpectedly.",
      lastMessage: isLikelyProviderPause(error)
        ? "The AI run paused because the provider stopped or limited the session. Resume it later to continue."
        : "The AI writing run failed before it could finish this batch.",
    });

    return {
      job: failed,
      project: await getProjectWorkspace(projectId),
    };
  }
}
