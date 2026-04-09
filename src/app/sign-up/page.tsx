import { AuthForm } from "@/components/beta/auth-form";
import { BetaShell } from "@/components/beta/beta-shell";
import { getOptionalBetaSession } from "@/lib/beta-auth";
import { APP_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  const session = await getOptionalBetaSession();

    return (
      <BetaShell
        intro={`Create an account for ${APP_NAME} to open the web workspace, install the mobile app, reach downloads and support, and accept the publishing terms before you begin.`}
        session={session}
        title="Create account"
      >
      <AuthForm mode="sign-up" />
    </BetaShell>
  );
}
