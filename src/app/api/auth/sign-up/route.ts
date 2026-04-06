import { ok, fail } from "@/lib/api";
import { signUpBetaUser } from "@/lib/beta-auth";
import { assertSameOrigin } from "@/lib/request-security";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as {
      username?: string;
      password?: string;
      displayName?: string;
      agreedToTerms?: boolean;
    };

    await signUpBetaUser({
      username: body.username ?? "",
      password: body.password ?? "",
      displayName: body.displayName ?? "",
      agreedToTerms: Boolean(body.agreedToTerms),
    });

    return ok({ created: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not create the account.");
  }
}
