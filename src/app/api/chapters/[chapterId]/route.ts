import { getProjectWorkspace } from "@/lib/project-data";
import { deleteChapter, updateChapter } from "@/lib/story-service";
import { fail, ok } from "@/lib/api";
import { chapterPatchSchema } from "@/lib/schemas";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ chapterId: string }> },
) {
  try {
    const { chapterId } = await context.params;
    const input = chapterPatchSchema.parse(await request.json());
    const chapter = await updateChapter(chapterId, input);
    const project = await getProjectWorkspace(chapter.projectId);
    return ok({ chapterId, project });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not update chapter.");
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ chapterId: string }> },
) {
  try {
    const { chapterId } = await context.params;
    const projectId = await deleteChapter(chapterId);
    const project = await getProjectWorkspace(projectId);
    return ok({ chapterId, project });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not delete chapter.");
  }
}
