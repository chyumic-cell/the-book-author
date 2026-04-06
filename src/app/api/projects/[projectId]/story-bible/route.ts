import { getProjectWorkspace } from "@/lib/project-data";
import { mutateStoryBible } from "@/lib/story-service";
import { fail, ok } from "@/lib/api";
import { storyBibleMutationSchema } from "@/lib/schemas";

async function handleMutation(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
  method: "POST" | "PATCH" | "DELETE",
) {
  try {
    const { projectId } = await context.params;
    const mutation = storyBibleMutationSchema.parse(await request.json());
    await mutateStoryBible(projectId, mutation, method);
    const project = await getProjectWorkspace(projectId);
    return ok({ project });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Story bible update failed.");
  }
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  return handleMutation(request, context, "POST");
}

export async function PATCH(request: Request, context: { params: Promise<{ projectId: string }> }) {
  return handleMutation(request, context, "PATCH");
}

export async function DELETE(request: Request, context: { params: Promise<{ projectId: string }> }) {
  return handleMutation(request, context, "DELETE");
}
