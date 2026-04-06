import { getProjectWorkspace } from "@/lib/project-data";
import { applyAssistRun } from "@/lib/story-service";
import { fail, ok } from "@/lib/api";
import { applyAssistSchema } from "@/lib/schemas";

export async function POST(
  request: Request,
  context: { params: Promise<{ assistRunId: string }> },
) {
  try {
    const { assistRunId } = await context.params;
    const input = applyAssistSchema.parse(await request.json());
    const nextContent = await applyAssistRun(assistRunId, input);
    const run = await (await import("@/lib/prisma")).prisma.aiAssistRun.findUnique({
      where: { id: assistRunId },
      select: { projectId: true },
    });

    if (!run) {
      return fail("Assist run not found.", 404);
    }

    const project = await getProjectWorkspace(run.projectId);
    return ok({ draft: nextContent, content: nextContent, project });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not apply suggestion.");
  }
}
