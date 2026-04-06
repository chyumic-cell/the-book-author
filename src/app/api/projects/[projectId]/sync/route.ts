import { fail, ok } from "@/lib/api";
import { resyncProjectStoryState } from "@/lib/story-sync";

export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const project = await resyncProjectStoryState(projectId);
    return ok(project);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not resync project story state.");
  }
}
