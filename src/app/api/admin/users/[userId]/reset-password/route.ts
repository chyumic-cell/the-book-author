import { NextResponse } from "next/server";

import { getHostedSiteUrl } from "@/lib/hosted-beta-config";
import { resetBetaUserPassword } from "@/lib/beta-auth";
import { assertSameOrigin } from "@/lib/request-security";

function redirectToAdmin(message: string, key: "success" | "error") {
  const url = new URL("/admin", getHostedSiteUrl());
  url.searchParams.set(key, message);
  return NextResponse.redirect(url);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  assertSameOrigin(request);
  const formData = await request.formData();
  const { userId } = await context.params;

  try {
    await resetBetaUserPassword(userId, String(formData.get("password") ?? ""));
    return redirectToAdmin("Password reset successfully.", "success");
  } catch (error) {
    return redirectToAdmin(error instanceof Error ? error.message : "Could not reset the password.", "error");
  }
}
