import { getProjectWorkspace, listProjects } from "@/lib/project-data";
import { createProject } from "@/lib/story-service";
import { fail, ok } from "@/lib/api";
import { projectCreateSchema } from "@/lib/schemas";

export async function GET() {
  const projects = await listProjects();
  return ok({ projects });
}

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const input = projectCreateSchema.parse(json);
    const projectId = await createProject(input);
    const project = await getProjectWorkspace(projectId);
    return ok({ projectId, project }, { status: 201 });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not create project.");
  }
}
