import type { MetadataRoute } from "next";

import { APP_RUNTIME_NAME, APP_SHORT_NAME } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_RUNTIME_NAME,
    short_name: APP_SHORT_NAME,
    description:
      "AI-assisted fiction studio for planning, outlining, and drafting long-form books. Copyright (c) 2026 Michael William Polevoy.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f3ede3",
    theme_color: "#355d9a",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
