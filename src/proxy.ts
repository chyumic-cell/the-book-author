import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { APP_NAME } from "@/lib/brand";

function isHostedBetaEnabled() {
  return (process.env.THE_BOOK_AUTHOR_HOSTED_BETA ?? process.env.STORYFORGE_HOSTED_BETA)?.trim() === "true";
}

function isBlockedHostedPath(pathname: string) {
  return (
    pathname === "/projects" ||
    pathname.startsWith("/projects/") ||
    pathname.startsWith("/api/projects") ||
    pathname.startsWith("/api/chapters") ||
    pathname.startsWith("/api/assist-runs") || pathname.startsWith("/api/settings/providers")
  );
}

export function proxy(request: NextRequest) {
  if (!isHostedBetaEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (!isBlockedHostedPath(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        ok: false,
        error:
          `The hosted ${APP_NAME} beta is currently account, downloads, policy, and feedback only. Writing libraries stay on each user's own device in this phase.`,
      },
      { status: 403 },
    );
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = "/downloads";
  redirectUrl.search = "";
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: ["/projects/:path*", "/api/projects/:path*", "/api/chapters/:path*", "/api/assist-runs/:path*", "/api/settings/providers/:path*", "/api/settings/providers"],
};
