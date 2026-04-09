import { AuthForm } from "@/components/beta/auth-form";
import { BetaShell } from "@/components/beta/beta-shell";
import { getOptionalBetaSession } from "@/lib/beta-auth";
import { APP_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const session = await getOptionalBetaSession();

  return (
      <BetaShell
        intro={`Sign in to ${APP_NAME} to access downloads, policies, feedback, and account-managed features while your actual writing data remains on each user's own device.`}
        session={session}
        title="Sign in"
      >
      <AuthForm mode="sign-in" />
    </BetaShell>
  );
}
