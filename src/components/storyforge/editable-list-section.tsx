"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/utils";

export type EditableField = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "number" | "tags" | "boolean";
};

function splitLines(value: string) {
  return value
    .split(/\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function sectionTestId(title: string) {
  return `editable-section-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

export function EditableListSection({
  title,
  description,
  items,
  fields,
  onSave,
  onAdd,
  onDelete,
}: {
  title: string;
  description: string;
  items: Record<string, unknown>[];
  fields: EditableField[];
  onSave: (itemId: string, payload: Record<string, unknown>) => Promise<void>;
  onAdd: () => Promise<void>;
  onDelete: (itemId: string) => Promise<void>;
}) {
  const baseDrafts = useMemo(
    () =>
      Object.fromEntries(
        items.map((item) => [
          String(item.id),
          Object.fromEntries(
            fields.map((field) => {
              const raw = item[field.key];
              if (field.type === "tags") {
                return [field.key, Array.isArray(raw) ? raw.join("\n") : ""];
              }

              return [field.key, raw ?? (field.type === "boolean" ? false : "")];
            }),
          ),
        ]),
      ),
    [fields, items],
  );
  const [draftOverrides, setDraftOverrides] = useState<Record<string, Record<string, unknown>>>({});
  const [expandedIds, setExpandedIds] = useState<string[]>(() => items.map((item) => String(item.id)));
  const drafts = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(baseDrafts).map(([itemId, draft]) => [
          itemId,
          {
            ...draft,
            ...(draftOverrides[itemId] ?? {}),
          },
        ]),
      ),
    [baseDrafts, draftOverrides],
  );

  const itemCountLabel = useMemo(() => `${items.length} ${items.length === 1 ? "entry" : "entries"}`, [items.length]);

  function toggleExpanded(itemId: string) {
    setExpandedIds((current) =>
      current.includes(itemId) ? current.filter((entry) => entry !== itemId) : [...current, itemId],
    );
  }

  return (
    <Card className="grid gap-4" data-testid={sectionTestId(title)}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl">{title}</h3>
          <p className="text-sm text-[var(--muted)]">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip>{itemCountLabel}</Chip>
          <Button onClick={() => setExpandedIds(items.map((item) => String(item.id)))} variant="ghost">
            Expand all
          </Button>
          <Button onClick={() => setExpandedIds([])} variant="ghost">
            Collapse all
          </Button>
          <Button onClick={onAdd} variant="secondary">
            Add
          </Button>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {items.map((item) => {
          const itemId = String(item.id);
          const draft = drafts[itemId] ?? {};
          const itemTitle =
            String(item.name ?? item.title ?? item.label ?? itemId)
              .trim()
              .slice(0, 80) || "Untitled";
          const expanded = expandedIds.includes(itemId);

          return (
            <div key={itemId} className="rounded-[24px] border border-[color:var(--line)] bg-[color:var(--panel-soft)]/78 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="grid gap-1">
                  <strong className="text-lg text-[var(--text)]">{itemTitle}</strong>
                  <p className="text-xs text-[var(--muted)]">{expanded ? "Expanded editor" : "Collapsed summary"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => toggleExpanded(itemId)} variant="ghost">
                    {expanded ? "Collapse" : "Expand"}
                  </Button>
                  <Button
                    onClick={() =>
                      onSave(
                        itemId,
                        Object.fromEntries(
                          fields.map((field) => [
                            field.key,
                            field.type === "tags"
                              ? splitLines(String(draft[field.key] ?? ""))
                              : draft[field.key],
                          ]),
                        ),
                      )
                    }
                    variant="secondary"
                  >
                    Save
                  </Button>
                  <Button onClick={() => onDelete(itemId)} variant="ghost">
                    Delete
                  </Button>
                </div>
              </div>

              <div className={cn("grid gap-3 overflow-hidden transition-[max-height,opacity] duration-200", expanded ? "mt-4 opacity-100" : "mt-0 max-h-0 opacity-0")}>
                {fields.map((field) => (
                  <Field key={field.key} label={field.label}>
                    {field.type === "textarea" || field.type === "tags" ? (
                      <textarea
                        rows={field.type === "tags" ? 3 : 5}
                        value={String(draft[field.key] ?? "")}
                        onChange={(event) =>
                          setDraftOverrides((current) => ({
                            ...current,
                            [itemId]: { ...current[itemId], [field.key]: event.target.value },
                          }))
                        }
                      />
                    ) : field.type === "number" ? (
                      <input
                        type="number"
                        value={Number(draft[field.key] ?? 0)}
                        onChange={(event) =>
                          setDraftOverrides((current) => ({
                            ...current,
                            [itemId]: { ...current[itemId], [field.key]: Number(event.target.value) },
                          }))
                        }
                      />
                    ) : field.type === "boolean" ? (
                      <label className="inline-flex items-center gap-3 rounded-2xl border border-[color:var(--line)] bg-white/70 px-4 py-3">
                        <input
                        checked={Boolean(draft[field.key])}
                        type="checkbox"
                        onChange={(event) =>
                          setDraftOverrides((current) => ({
                            ...current,
                            [itemId]: { ...current[itemId], [field.key]: event.target.checked },
                          }))
                        }
                        />
                        <span className="text-sm text-[var(--muted)]">Enabled</span>
                      </label>
                    ) : (
                      <input
                        type="text"
                        value={String(draft[field.key] ?? "")}
                        onChange={(event) =>
                          setDraftOverrides((current) => ({
                            ...current,
                            [itemId]: { ...current[itemId], [field.key]: event.target.value },
                          }))
                        }
                      />
                    )}
                  </Field>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
