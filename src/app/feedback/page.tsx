import { BetaShell } from "@/components/beta/beta-shell";
import { FeedbackForm } from "@/components/beta/feedback-form";
import { requireBetaSession } from "@/lib/beta-auth";
import { APP_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  const session = await requireBetaSession();

  return (
      <BetaShell
        intro={`Feedback goes straight into the ${APP_NAME} beta inbox so product problems, UX pain, and broken flows can be tracked cleanly.`}
        session={session}
        title={`${APP_NAME} Feedback`}
      >
      <FeedbackForm />
    </BetaShell>
  );
}
