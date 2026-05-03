import { persistMemoryExtraction } from "@/lib/memory";
import { getProjectWorkspace } from "@/lib/project-data";
import { fail, ok } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
  context: { params: Promise<{ chapterId: string }> },
) {
  try {
    const { chapterId } = await context.params;
    const projectId = await getProjectIdFromChapter(chapterId);
    if (!projectId) {
      return fail("Project not found.", 404);
    }
    const body = await request.json().catch(() => ({}));

    const extraction = await persistMemoryExtraction(
      projectId,
      chapterId,
      body && typeof body === "object"
        ? {
            title: typeof body.title === "string" ? body.title : undefined,
            purpose: typeof body.purpose === "string" ? body.purpose : undefined,
            currentBeat: typeof body.currentBeat === "string" ? body.currentBeat : undefined,
            desiredMood: typeof body.desiredMood === "string" ? body.desiredMood : undefined,
            outline: typeof body.outline === "string" ? body.outline : undefined,
            notes: typeof body.notes === "string" ? body.notes : undefined,
            draft: typeof body.draft === "string" ? body.draft : undefined,
          }
        : undefined,
    );
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
