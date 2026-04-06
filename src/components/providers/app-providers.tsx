"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

import { FeedbackButton } from "@/components/beta/feedback-button";
import { PwaInstallPrompt } from "@/components/providers/pwa-install-prompt";
import { PwaRegistration } from "@/components/providers/pwa-registration";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <PwaRegistration />
      <PwaInstallPrompt />
      <FeedbackButton />
      {children}
      <Toaster richColors position="top-right" />
    </ThemeProvider>
  );
}
