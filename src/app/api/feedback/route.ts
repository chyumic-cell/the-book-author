import { ok, fail } from "@/lib/api";
import { createFeedbackSubmission } from "@/lib/beta-feedback";
import { assertSameOrigin } from "@/lib/request-security";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as {
      subject?: string;
      message?: string;
    };

    await createFeedbackSubmission({
      subject: body.subject ?? "",
      message: body.message ?? "",
    });

    return ok({ sent: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not send feedback.");
  }
}
