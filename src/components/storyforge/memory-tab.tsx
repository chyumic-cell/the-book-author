"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import type { ProjectWorkspace } from "@/types/storyforge";

export function MemoryTab({
  project,
  onPromoteMemory,
}: {
  project: ProjectWorkspace;
  onPromoteMemory: (memoryItemId: string) => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="grid gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl">Long-term memory</h3>
          <Chip>{project.longTermMemoryItems.length} items</Chip>
        </div>
        <div className="grid gap-3">
          {project.longTermMemoryItems.map((item) => (
            <div key={item.id} className="rounded-[24px] border border-white/8 bg-black/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <strong>{item.title}</strong>
                <Chip>{item.category}</Chip>
              </div>
              <p className="mt-2 text-sm text-[var(--muted)]">{item.content}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {item.tags.map((tag) => (
                  <Chip key={tag}>{tag}</Chip>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="grid gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl">Short-term memory</h3>
          <Chip>{project.shortTermMemoryItems.length} items</Chip>
        </div>
        <div className="grid gap-3">
          {project.shortTermMemoryItems.map((item) => (
            <div key={item.id} className="rounded-[24px] border border-white/8 bg-black/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <strong>{item.title}</strong>
                <Chip>{item.category}</Chip>
              </div>
              <p className="mt-2 text-sm text-[var(--muted)]">{item.content}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => onPromoteMemory(item.id)} variant="secondary">
                  Promote to long-term
                </Button>
                <Chip>Durability {item.durabilityScore.toFixed(2)}</Chip>
                <Chip>Relevance {item.relevanceScore.toFixed(2)}</Chip>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
