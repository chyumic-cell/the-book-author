import { AuthForm } from "@/components/beta/auth-form";
import { BetaShell } from "@/components/beta/beta-shell";
import { getOptionalBetaSession } from "@/lib/beta-auth";
import { APP_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const session = await getOptionalBetaSession();

  return (
      <BetaShell
        intro={`Sign in to the ${APP_NAME} private-beta portal. This portal handles access, policies, support, moderation, and downloads while the actual writing data remains on each user's device in phase one.`}
        session={session}
        title={`${APP_NAME} Private Beta Access`}
      >
      <AuthForm mode="sign-in" />
    </BetaShell>
  );
}
