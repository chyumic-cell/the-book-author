import { ok, fail } from "@/lib/api";
import { signInBetaUser } from "@/lib/beta-auth";
import { assertSameOrigin } from "@/lib/request-security";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as {
      username?: string;
      password?: string;
    };

    await signInBetaUser({
      username: body.username ?? "",
      password: body.password ?? "",
    });

    return ok({ signedIn: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not sign in.");
  }
}
