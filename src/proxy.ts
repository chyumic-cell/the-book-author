import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { APP_NAME } from "@/lib/brand";

const HOSTED_SESSION_COOKIE_NAME = "the_book_author_beta_session";

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

function hasHostedSessionCookie(request: NextRequest) {
  return Boolean(request.cookies.get(HOSTED_SESSION_COOKIE_NAME)?.value?.trim());
}

function applyHostedNoStoreHeaders(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export function proxy(request: NextRequest) {
  if (!isHostedBetaEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (!isBlockedHostedPath(pathname)) {
    return applyHostedNoStoreHeaders(NextResponse.next());
  }

  if (hasHostedSessionCookie(request)) {
    return applyHostedNoStoreHeaders(NextResponse.next());
  }

  if (pathname.startsWith("/api/")) {
    return applyHostedNoStoreHeaders(NextResponse.json(
      {
        ok: false,
        error: `Sign in to ${APP_NAME} before using the hosted writing workspace.`,
      },
      { status: 401 },
    ));
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = "/sign-in";
  redirectUrl.searchParams.set("next", pathname);
  return applyHostedNoStoreHeaders(NextResponse.redirect(redirectUrl));
}

export const config = {
  matcher: [
    "/",
    "/account",
    "/admin/:path*",
    "/downloads",
    "/feedback",
    "/projects/:path*",
    "/sign-in",
    "/sign-up",
    "/terms",
    "/api/projects/:path*",
    "/api/chapters/:path*",
    "/api/assist-runs/:path*",
    "/api/settings/providers/:path*",
    "/api/settings/providers",
  ],
};
