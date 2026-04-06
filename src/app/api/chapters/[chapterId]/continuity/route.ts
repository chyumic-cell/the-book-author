import { getProjectWorkspace } from "@/lib/project-data";
import { runContinuityCheck } from "@/lib/continuity";
import { fail, ok } from "@/lib/api";
import { continuityCheckRequestSchema } from "@/lib/schemas";

export async function POST(
  request: Request,
  context: { params: Promise<{ chapterId: string }> },
) {
  try {
    const { chapterId } = await context.params;
    const { draft, mode } = continuityCheckRequestSchema.parse(
      await request.json().catch(() => ({ draft: undefined })),
    );
    const projectId = await getProjectIdFromChapter(chapterId);
    if (!projectId) {
      return fail("Project not found.", 404);
    }

    const report = await runContinuityCheck(projectId, chapterId, draft, mode);
    const project = await getProjectWorkspace(projectId);
    return ok({ report, project });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Continuity check failed.");
  }
}

async function getProjectIdFromChapter(chapterId: string) {
  const chapter = await (await import("@/lib/prisma")).prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { projectId: true },
  });

  return chapter?.projectId ?? null;
}
