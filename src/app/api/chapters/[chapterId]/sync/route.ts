import { fail, ok } from "@/lib/api";
import { syncChapterToStoryState } from "@/lib/story-sync";

export async function POST(
  _request: Request,
  context: { params: Promise<{ chapterId: string }> },
) {
  try {
    const { chapterId } = await context.params;
    const projectId = await getProjectIdFromChapter(chapterId);
    if (!projectId) {
      return fail("Project not found.", 404);
    }

    const result = await syncChapterToStoryState(projectId, chapterId, {
      continuityMode: "CHAPTER",
    });

    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not sync chapter to story.");
  }
}

async function getProjectIdFromChapter(chapterId: string) {
  const chapter = await (await import("@/lib/prisma")).prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { projectId: true },
  });

  return chapter?.projectId ?? null;
}
