import { getProjectWorkspace } from "@/lib/project-data";
import { promoteMemory } from "@/lib/memory";
import { fail, ok } from "@/lib/api";

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const { memoryItemId } = (await request.json()) as { memoryItemId?: string };
    if (!memoryItemId) {
      return fail("memoryItemId is required.");
    }

    await promoteMemory(projectId, memoryItemId);
    const project = await getProjectWorkspace(projectId);
    return ok({ project });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not promote memory.");
  }
}
