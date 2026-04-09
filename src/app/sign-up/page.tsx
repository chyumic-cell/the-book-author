import { AuthForm } from "@/components/beta/auth-form";
import { BetaShell } from "@/components/beta/beta-shell";
import { getOptionalBetaSession } from "@/lib/beta-auth";
import { APP_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  const session = await getOptionalBetaSession();

  return (
      <BetaShell
        intro={`Create an account for ${APP_NAME} to access downloads, support, feedback, and policy-gated features. ${APP_NAME} is designed so user writing data stays on the user's own device rather than inside a shared hosted manuscript database.`}
        session={session}
        title="Create account"
      >
      <AuthForm mode="sign-up" />
    </BetaShell>
  );
}
