import { reviewBookWithBestsellerGuide } from "@/lib/openai";
import { fail, ok } from "@/lib/api";

export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const report = await reviewBookWithBestsellerGuide(projectId);
    return ok({ report });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not review the book against the bestseller guide.");
  }
}
