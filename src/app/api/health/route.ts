import { getAiModeLabel } from "@/lib/openai";
import { ok } from "@/lib/api";

export async function GET() {
  return ok({ status: "ok", aiMode: await getAiModeLabel() });
}
