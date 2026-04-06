import { notFound, redirect } from "next/navigation";

import { ProjectWorkspace } from "@/components/storyforge/project-workspace";
import { isHostedBetaEnabled } from "@/lib/hosted-beta-config";
import { getAiModeLabel } from "@/lib/openai";
import { getProjectWorkspace, listProjects } from "@/lib/project-data";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  if (isHostedBetaEnabled()) {
    redirect("/downloads");
  }

  const { projectId } = await params;
  const [project, projects] = await Promise.all([
    getProjectWorkspace(projectId),
    listProjects(),
  ]);

  if (!project) {
    notFound();
  }

  return (
    <ProjectWorkspace
      aiMode={await getAiModeLabel()}
      initialProject={project}
      projects={projects}
    />
  );
}
