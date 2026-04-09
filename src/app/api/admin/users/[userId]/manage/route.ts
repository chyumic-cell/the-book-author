import { NextResponse } from "next/server";

import { updateBetaUserProfile } from "@/lib/beta-auth";
import { getHostedSiteUrl } from "@/lib/hosted-beta-config";
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
    await updateBetaUserProfile(userId, {
      displayName: String(formData.get("displayName") ?? ""),
      role: String(formData.get("role") ?? ""),
      planTier: String(formData.get("planTier") ?? ""),
    });

    return redirectToAdmin("User profile updated.", "success");
  } catch (error) {
    return redirectToAdmin(error instanceof Error ? error.message : "Could not update the user.", "error");
  }
}
