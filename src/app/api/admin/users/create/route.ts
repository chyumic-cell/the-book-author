import { NextResponse } from "next/server";

import { createBetaUserByAdmin } from "@/lib/beta-auth";
import { getHostedSiteUrl } from "@/lib/hosted-beta-config";
import { assertSameOrigin } from "@/lib/request-security";

function redirectToAdmin(message: string, key: "success" | "error") {
  const url = new URL("/admin", getHostedSiteUrl());
  url.searchParams.set(key, message);
  return NextResponse.redirect(url);
}

export async function POST(request: Request) {
  assertSameOrigin(request);
  const formData = await request.formData();

  try {
    await createBetaUserByAdmin({
      username: String(formData.get("username") ?? ""),
      password: String(formData.get("password") ?? ""),
      displayName: String(formData.get("displayName") ?? ""),
      role: String(formData.get("role") ?? ""),
      planTier: String(formData.get("planTier") ?? ""),
    });

    return redirectToAdmin("User created successfully.", "success");
  } catch (error) {
    return redirectToAdmin(error instanceof Error ? error.message : "Could not create the user.", "error");
  }
}
