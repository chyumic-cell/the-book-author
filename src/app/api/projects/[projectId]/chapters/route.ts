import { fail, ok } from "@/lib/api";
import { getProjectWorkspace } from "@/lib/project-data";
import { createChapter } from "@/lib/story-service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const chapter = await createChapter(projectId);
    const project = await getProjectWorkspace(projectId);

    return ok({ chapterId: chapter.id, project });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not create chapter.");
  }
}
