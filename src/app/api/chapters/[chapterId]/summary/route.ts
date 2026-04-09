import { summarizeChapter } from "@/lib/openai";
import { getProjectWorkspace } from "@/lib/project-data";
import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _request: Request,
  context: { params: Promise<{ chapterId: string }> },
) {
  try {
    const { chapterId } = await context.params;
    const projectId = await getProjectIdFromChapter(chapterId);
    if (!projectId) {
      return fail("Project not found.", 404);
    }

    const summary = await summarizeChapter(projectId, chapterId);
    await prisma.chapterSummary.deleteMany({
      where: {
        projectId,
        chapterId,
        kind: "CORE",
      },
    });
    await prisma.chapterSummary.create({
      data: {
        projectId,
        chapterId,
        kind: "CORE",
        summary: summary.summary,
        emotionalTone: summary.emotionalTone,
        unresolvedQuestions: summary.candidates
          .filter((candidate) => candidate.classification === "unresolved thread")
          .map((candidate) => candidate.title),
        bridgeText: `Carry forward the pressure from ${summary.summary.slice(0, 120)}.`,
      },
    });
    const project = await getProjectWorkspace(projectId);
    return ok({ summary, project });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not summarize chapter.");
  }
}

async function getProjectIdFromChapter(chapterId: string) {
  const chapter = await (await import("@/lib/prisma")).prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { projectId: true },
  });

  return chapter?.projectId ?? null;
}
