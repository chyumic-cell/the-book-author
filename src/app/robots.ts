import type { MetadataRoute } from "next";

import { getHostedSiteUrl, isHostedBetaEnabled } from "@/lib/hosted-beta-config";

export default function robots(): MetadataRoute.Robots {
  const url = getHostedSiteUrl();

  return {
    rules: isHostedBetaEnabled()
      ? [
          {
            userAgent: "*",
            allow: ["/", "/downloads", "/sign-in", "/sign-up", "/terms"],
            disallow: ["/account", "/admin", "/feedback", "/projects", "/api/"],
          },
        ]
      : {
          userAgent: "*",
          allow: "/",
        },
    sitemap: `${url}/sitemap.xml`,
  };
}
