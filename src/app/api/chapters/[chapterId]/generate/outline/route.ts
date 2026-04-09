import { generateChapterOutline } from "@/lib/openai";
import { getProjectWorkspace } from "@/lib/project-data";
import { createAssistRun } from "@/lib/story-service";
import { fail, ok } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _request: Request,
  context: { params: Promise<{ chapterId: string }> },
) {
  try {
    const { chapterId } = await context.params;
    const project = await getProjectWorkspace((await getProjectIdFromChapter(chapterId)) ?? "");
    if (!project) {
      return fail("Project not found.", 404);
    }

    const result = await generateChapterOutline(project.id, chapterId);
    const run = await createAssistRun({
      projectId: project.id,
      chapterId,
      mode: "FULL_AUTHOR",
      role: "OUTLINE_ARCHITECT",
      actionType: "OUTLINE",
      suggestion: result.content,
      contextNote: `Token estimate: ${result.contextPackage.tokenEstimate}`,
    });

    return ok({ run, contextPackage: result.contextPackage });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not generate outline.");
  }
}

async function getProjectIdFromChapter(chapterId: string) {
  const chapter = await (await import("@/lib/prisma")).prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { projectId: true },
  });

  return chapter?.projectId ?? null;
}
