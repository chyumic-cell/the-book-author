import { NextResponse } from "next/server";

import { updateBetaUserBan } from "@/lib/beta-auth";
import { getHostedSiteUrl } from "@/lib/hosted-beta-config";
import { assertSameOrigin } from "@/lib/request-security";

export async function POST(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  assertSameOrigin(request);
  const formData = await request.formData();
  const action = String(formData.get("action") ?? "").trim().toLowerCase();
  const reason = String(formData.get("reason") ?? "");
  const { userId } = await context.params;

  try {
    await updateBetaUserBan(userId, {
      banned: action === "ban",
      reason,
    });
  } catch {
    // Let the admin page remain the single place for moderation actions.
  }

  return NextResponse.redirect(new URL("/admin", getHostedSiteUrl()));
}
