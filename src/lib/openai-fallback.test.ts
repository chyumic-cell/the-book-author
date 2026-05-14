import { describe, expect, it } from "vitest";

import { buildAssistScopedInstruction, createFallbackAssistRevision } from "@/lib/openai";

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

  it("puts the exact selected text into the live assist prompt as the source material", () => {
    const selected =
      "Rafi held the torn map against the lantern and realized the missing road had been scratched out by someone afraid of being followed.";
    const project = {
      styleProfile: {
        proseDensity: 5,
        pacing: 5,
        darkness: 3,
        romanceIntensity: 1,
        humorLevel: 1,
        actionFrequency: 4,
        mysteryDensity: 5,
        dialogueDescriptionRatio: 6,
        literaryCommercialBalance: 7,
      },
    };

    const prompt = buildAssistScopedInstruction(
      project as never,
      "EXPAND",
      "",
      selected,
      "The guard shut the door behind him.",
      "The lantern guttered in the wind.",
    );

    expect(prompt).toContain("SELECTED TEXT TO REWRITE");
    expect(prompt).toContain(selected);
    expect(prompt).toContain("This selected text is the source material. Transform this text only.");
    expect(prompt).toContain("Do not use the text before or after as the material to rewrite");
  });
});
