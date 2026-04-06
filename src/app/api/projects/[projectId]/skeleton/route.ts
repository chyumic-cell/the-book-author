import { getProjectWorkspace } from "@/lib/project-data";
import { mutateSkeleton } from "@/lib/story-service";
import { fail, ok } from "@/lib/api";
import { skeletonMutationSchema } from "@/lib/schemas";

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
    const mutation = skeletonMutationSchema.parse(await request.json());
    await mutateSkeleton(projectId, mutation, method);
    const project = await getProjectWorkspace(projectId);
    return ok({ project });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not update the story skeleton.");
  }
}
