import { reviewChapterWithBestsellerGuide } from "@/lib/openai";
import { fail, ok } from "@/lib/api";

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

    const report = await reviewChapterWithBestsellerGuide(projectId, chapterId);
    return ok({ report });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not review the chapter against the bestseller guide.");
  }
}

async function getProjectIdFromChapter(chapterId: string) {
  const chapter = await (await import("@/lib/prisma")).prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { projectId: true },
  });

  return chapter?.projectId ?? null;
}
