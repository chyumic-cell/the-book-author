"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { APP_NAME } from "@/lib/brand";

import type { SetupDraft } from "@/components/storyforge/workspace-helpers";
import type { SeriesBookRecord } from "@/types/storyforge";

export function BookSetupTab({
  availableSeriesNames,
  busy,
  draft,
  onChange,
  onSave,
  seriesBooks,
}: {
  availableSeriesNames: string[];
  busy: boolean;
  draft: SetupDraft;
  onChange: (patch: Partial<SetupDraft>) => void;
  onSave: () => void;
  seriesBooks: SeriesBookRecord[];
}) {
  return (
    <div className="grid gap-4">
      <Card className="grid gap-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-3xl">Book setup</h3>
            <p className="text-sm text-[var(--muted)]">
            Human steering stays durable and central. {APP_NAME} uses this layer every time it builds a compact prompt package.
            </p>
          </div>
          <Button disabled={busy} onClick={onSave}>
            {busy ? "Saving..." : "Save setup"}
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Project title">
            <input value={draft.title} onChange={(event) => onChange({ title: event.target.value })} type="text" />
          </Field>
          <Field label="Author name">
            <input value={draft.authorName} onChange={(event) => onChange({ authorName: event.target.value })} type="text" />
          </Field>
          <Field label="Series name (optional)" hint="Use the same name across books to share recurring canon, places, memory, and long arcs.">
            <>
              <input
                list="storyforge-series-options"
                value={draft.seriesName}
                onChange={(event) => onChange({ seriesName: event.target.value })}
                placeholder="The Lantern Archive"
                type="text"
              />
              <datalist id="storyforge-series-options">
                {availableSeriesNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </>
          </Field>
          <Field label="Book number in series" hint="Optional ordering used for multi-book continuity.">
            <input
              value={draft.seriesOrder ?? ""}
              onChange={(event) =>
                onChange({
                  seriesOrder: event.target.value.trim() ? Number(event.target.value) : null,
                })
              }
              min={1}
              type="number"
            />
          </Field>
          <Field label="One-line hook">
            <input value={draft.oneLineHook} onChange={(event) => onChange({ oneLineHook: event.target.value })} type="text" />
          </Field>
          <Field className="md:col-span-2" label="Premise">
            <textarea rows={4} value={draft.premise} onChange={(event) => onChange({ premise: event.target.value })} />
          </Field>
          <Field label="Genre">
            <input value={draft.genre} onChange={(event) => onChange({ genre: event.target.value })} type="text" />
          </Field>
          <Field label="Tone">
            <input value={draft.tone} onChange={(event) => onChange({ tone: event.target.value })} type="text" />
          </Field>
          <Field label="Audience">
            <input value={draft.audience} onChange={(event) => onChange({ audience: event.target.value })} type="text" />
          </Field>
          <Field label="POV">
            <input value={draft.pointOfView} onChange={(event) => onChange({ pointOfView: event.target.value })} type="text" />
          </Field>
          <Field label="Tense">
            <input value={draft.tense} onChange={(event) => onChange({ tense: event.target.value })} type="text" />
          </Field>
          <Field label="Prose style">
            <input value={draft.proseStyle} onChange={(event) => onChange({ proseStyle: event.target.value })} type="text" />
          </Field>
          <Field label="Themes (one per line)">
            <textarea rows={4} value={draft.themes} onChange={(event) => onChange({ themes: event.target.value })} />
          </Field>
          <Field label="Comparable titles">
            <textarea rows={4} value={draft.comparableTitles} onChange={(event) => onChange({ comparableTitles: event.target.value })} />
          </Field>
          <Field className="md:col-span-2" label="Story brief">
            <textarea rows={5} value={draft.storyBrief} onChange={(event) => onChange({ storyBrief: event.target.value })} />
          </Field>
          <Field className="md:col-span-2" label="Desired plot direction">
            <textarea rows={5} value={draft.plotDirection} onChange={(event) => onChange({ plotDirection: event.target.value })} />
          </Field>
          <Field className="md:col-span-2" label="Pacing notes">
            <textarea rows={4} value={draft.pacingNotes} onChange={(event) => onChange({ pacingNotes: event.target.value })} />
          </Field>
        </div>

        {draft.seriesName.trim() ? (
          <div className="grid gap-3 rounded-[24px] border border-[color:var(--line)] bg-[color:var(--panel-soft)]/72 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
              <Chip>Series</Chip>
              <strong className="text-sm text-[var(--text)]">{draft.seriesName}</strong>
              </div>
              <Button
                onClick={() => onChange({ seriesName: "", seriesOrder: null })}
                type="button"
                variant="secondary"
              >
                Remove from series
              </Button>
            </div>
            <p className="text-sm text-[var(--muted)]">
              Books in this series share recurring canon in AI context, including characters, places, long-term memory, and cross-book arcs.
            </p>
            {seriesBooks.length ? (
              <div className="grid gap-2 md:grid-cols-2">
                {seriesBooks.map((book) => (
                  <div key={book.projectId} className="rounded-[18px] border border-[color:var(--line)] bg-white/82 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--text)]">
                        {book.seriesOrder ? `Book ${book.seriesOrder}: ` : ""}
                        {book.title}
                      </span>
                      <Chip>{book.chapterCount} chapters</Chip>
                    </div>
                    <p className="mt-1 text-sm text-[var(--muted)]">{book.oneLineHook || book.premise}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">No other books are linked yet. Assign another project to this series to share canon across books.</p>
            )}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
