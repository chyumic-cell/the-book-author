import { getProjectWorkspace } from "@/lib/project-data";
import { mutateIdeaLab } from "@/lib/story-service";
import { fail, ok } from "@/lib/api";
import { ideaLabMutationSchema } from "@/lib/schemas";

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  return handleMutation(request, context, "POST");
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  return handleMutation(request, context, "PATCH");
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  return handleMutation(request, context, "DELETE");
}

async function handleMutation(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
  method: "POST" | "PATCH" | "DELETE",
) {
  try {
    const { projectId } = await context.params;
    const mutation = ideaLabMutationSchema.parse(await request.json());
    await mutateIdeaLab(projectId, mutation, method);
    const project = await getProjectWorkspace(projectId);
    return ok({ project });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not update the idea lab.");
  }
}
