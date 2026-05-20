import { fail, ok } from "@/lib/api";
import { runBookAuthorProjectBrain } from "@/lib/book-author-brain";
import type { AssistantPlanAction } from "@/lib/project-assistant";
import { projectChatSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const input = projectChatSchema.parse(await request.json());
    const result = await runBookAuthorProjectBrain({
      projectId,
      message: input.message,
      role: input.role,
      scope: input.scope,
      chapterId: input.chapterId ?? null,
      applyChanges: input.applyChanges,
      previewOnly: input.previewOnly,
      approvedActions: input.approvedActions as AssistantPlanAction[] | undefined,
    });

    return ok({
      ...result,
      message: result.reply,
      assistantMessage: result.reply,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "The project copilot could not complete that request.");
  }
}
