import { reviseChapter } from "@/lib/openai";
import { getProjectWorkspace } from "@/lib/project-data";
import { createAssistRun } from "@/lib/story-service";
import { fail, ok } from "@/lib/api";

export async function POST(
  request: Request,
  context: { params: Promise<{ chapterId: string }> },
) {
  try {
    const { chapterId } = await context.params;
    const { instruction, actionType } = (await request.json()) as {
      instruction?: string;
      actionType?: string;
    };
    const projectId = await getProjectIdFromChapter(chapterId);
    const project = projectId ? await getProjectWorkspace(projectId) : null;
    if (!project) {
      return fail("Project not found.", 404);
    }

    const result = await reviseChapter(project.id, chapterId, instruction ?? "Strengthen the chapter.", (actionType ?? "REVISE") as never);
    const run = await createAssistRun({
      projectId: project.id,
      chapterId,
      mode: "CO_WRITE",
      role: "DEVELOPMENTAL_EDITOR",
      actionType: actionType ?? "REVISE",
      instruction,
      suggestion: result.content,
      contextNote: `Token estimate: ${result.contextPackage.tokenEstimate}`,
    });

    return ok({ run, contextPackage: result.contextPackage });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Revision failed.");
  }
}

async function getProjectIdFromChapter(chapterId: string) {
  const chapter = await (await import("@/lib/prisma")).prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { projectId: true },
  });

  return chapter?.projectId ?? null;
}
