import { getProjectWorkspace } from "@/lib/project-data";
import { deleteProject, updateProject } from "@/lib/story-service";
import { fail, ok } from "@/lib/api";
import { projectPatchSchema } from "@/lib/schemas";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const project = await getProjectWorkspace(projectId);
  if (!project) {
    return fail("Project not found.", 404);
  }

  return ok({ project });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const input = projectPatchSchema.parse(await request.json());
    await updateProject(projectId, input);
    const project = await getProjectWorkspace(projectId);
    return ok({ project });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not update project.");
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const project = await getProjectWorkspace(projectId);
    if (!project) {
      return fail("Project not found.", 404);
    }

    await deleteProject(projectId);
    return ok({ deletedProjectId: projectId });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not delete project.");
  }
}
