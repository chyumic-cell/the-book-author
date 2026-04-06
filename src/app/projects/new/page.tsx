import { redirect } from "next/navigation";

import { AppLegalNotice } from "@/components/storyforge/app-legal-notice";
import { NewProjectForm } from "@/components/storyforge/new-project-form";
import { Card } from "@/components/ui/card";
import { APP_NAME } from "@/lib/brand";
import { isHostedBetaEnabled } from "@/lib/hosted-beta-config";

export const dynamic = "force-dynamic";

export default function NewProjectPage() {
  if (isHostedBetaEnabled()) {
    redirect("/downloads");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <div className="grid gap-3">
        <h1 className="text-5xl leading-none">Start a new {APP_NAME} project</h1>
        <p className="max-w-3xl text-base text-[var(--muted)]">
          Set the durable story intent once, then let the memory engine decide what stays in long-term canon, what rolls forward briefly, and what should be discarded.
        </p>
      </div>
      <Card>
        <NewProjectForm />
      </Card>
      <AppLegalNotice />
    </main>
  );
}
