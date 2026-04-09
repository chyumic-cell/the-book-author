import { runProjectAssistant } from "@/lib/project-assistant";
import { fail, ok } from "@/lib/api";
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
    const result = await runProjectAssistant({
      projectId,
      message: input.message,
      role: input.role,
      scope: input.scope,
      chapterId: input.chapterId ?? null,
      applyChanges: input.applyChanges,
    });

    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "The project copilot could not complete that request.");
  }
}
