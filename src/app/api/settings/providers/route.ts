import { fail, ok } from "@/lib/api";
import { getProviderSettingsRecord, saveProviderSettings } from "@/lib/provider-config";

export async function GET() {
  try {
    const settings = await getProviderSettingsRecord();
    return ok({ settings });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not load provider settings.");
  }
}

export async function PUT(request: Request) {
  try {
    const payload = await request.json();
    const settings = await saveProviderSettings(payload);
    return ok({ settings });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not save provider settings.");
  }
}
