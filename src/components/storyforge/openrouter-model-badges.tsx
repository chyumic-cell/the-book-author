import { Check, DollarSign } from "lucide-react";

import { Chip } from "@/components/ui/chip";
import { getOpenRouterPriceSummary } from "@/lib/openrouter-model-display";
import type { OpenRouterModelRecord } from "@/types/storyforge";

export function OpenRouterModelBadges({
  model,
  selected = false,
  showContext = true,
}: {
  model: OpenRouterModelRecord;
  selected?: boolean;
  showContext?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {selected ? <Chip className="border-[color:var(--line-strong)] text-[var(--text)]">Selected</Chip> : null}
      {model.fictionRecommended ? (
        <Chip
          className="gap-1 border-emerald-300/80 bg-emerald-50 text-emerald-800"
          title={model.fictionReason}
        >
          <Check className="h-3.5 w-3.5" />
          Fiction pick
        </Chip>
      ) : null}
      {model.expensive ? (
        <Chip className="gap-1 border-rose-300/80 bg-rose-50 text-rose-800">
          <DollarSign className="h-3.5 w-3.5" />
          High cost
        </Chip>
      ) : null}
      <Chip>{getOpenRouterPriceSummary(model)}</Chip>
      {showContext ? <Chip>{model.contextLength.toLocaleString()} ctx</Chip> : null}
    </div>
  );
}
