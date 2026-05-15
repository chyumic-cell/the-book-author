import { describe, expect, it } from "vitest";

import { buildAssistScopedInstruction, createFallbackAssistRevision, extractSourceAnchors } from "@/lib/openai";

function wordCount(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

describe("AI assist fallback revisions", () => {
  it("expands the selected text without leaking demo scaffold prose", () => {
    const selected =
      "Rafi held the torn map against the lantern and realized the missing road had been scratched out by someone afraid of being followed.";

    const expanded = createFallbackAssistRevision("EXPAND", selected, "");

    expect(expanded).toContain("Rafi");
    expect(expanded).toContain("lantern");
    expect(expanded).toContain("road");
    expect(expanded).not.toMatch(/Malket|Prince Sarun|Witness Tithe|silver cup|oath feast/i);
    expect(expanded).not.toMatch(/\b(?:the moment|the pause|the pressure|the choice|the situation)\b/i);
    expect(expanded).not.toMatch(
      /\b(?:selected text|selected passage|selected event|reader|on the page|context|contextuali[sz]|textuali[sz]|source material|source anchor|replacement prose)\b/i,
    );
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

  it("puts the exact highlighted words into the live assist prompt without leaky source jargon", () => {
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

    expect(prompt).toContain("HIGHLIGHTED WORDS TO REWRITE");
    expect(prompt).toContain(selected);
    expect(prompt).toContain("Rewrite these highlighted words only.");
    expect(prompt).toContain("The before/after text is only a border");
    expect(prompt).toContain("Keep these exact concrete details visible");
    expect(prompt).toContain("Rafi");
    expect(prompt).toContain("lantern");
    expect(prompt).toContain("Do not replace concrete details with vague phrases");
    expect(prompt).not.toContain("source material");
    expect(prompt).not.toContain("source anchors");
    expect(prompt).not.toContain("SELECTED TEXT TO REWRITE");
  });

  it("extracts concrete anchors from selected text for source-specific rewrites", () => {
    const anchors = extractSourceAnchors(
      "Rafi held the torn map against the lantern and realized the missing road had been scratched out by someone afraid of being followed.",
    );

    expect(anchors).toContain("Rafi");
    expect(anchors).toContain("lantern");
    expect(anchors).toContain("scratched");
    expect(anchors).not.toContain("someone");
  });
});
