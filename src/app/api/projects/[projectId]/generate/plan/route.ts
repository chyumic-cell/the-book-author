import { generateStoryPlan } from "@/lib/openai";
import { fail, ok } from "@/lib/api";

export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const result = await generateStoryPlan(projectId);
    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not generate story plan.");
  }
}
