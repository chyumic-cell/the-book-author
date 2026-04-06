import type { MetadataRoute } from "next";

import { getHostedSiteUrl, isHostedBetaEnabled } from "@/lib/hosted-beta-config";

export default function sitemap(): MetadataRoute.Sitemap {
  const url = getHostedSiteUrl();
  const updated = new Date();

  const publicPages = [
    "",
    "/downloads",
    "/sign-in",
    "/sign-up",
    "/terms",
  ];

  return publicPages
    .filter((entry) => (isHostedBetaEnabled() ? true : entry === ""))
    .map((entry) => ({
      url: `${url}${entry}`,
      lastModified: updated,
      changeFrequency: entry === "" ? "weekly" : "monthly",
      priority: entry === "" ? 1 : 0.6,
    }));
}
