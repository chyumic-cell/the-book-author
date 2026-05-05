import { fail, ok } from "@/lib/api";
import {
  runTargetedCharacterAi,
  runTargetedSkeletonFieldAi,
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
        draftCharacter: input.draftCharacter,
      });
      return ok(result);
    }

    const input = targetedFieldAiSchema.parse(body);
    const result =
      input.scope === "SKELETON" && (input.targetEntityType === "chapter" || !input.targetEntityType)
        ? await runTargetedPlanningFieldAi({
            projectId,
            itemId: input.itemId,
            itemTitle: input.itemTitle,
            fieldKey: input.fieldKey as never,
            fieldLabel: input.fieldLabel,
            action: input.action,
            currentValue: input.currentValue,
            draftItem: input.draftItem,
          })
        : input.scope === "SKELETON"
          ? await runTargetedSkeletonFieldAi({
              projectId,
              targetEntityType: input.targetEntityType as "structureBeat" | "sceneCard",
              itemId: input.itemId,
              itemTitle: input.itemTitle,
              fieldKey: input.fieldKey,
              fieldLabel: input.fieldLabel,
              action: input.action,
              currentValue: input.currentValue,
              draftItem: input.draftItem,
            })
        : await runTargetedStoryBibleFieldAi({
            projectId,
            itemId: input.itemId,
            itemTitle: input.itemTitle,
            fieldKey: input.fieldKey,
            fieldLabel: input.fieldLabel,
            action: input.action,
            currentValue: input.currentValue,
            draftItem: input.draftItem,
          });

    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "The AI field update could not be completed.");
  }
}
