import { fail, ok } from "@/lib/api";
import { updateProviderModel } from "@/lib/provider-config";

export async function PATCH(request: Request) {
  try {
    const payload = await request.json();
    const settings = await updateProviderModel(payload);
    return ok({ settings });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not update provider model.");
  }
}
