import type { WorkingNoteRecord } from "@/types/storyforge";

export const BOOK_RULE_TAG = "book-rule";

export function isBookRuleNote(note: Pick<WorkingNoteRecord, "tags"> | null | undefined) {
  return Array.isArray(note?.tags) && note.tags.some((tag) => String(tag).trim().toLowerCase() === BOOK_RULE_TAG);
}

export function ensureBookRuleTags(tags: string[] | null | undefined) {
  const next = Array.from(
    new Set(
      (tags ?? [])
        .map((tag) => String(tag ?? "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  if (!next.includes(BOOK_RULE_TAG)) {
    next.unshift(BOOK_RULE_TAG);
  }

  return next;
}
