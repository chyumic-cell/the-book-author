import { fail, ok } from "@/lib/api";
import { decorateBookAuthorBrainResult } from "@/lib/book-author-brain";
import {
  runTargetedCharacterAi,
  runTargetedSkeletonFieldAi,
  runTargetedPlanningFieldAi,
  runTargetedStoryBibleFieldAi,
} from "@/lib/targeted-field-ai";
import { targetedCharacterAiSchema, targetedFieldAiSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 120;

function withRouteTimeout<T>(operation: Promise<T>, timeoutMs = 90000) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return Promise.race([
    operation,
    new Promise<T>((_resolve, reject) => {
      timeout = setTimeout(() => reject(new Error("The AI field update timed out. Please try again.")), timeoutMs);
    }),
  ]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;

    if (body.mode === "character") {
      const input = targetedCharacterAiSchema.parse(body);
      const result = await withRouteTimeout(runTargetedCharacterAi({
        projectId,
        characterId: input.characterId,
        action: input.action,
        draftCharacter: input.draftCharacter,
        instruction: input.instruction,
      }));
      return ok(decorateBookAuthorBrainResult(result as unknown as Record<string, unknown>, {
        targetFields: ["storyBible.character"],
        route: "mixed",
        reason: "Character dossiers use a targeted field pack rather than the broad assistant prompt.",
      }));
    }

    const input = targetedFieldAiSchema.parse(body);
    const result = await withRouteTimeout(
      input.scope === "SKELETON" && (input.targetEntityType === "chapter" || !input.targetEntityType)
        ? runTargetedPlanningFieldAi({
            projectId,
            itemId: input.itemId,
            itemTitle: input.itemTitle,
            fieldKey: input.fieldKey as never,
            fieldLabel: input.fieldLabel,
            action: input.action,
            currentValue: input.currentValue,
            instruction: input.instruction,
            draftItem: input.draftItem,
          })
        : input.scope === "SKELETON"
          ? runTargetedSkeletonFieldAi({
              projectId,
              targetEntityType: input.targetEntityType as "structureBeat" | "sceneCard",
              itemId: input.itemId,
              itemTitle: input.itemTitle,
              fieldKey: input.fieldKey,
              fieldLabel: input.fieldLabel,
              action: input.action,
              currentValue: input.currentValue,
              instruction: input.instruction,
              draftItem: input.draftItem,
            })
        : runTargetedStoryBibleFieldAi({
            projectId,
            itemId: input.itemId,
            itemTitle: input.itemTitle,
            fieldKey: input.fieldKey,
            fieldLabel: input.fieldLabel,
            action: input.action,
            currentValue: input.currentValue,
            instruction: input.instruction,
            draftItem: input.draftItem,
          }),
    );

    return ok(decorateBookAuthorBrainResult(result as unknown as Record<string, unknown>, {
      targetFields: [input.scope === "SKELETON" ? `skeleton.${input.fieldKey}` : `storyBible.${input.fieldKey}`],
      route: "fast",
    }));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "The AI field update could not be completed.");
  }
}
