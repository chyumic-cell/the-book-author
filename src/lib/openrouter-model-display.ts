import type { OpenRouterModelRecord } from "@/types/storyforge";

export function formatOpenRouterPrice(value: number) {
  if (value === 0) {
    return "Free";
  }

  if (value < 0.01) {
    return `$${value.toFixed(4)}/M`;
  }

  return `$${value.toFixed(2)}/M`;
}

export function getOpenRouterPriceSummary(model: Pick<OpenRouterModelRecord, "isFree" | "promptPricePerMillion" | "completionPricePerMillion">) {
  if (model.isFree) {
    return "Free";
  }

  return `Input ${formatOpenRouterPrice(model.promptPricePerMillion)} | Output ${formatOpenRouterPrice(
    model.completionPricePerMillion,
  )}`;
}

export function getOpenRouterOptionLabel(
  model: Pick<OpenRouterModelRecord, "name" | "fictionRecommended" | "isFree" | "expensive">,
) {
  const tags: string[] = [];

  if (model.fictionRecommended) {
    tags.push("fiction pick");
  }

  if (model.isFree) {
    tags.push("free");
  } else if (model.expensive) {
    tags.push("high cost");
  }

  return tags.length > 0 ? `${model.name} [${tags.join(" | ")}]` : model.name;
}
