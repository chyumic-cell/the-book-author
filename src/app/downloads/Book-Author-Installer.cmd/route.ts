import { NextResponse } from "next/server";

import { APP_INSTALLER_FILENAME } from "@/lib/brand";
import { getDesktopInstallerDownloadUrl } from "@/lib/hosted-beta-config";

export async function GET(request: Request) {
  const installerUrl = getDesktopInstallerDownloadUrl();
  const requestUrl = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? requestUrl.host;
  const protocol = request.headers.get("x-forwarded-proto") ?? requestUrl.protocol.replace(":", "") ?? "https";
  const fallbackUrl = new URL(`/downloads/pc/${APP_INSTALLER_FILENAME}`, `${protocol}://${host}`);

  return NextResponse.redirect(installerUrl || fallbackUrl, {
    status: 307,
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}
