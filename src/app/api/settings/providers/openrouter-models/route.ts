import { fail, ok } from "@/lib/api";
import { getOpenRouterModels } from "@/lib/openrouter-models";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get("refresh") === "1";
    const search = url.searchParams.get("search")?.trim().toLowerCase() ?? "";

    const models = await getOpenRouterModels(forceRefresh);
    const filtered = !search
      ? models
      : models.filter((model) =>
          [model.id, model.name, model.description].some((value) => value.toLowerCase().includes(search)),
        );

    return ok({ models: filtered });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not load OpenRouter models.");
  }
}
