"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { requestJson } from "@/components/storyforge/workspace-helpers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { APP_NAME } from "@/lib/brand";

type ProjectSummary = {
  id: string;
  title: string;
  slug: string;
  premise: string;
  oneLineHook: string | null;
  seriesOrder: number | null;
  series: {
    id: string;
    name: string;
    slug: string;
  } | null;
  updatedAt: string | Date;
  chapters: { id: string }[];
  continuityIssues: { id: string }[];
};

export function ProjectLibraryGrid({
  initialProjects,
}: {
  initialProjects: ProjectSummary[];
}) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);

  const sortedProjects = useMemo(
    () =>
      [...projects].sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      ),
    [projects],
  );

  async function handleDeleteProject(projectId: string, title: string) {
    const confirmed = window.confirm(`Delete "${title}"? This removes the project, chapters, notes, and exports stored in ${APP_NAME}.`);
    if (!confirmed) {
      return;
    }

    setDeletingProjectId(projectId);
    try {
      await requestJson<{ deletedProjectId: string }>(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
      setProjects((current) => current.filter((project) => project.id !== projectId));
      toast.success(`Deleted "${title}".`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete project.");
    } finally {
      setDeletingProjectId(null);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {sortedProjects.map((project) => (
        <Card key={project.id} className="grid h-full gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-2xl">{project.title}</h3>
              <p className="mt-2 text-sm text-[var(--muted)]">{project.oneLineHook || project.premise}</p>
            </div>
            <Chip>{project.chapters.length} chapters</Chip>
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
            <Chip className="text-[var(--muted)]">{project.continuityIssues.length} open continuity checks</Chip>
            <Chip className="text-[var(--muted)]">Updated {new Date(project.updatedAt).toLocaleDateString()}</Chip>
            {project.series ? (
              <Chip className="text-[var(--muted)]">
                {`${project.series.name}${project.seriesOrder ? ` - Book ${project.seriesOrder}` : ""}`}
              </Chip>
            ) : null}
          </div>

          <div className="mt-auto flex flex-wrap gap-2">
            <Link
              className="inline-flex items-center rounded-md border border-[color:var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:border-[color:rgba(var(--accent-rgb),0.35)] hover:bg-[color:var(--panel-soft)]"
              href={`/projects/${project.id}`}
            >
              Open
            </Link>
            <Button
              disabled={deletingProjectId === project.id}
              onClick={() => void handleDeleteProject(project.id, project.title)}
              variant="danger"
            >
              {deletingProjectId === project.id ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
