import { NextResponse } from "next/server";

import { requireBetaSession } from "@/lib/beta-auth";
import { APP_INSTALLER_FILENAME } from "@/lib/brand";
import { getDesktopInstallerDownloadUrl } from "@/lib/hosted-beta-config";

export async function GET() {
  await requireBetaSession();

  const installerUrl = getDesktopInstallerDownloadUrl();
  if (!installerUrl) {
    return new Response(
      `The hosted desktop download is not configured yet for ${APP_INSTALLER_FILENAME}.`,
      {
        status: 404,
        headers: {
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
          "Content-Type": "text/plain; charset=utf-8",
        },
      },
    );
  }

  return NextResponse.redirect(installerUrl, {
    status: 307,
    headers: {
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
    },
  });
}
