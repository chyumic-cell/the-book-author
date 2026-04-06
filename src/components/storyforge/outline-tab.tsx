"use client";

import TextareaAutosize from "react-textarea-autosize";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";

export function OutlineTab({
  busy,
  outline,
  storyPlan,
  onGenerateOutline,
  onGeneratePlan,
  onOutlineChange,
}: {
  busy: string | null;
  outline: string;
  storyPlan: string;
  onGenerateOutline: () => void;
  onGeneratePlan: () => void;
  onOutlineChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-4">
      <Card className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-3xl">Story plan & chapter outline</h3>
            <p className="text-sm text-[var(--muted)]">
              Generate the high-level shape of the book or tune the current chapter plan before drafting.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button disabled={busy === "story-plan"} onClick={onGeneratePlan} variant="secondary">
              {busy === "story-plan" ? "Planning..." : "Generate story plan"}
            </Button>
            <Button disabled={busy === "outline"} onClick={onGenerateOutline}>
              {busy === "outline" ? "Outlining..." : "Generate chapter outline"}
            </Button>
          </div>
        </div>
        {storyPlan ? (
          <div className="rounded-[24px] border border-white/8 bg-black/10 p-4">
            <pre className="whitespace-pre-wrap text-sm text-[var(--muted)]">{storyPlan}</pre>
          </div>
        ) : null}
        <Field label="Current chapter outline">
          <TextareaAutosize minRows={12} value={outline} onChange={(event) => onOutlineChange(event.target.value)} />
        </Field>
      </Card>
    </div>
  );
}
