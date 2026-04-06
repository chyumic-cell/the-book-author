import type { Metadata, Viewport } from "next";

import { AppProviders } from "@/components/providers/app-providers";
import { APP_NAME } from "@/lib/brand";

import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Layered-memory novel studio for AI-assisted fiction writing.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_NAME,
  },
};

export const viewport: Viewport = {
  themeColor: "#355d9a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[var(--bg)] text-[var(--text)]">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
