import { NextResponse } from "next/server";

import { signOutBetaUser } from "@/lib/beta-auth";
import { getHostedSiteUrl } from "@/lib/hosted-beta-config";
import { assertSameOrigin } from "@/lib/request-security";

export async function POST(request: Request) {
  assertSameOrigin(request);
  await signOutBetaUser();
  return NextResponse.redirect(new URL("/sign-in", getHostedSiteUrl()));
}
