import "server-only";

import type { OpenRouterModelRecord } from "@/types/storyforge";

type OpenRouterModelsResponse = {
  data?: Array<{
    id?: string;
    name?: string;
    description?: string;
    context_length?: number;
    pricing?: {
      prompt?: string;
      completion?: string;
    };
    architecture?: {
      input_modalities?: string[];
      output_modalities?: string[];
    };
    supported_parameters?: string[];
  }>;
};

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const CACHE_TTL_MS = 15 * 60 * 1000;
const EXPENSIVE_PROMPT_THRESHOLD = 5;
const EXPENSIVE_COMPLETION_THRESHOLD = 15;
const EXPENSIVE_TOTAL_THRESHOLD = 20;

const FICTION_RECOMMENDATIONS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /(claude[-/ ].*(sonnet|opus)|anthropic\/claude)/i,
    reason: "Excellent prose control, revision quality, and subtext handling for fiction work.",
  },
  {
    pattern: /(gpt-4\.1|gpt-4o|openai\/gpt|o3|o4-mini)/i,
    reason: "Strong at story structure, scene intent, and following nuanced rewrite instructions.",
  },
  {
    pattern: /(gemini[-/ ].*(pro|flash)|google\/gemini)/i,
    reason: "Very useful for long-form planning and continuity thanks to large-context reasoning.",
  },
  {
    pattern: /(mistral[-/ ].*(large|small)|magistral|ministral)/i,
    reason: "A strong value choice for drafting, brainstorming, and rapid iteration.",
  },
  {
    pattern: /(qwen[-/ ].*(plus|max|turbo)|qwen\/)/i,
    reason: "Solid budget-friendly instruction following for outlining and draft support.",
  },
  {
    pattern: /(rocinante|creative writing|fiction|storytelling|roleplay|narrative|dialogue|novel)/i,
    reason: "Its positioning suggests a stronger fit for creative writing and narrative tasks.",
  },
];

let cachedModels: OpenRouterModelRecord[] | null = null;
let cachedAt = 0;

function toNumber(value: string | undefined) {
  const parsed = Number(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function getFictionRecommendation(model: {
  id?: string;
  name?: string;
  description?: string;
}) {
  const searchableText = `${model.id ?? ""} ${model.name ?? ""} ${model.description ?? ""}`.toLowerCase();
  const match = FICTION_RECOMMENDATIONS.find((rule) => rule.pattern.test(searchableText));

  return match?.reason ?? "";
}

function normalizeModel(
  model: NonNullable<OpenRouterModelsResponse["data"]>[number],
): OpenRouterModelRecord | null {
  if (!model.id) {
    return null;
  }

  const inputModalities = model.architecture?.input_modalities ?? ["text"];
  const outputModalities = model.architecture?.output_modalities ?? ["text"];
  const promptPricePerMillion = toNumber(model.pricing?.prompt) * 1_000_000;
  const completionPricePerMillion = toNumber(model.pricing?.completion) * 1_000_000;
  const fictionReason = getFictionRecommendation(model);
  const totalPricePerMillion = promptPricePerMillion + completionPricePerMillion;

  // StoryForge currently targets prose generation and editing, so we bias toward text-output models.
  if (!outputModalities.includes("text")) {
    return null;
  }

  return {
    id: model.id,
    name: model.name?.trim() || model.id,
    description: model.description?.trim() || "No model description provided.",
    contextLength: model.context_length ?? 0,
    promptPricePerMillion,
    completionPricePerMillion,
    inputModalities,
    outputModalities,
    supportedParameters: model.supported_parameters ?? [],
    isFree: promptPricePerMillion === 0 && completionPricePerMillion === 0,
    fictionRecommended: Boolean(fictionReason),
    fictionReason,
    expensive:
      promptPricePerMillion >= EXPENSIVE_PROMPT_THRESHOLD ||
      completionPricePerMillion >= EXPENSIVE_COMPLETION_THRESHOLD ||
      totalPricePerMillion >= EXPENSIVE_TOTAL_THRESHOLD,
  };
}

function scoreModel(model: OpenRouterModelRecord) {
  let score = 0;

  if (model.isFree) {
    score += 20;
  }

  if (model.fictionRecommended) {
    score += 14;
  }

  if (model.supportedParameters.includes("tools")) {
    score += 10;
  }

  if (model.supportedParameters.includes("structured_outputs") || model.supportedParameters.includes("response_format")) {
    score += 6;
  }

  if (model.contextLength >= 128_000) {
    score += 5;
  }

  const lowerName = `${model.id} ${model.name}`.toLowerCase();
  if (lowerName.includes("claude") || lowerName.includes("gpt") || lowerName.includes("gemini")) {
    score += 4;
  }

  if (model.expensive) {
    score -= 2;
  }

  return score;
}

export async function getOpenRouterModels(forceRefresh = false): Promise<OpenRouterModelRecord[]> {
  if (!forceRefresh && cachedModels && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedModels;
  }

  const response = await fetch(OPENROUTER_MODELS_URL, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`OpenRouter models request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as OpenRouterModelsResponse;
  const models = (payload.data ?? [])
    .map(normalizeModel)
    .filter((model): model is OpenRouterModelRecord => Boolean(model))
    .sort((left, right) => {
      const scoreDelta = scoreModel(right) - scoreModel(left);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      if (left.isFree !== right.isFree) {
        return left.isFree ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });

  cachedModels = models;
  cachedAt = Date.now();
  return models;
}
