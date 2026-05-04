import { fail, ok } from "@/lib/api";
import {
  runTargetedCharacterAi,
  runTargetedPlanningFieldAi,
  runTargetedStoryBibleFieldAi,
} from "@/lib/targeted-field-ai";
import { targetedCharacterAiSchema, targetedFieldAiSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;

    if (body.mode === "character") {
      const input = targetedCharacterAiSchema.parse(body);
      const result = await runTargetedCharacterAi({
        projectId,
        characterId: input.characterId,
        action: input.action,
      });
      return ok(result);
    }

    const input = targetedFieldAiSchema.parse(body);
    const result =
      input.scope === "SKELETON"
        ? await runTargetedPlanningFieldAi({
            projectId,
            itemId: input.itemId,
            itemTitle: input.itemTitle,
            fieldKey: input.fieldKey as never,
            fieldLabel: input.fieldLabel,
            action: input.action,
          })
        : await runTargetedStoryBibleFieldAi({
            projectId,
            itemId: input.itemId,
            itemTitle: input.itemTitle,
            fieldKey: input.fieldKey,
            fieldLabel: input.fieldLabel,
            action: input.action,
          });

    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "The AI field update could not be completed.");
  }
}
