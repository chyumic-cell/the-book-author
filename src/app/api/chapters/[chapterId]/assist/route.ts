import { assistSelection, coachWriter } from "@/lib/openai";
import { getProjectWorkspace } from "@/lib/project-data";
import { createAssistRun } from "@/lib/story-service";
import { fail, ok } from "@/lib/api";
import { assistRequestSchema } from "@/lib/schemas";

export async function POST(
  request: Request,
  context: { params: Promise<{ chapterId: string }> },
) {
  try {
    const { chapterId } = await context.params;
    const input = assistRequestSchema.parse(await request.json());
    const projectId = await getProjectIdFromChapter(chapterId);
    const project = projectId ? await getProjectWorkspace(projectId) : null;
    if (!project) {
      return fail("Project not found.", 404);
    }

    const localExcerpt = `${input.beforeSelection.slice(-220)}${input.selectionText}${input.afterSelection.slice(0, 220)}`;
    const result =
      input.actionType === "COACH"
        ? await coachWriter(project.id, chapterId, input.instruction, input.role)
        : await assistSelection({
            projectId: project.id,
            chapterId,
            mode: input.mode,
            role: input.role,
            actionType: input.actionType,
            selectionText: input.selectionText,
            instruction: input.instruction,
            localExcerpt,
          });

    const run = await createAssistRun({
      projectId: project.id,
      chapterId,
      mode: input.mode,
      role: input.role,
      actionType: input.actionType,
      selectionText: input.selectionText,
      instruction: input.instruction,
      contextNote: input.contextNote,
      suggestion: result.content,
    });

    return ok({ run, contextPackage: result.contextPackage });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Assist action failed.");
  }
}

async function getProjectIdFromChapter(chapterId: string) {
  const chapter = await (await import("@/lib/prisma")).prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { projectId: true },
  });

  return chapter?.projectId ?? null;
}
