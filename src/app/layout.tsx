import type { Metadata, Viewport } from "next";
import { Orbitron } from "next/font/google";

import { AppProviders } from "@/components/providers/app-providers";
import { APP_RUNTIME_NAME } from "@/lib/brand";

import "./globals.css";

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-tech-brand",
});

export const metadata: Metadata = {
  title: APP_RUNTIME_NAME,
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
    title: APP_RUNTIME_NAME,
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
    <html lang="en" suppressHydrationWarning className={`${orbitron.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[var(--bg)] text-[var(--text)]">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
