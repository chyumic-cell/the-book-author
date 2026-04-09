import { fail, ok } from "@/lib/api";
import { getAutopilotRun, resumeAutopilotRun, startAutopilotRun } from "@/lib/book-autopilot";
import { autopilotRequestSchema } from "@/lib/schemas";
import { getProjectWorkspace } from "@/lib/project-data";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const [job, project] = await Promise.all([getAutopilotRun(projectId), getProjectWorkspace(projectId)]);
    if (!project) {
      return fail("Project not found.", 404);
    }

    return ok({ job, project });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not load the AI writing run.");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const parsed = autopilotRequestSchema.parse(await request.json());

    if (parsed.action === "status") {
      const [job, project] = await Promise.all([getAutopilotRun(projectId), getProjectWorkspace(projectId)]);
      if (!project) {
        return fail("Project not found.", 404);
      }

      return ok({ job, project });
    }

    const result =
      parsed.action === "resume"
        ? await resumeAutopilotRun(projectId, parsed.jobId, parsed.maxChapters)
        : await startAutopilotRun({
            projectId,
            mode: parsed.mode,
            chapterId: parsed.chapterId ?? null,
            generalPrompt: parsed.generalPrompt,
            maxChapters: parsed.maxChapters,
          });

    if (!result.project) {
      return fail("Project could not be reloaded after the AI writing run.");
    }

    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not run the AI writing job.");
  }
}
