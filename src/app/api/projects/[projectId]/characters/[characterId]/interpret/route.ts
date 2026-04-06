import { fail, ok } from "@/lib/api";
import { interpretCharacterProfile } from "@/lib/openai";

export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string; characterId: string }> },
) {
  try {
    const { projectId, characterId } = await context.params;
    const suggestions = await interpretCharacterProfile(projectId, characterId);
    return ok({ suggestions });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not interpret the character dossier.");
  }
}
