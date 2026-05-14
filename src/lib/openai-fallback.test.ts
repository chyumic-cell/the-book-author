import { describe, expect, it } from "vitest";

import { createFallbackAssistRevision } from "@/lib/openai";

function wordCount(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

describe("AI assist fallback revisions", () => {
  it("expands the selected text without leaking demo scaffold prose", () => {
    const selected =
      "Rafi held the torn map against the lantern and realized the missing road had been scratched out by someone afraid of being followed.";

    const expanded = createFallbackAssistRevision("EXPAND", selected, "");

    expect(expanded).toContain("Rafi");
    expect(expanded).not.toMatch(/Malket|Prince Sarun|Witness Tithe|silver cup|oath feast/i);
    expect(wordCount(expanded)).toBeGreaterThanOrEqual(Math.floor(wordCount(selected) * 2.7));
  });

  it("tightens the selected text toward one third without inventing unrelated story details", () => {
    const selected =
      "Rafi held the torn map against the lantern and realized the missing road had been scratched out by someone afraid of being followed.";

    const tightened = createFallbackAssistRevision("TIGHTEN", selected, "");

    expect(tightened).toContain("Rafi");
    expect(tightened).not.toMatch(/Malket|Prince Sarun|Witness Tithe|silver cup|oath feast/i);
    expect(wordCount(tightened)).toBeLessThanOrEqual(Math.ceil(wordCount(selected) / 3) + 2);
  });
});
