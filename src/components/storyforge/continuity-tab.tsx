"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { APP_NAME } from "@/lib/brand";
import type { ContinuityIssueRecord, ProjectWorkspace } from "@/types/storyforge";

export function ContinuityTab({
  busy,
  project,
  onRunCheck,
}: {
  busy: boolean;
  project: ProjectWorkspace;
  onRunCheck: () => void;
}) {
  const [severityFilter, setSeverityFilter] = useState<ContinuityIssueRecord["severity"] | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("OPEN");

  const issues = useMemo(
    () =>
      project.continuityIssues.filter((issue) => {
        if (severityFilter !== "ALL" && issue.severity !== severityFilter) {
          return false;
        }

        if (statusFilter !== "ALL" && issue.status !== statusFilter) {
          return false;
        }

        return true;
      }),
    [project.continuityIssues, severityFilter, statusFilter],
  );

  return (
    <div className="grid gap-4">
      <Card className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-3xl">Continuity dashboard</h3>
            <p className="text-sm text-[var(--muted)]">
          {APP_NAME} combines rule checks and compact-context analysis to catch contradiction, drift, missing carry-forward, and broken causality.
            </p>
          </div>
          <Button disabled={busy} onClick={onRunCheck}>
            {busy ? "Checking..." : "Run chapter check"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-[var(--muted)]">Severity</span>
            <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value as typeof severityFilter)}>
              <option value="ALL">All severities</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-[var(--muted)]">Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="OPEN">Open</option>
              <option value="ALL">All statuses</option>
              <option value="REVIEWED">Reviewed</option>
              <option value="RESOLVED">Resolved</option>
            </select>
          </label>
          <Chip>{issues.length} issues shown</Chip>
          <Chip>{project.continuityIssues.filter((issue) => issue.status === "OPEN").length} open total</Chip>
        </div>

        <div className="grid gap-3">
          {issues.length === 0 ? (
            <div className="rounded-[24px] border border-[color:var(--line)] bg-[color:var(--panel-soft)]/75 p-4 text-sm text-[var(--muted)]">
              No continuity issues match the current filters.
            </div>
          ) : null}

          {issues.map((issue) => (
            <div key={issue.id} className="rounded-[24px] border border-[color:var(--line)] bg-[color:var(--panel-soft)]/82 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <strong>{issue.title}</strong>
                <div className="flex flex-wrap gap-2">
                  <Chip>{issue.severity}</Chip>
                  <Chip>{issue.checkMode}</Chip>
                  <Chip>{Math.round(issue.confidence * 100)}% confidence</Chip>
                </div>
              </div>
              <p className="mt-2 text-sm text-[var(--muted)]">{issue.description}</p>
              <p className="mt-3 text-sm text-[var(--muted)]">
                <strong className="text-[var(--text)]">Why it was flagged:</strong> {issue.explanation}
              </p>
              {issue.affectedElements.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {issue.affectedElements.map((element) => (
                    <Chip key={element}>{element}</Chip>
                  ))}
                </div>
              ) : null}
              <p className="mt-3 text-sm text-[var(--muted)]">
                <strong className="text-[var(--text)]">Suggested fix:</strong> {issue.suggestedContext || "Review the chapter against canon and recent memory."}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
