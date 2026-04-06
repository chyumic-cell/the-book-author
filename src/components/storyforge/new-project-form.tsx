"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { APP_NAME } from "@/lib/brand";

export function NewProjectForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    premise: "",
    oneLineHook: "",
    seriesName: "",
    seriesOrder: "",
    genre: "Sci-fi mystery",
    tone: "Tense, luminous, emotionally intelligent",
    audience: "Adult crossover",
    pointOfView: "Limited third person",
    tense: "Past tense",
    storyBrief: "",
    plotDirection: "",
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          seriesOrder: form.seriesOrder.trim() ? Number(form.seriesOrder) : null,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Could not create project.");
      }

      toast.success("Project created.");
      router.push(`/projects/${result.data.projectId}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create project.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-6" onSubmit={handleSubmit}>
      <div className="grid gap-6 md:grid-cols-2">
        <Field label="Project title">
          <input
            required
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            placeholder="The Glass Meridian"
            type="text"
          />
        </Field>
        <Field label="One-line hook">
          <input
            value={form.oneLineHook}
            onChange={(event) => setForm((current) => ({ ...current, oneLineHook: event.target.value }))}
            placeholder="A mapmaker races a self-censoring oracle."
            type="text"
          />
        </Field>
        <Field label="Series name (optional)" hint="Use the same series name across books to share recurring canon and long arcs.">
          <input
            value={form.seriesName}
            onChange={(event) => setForm((current) => ({ ...current, seriesName: event.target.value }))}
            placeholder="The Lantern Archive"
            type="text"
          />
        </Field>
        <Field label="Book number in series" hint="Optional ordering for multi-book series tracking.">
          <input
            value={form.seriesOrder}
            onChange={(event) => setForm((current) => ({ ...current, seriesOrder: event.target.value }))}
            min={1}
            placeholder="1"
            type="number"
          />
        </Field>
        <Field className="md:col-span-2" label="Premise">
          <textarea
            required
            rows={4}
            value={form.premise}
            onChange={(event) => setForm((current) => ({ ...current, premise: event.target.value }))}
            placeholder="What is the story fundamentally about?"
          />
        </Field>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Genre">
          <input value={form.genre} onChange={(event) => setForm((current) => ({ ...current, genre: event.target.value }))} type="text" />
        </Field>
        <Field label="Tone">
          <input value={form.tone} onChange={(event) => setForm((current) => ({ ...current, tone: event.target.value }))} type="text" />
        </Field>
        <Field label="Audience">
          <input value={form.audience} onChange={(event) => setForm((current) => ({ ...current, audience: event.target.value }))} type="text" />
        </Field>
        <Field label="POV / tense">
          <div className="grid grid-cols-2 gap-3">
            <input value={form.pointOfView} onChange={(event) => setForm((current) => ({ ...current, pointOfView: event.target.value }))} type="text" />
            <input value={form.tense} onChange={(event) => setForm((current) => ({ ...current, tense: event.target.value }))} type="text" />
          </div>
        </Field>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Field label="Story brief" hint="This becomes part of the long-lived context package.">
          <textarea
            required
            rows={6}
            value={form.storyBrief}
            onChange={(event) => setForm((current) => ({ ...current, storyBrief: event.target.value }))}
            placeholder="Who is the protagonist, what is changing, and what is the fundamental conflict?"
          />
        </Field>
        <Field label="Desired plot direction" hint="How you want the story to develop, escalate, or end.">
          <textarea
            required
            rows={6}
            value={form.plotDirection}
            onChange={(event) => setForm((current) => ({ ...current, plotDirection: event.target.value }))}
            placeholder="Escalate the mystery, deepen the romance, land on a costly reveal..."
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-[var(--muted)]">
          {APP_NAME} will create the project, seed a starter chapter, and let you connect OpenAI, OpenRouter, or another compatible provider from Settings whenever you are ready.
        </p>
        <Button disabled={loading} type="submit">
          {loading ? "Creating..." : "Create Project"}
        </Button>
      </div>
    </form>
  );
}
