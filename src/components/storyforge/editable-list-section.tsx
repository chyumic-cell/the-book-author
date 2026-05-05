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

export type EditableAiAction = "develop" | "expand" | "tighten";

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
  aiEntityType,
  topActions,
  aiBusyKey,
  onAiFieldAction,
  onSave,
  onAdd,
  onDelete,
}: {
  title: string;
  description: string;
  items: Record<string, unknown>[];
  fields: EditableField[];
  aiEntityType?: "chapter" | "structureBeat" | "sceneCard";
  topActions?: React.ReactNode;
  aiBusyKey?: string | null;
  onAiFieldAction?: (options: {
    targetEntityType?: "chapter" | "structureBeat" | "sceneCard";
    itemId: string;
    itemTitle: string;
    fieldKey: string;
    fieldLabel: string;
    action: EditableAiAction;
    currentValue: string;
    draftItem: Record<string, unknown>;
  }) => Promise<void>;
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
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
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

  function materializeDraftItem(itemId: string) {
    const draft = drafts[itemId] ?? {};
    return Object.fromEntries(
      fields.map((field) => {
        const raw = draft[field.key];
        if (field.type === "tags") {
          return [field.key, splitLines(String(raw ?? ""))];
        }
        if (field.type === "number") {
          return [field.key, Number(raw ?? 0)];
        }
        if (field.type === "boolean") {
          return [field.key, Boolean(raw)];
        }
        return [field.key, String(raw ?? "")];
      }),
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
          {topActions}
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
                <button
                  className="grid flex-1 gap-1 text-left"
                  onClick={() => toggleExpanded(itemId)}
                  type="button"
                >
                  <strong className="text-lg text-[var(--text)]">{itemTitle}</strong>
                  <p className="text-xs text-[var(--muted)]">{expanded ? "Expanded editor" : "Collapsed summary"}</p>
                </button>
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
                      ).then(() =>
                        setDraftOverrides((current) => {
                          const next = { ...current };
                          delete next[itemId];
                          return next;
                        }),
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
                    {((field.type === "text" || field.type === "textarea" || !field.type) && onAiFieldAction) ? (
                      <div className="mb-2 flex flex-wrap gap-2">
                        <Button
                          disabled={aiBusyKey === `${itemId}:${field.key}:develop`}
                          onClick={() =>
                            void onAiFieldAction({
                              targetEntityType: aiEntityType,
                              itemId,
                              itemTitle,
                              fieldKey: field.key,
                              fieldLabel: field.label,
                              action: "develop",
                              currentValue: String(draft[field.key] ?? ""),
                              draftItem: materializeDraftItem(itemId),
                            }).then(() =>
                              setDraftOverrides((current) => {
                                const next = { ...current };
                                delete next[itemId];
                                return next;
                              }),
                            )
                          }
                          type="button"
                          variant="ghost"
                        >
                          {aiBusyKey === `${itemId}:${field.key}:develop` ? "AI working..." : "AI develop"}
                        </Button>
                        <Button
                          disabled={aiBusyKey === `${itemId}:${field.key}:expand`}
                          onClick={() =>
                            void onAiFieldAction({
                              targetEntityType: aiEntityType,
                              itemId,
                              itemTitle,
                              fieldKey: field.key,
                              fieldLabel: field.label,
                              action: "expand",
                              currentValue: String(draft[field.key] ?? ""),
                              draftItem: materializeDraftItem(itemId),
                            }).then(() =>
                              setDraftOverrides((current) => {
                                const next = { ...current };
                                delete next[itemId];
                                return next;
                              }),
                            )
                          }
                          type="button"
                          variant="ghost"
                        >
                          {aiBusyKey === `${itemId}:${field.key}:expand` ? "AI working..." : "Expand"}
                        </Button>
                        <Button
                          disabled={aiBusyKey === `${itemId}:${field.key}:tighten`}
                          onClick={() =>
                            void onAiFieldAction({
                              targetEntityType: aiEntityType,
                              itemId,
                              itemTitle,
                              fieldKey: field.key,
                              fieldLabel: field.label,
                              action: "tighten",
                              currentValue: String(draft[field.key] ?? ""),
                              draftItem: materializeDraftItem(itemId),
                            }).then(() =>
                              setDraftOverrides((current) => {
                                const next = { ...current };
                                delete next[itemId];
                                return next;
                              }),
                            )
                          }
                          type="button"
                          variant="ghost"
                        >
                          {aiBusyKey === `${itemId}:${field.key}:tighten` ? "AI working..." : "Tighten"}
                        </Button>
                      </div>
                    ) : null}
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
