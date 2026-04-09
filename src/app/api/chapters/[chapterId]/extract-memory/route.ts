import { persistMemoryExtraction } from "@/lib/memory";
import { getProjectWorkspace } from "@/lib/project-data";
import { fail, ok } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 300;

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

    const extraction = await persistMemoryExtraction(projectId, chapterId);
    const project = await getProjectWorkspace(projectId);
    return ok({ extraction, project });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Memory extraction failed.");
  }
}

async function getProjectIdFromChapter(chapterId: string) {
  const chapter = await (await import("@/lib/prisma")).prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { projectId: true },
  });

  return chapter?.projectId ?? null;
}
