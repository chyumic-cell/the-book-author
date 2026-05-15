import { describe, expect, it } from "vitest";

import {
  assessManuscriptEnding,
  cleanAiFieldText,
  cleanGeneratedText,
  cleanInlineSuggestionText,
  looksLikeAiLeakage,
  sanitizeManuscriptText,
} from "@/lib/ai-output";

describe("ai output cleanup", () => {
  it("strips editorial notes and chapter-end markers from manuscript text", () => {
    const raw = `
Chapter 4: The Night Escape

Rene slipped beneath the cart and held his breath as the checkpoint lantern swung overhead.

**Structural improvements:**

1. **Clear POV anchoring**: The scene stays close to Rene.
2. **Concrete goal**: Escape the checkpoint.

The chapter now contains clearer stakes and a stronger ending.

**END OF CHAPTER**
`;

    const cleaned = cleanGeneratedText(raw);

    expect(cleaned).toContain("Rene slipped beneath the cart");
    expect(cleaned).not.toContain("Structural improvements");
    expect(cleaned).not.toContain("The chapter now contains");
    expect(cleaned).not.toContain("END OF CHAPTER");
  });

  it("drops repeated opening scaffolds when they match an earlier chapter", () => {
    const repeatedOpening =
      "The Austrian camp spread across the rolling hills like a gray blanket, tents arranged in precise military order beneath a sky bruised with early morning clouds.";
    const current = `
${repeatedOpening}

Rene entered the command tent and found the oath already waiting for him on the table.
`;

    const result = sanitizeManuscriptText(current, {
      chapterTitle: "The Oath of Steel",
      chapterNumber: 9,
      previousChapterDrafts: [repeatedOpening],
    });

    expect(result.text).toContain("Rene entered the command tent");
    expect(result.text).not.toContain("gray blanket");
    expect(result.issues.some((issue) => issue.includes("opening"))).toBe(true);
  });

  it("converts play-style dialogue and closes dangling dialogue quotes", () => {
    const raw = `
Rene: We march before dawn

He looked at the road and said, "If they find us, we are finished.
`;

    const result = sanitizeManuscriptText(raw);

    expect(result.text).toContain('Rene said, "We march before dawn."');
    expect(result.text).toContain('He looked at the road and said, "If they find us, we are finished."');
    expect(result.issues.some((issue) => issue.includes("quotation"))).toBe(true);
  });

  it("strips markdown bold without breaking internal-thought italics", () => {
    const raw = `
**Tension:** The door would not open.

*Not yet,* Rene thought. "Hold the line."
`;

    const result = sanitizeManuscriptText(raw);

    expect(result.text).toContain("Tension: The door would not open.");
    expect(result.text).toContain('*Not yet,* Rene thought. "Hold the line."');
    expect(result.text).not.toContain("**");
  });

  it("keeps inline rewrite suggestions instead of stripping them like whole chapters", () => {
    const raw = `Here is the expanded passage:\n\nDieb watched the fire. Smoke pressed into his eyes, and every pop of sap in the wood made the darkness beyond the circle feel closer.`;

    const cleaned = cleanInlineSuggestionText(raw);

    expect(cleaned).toContain("Dieb watched the fire.");
    expect(cleaned).toContain("Smoke pressed into his eyes");
    expect(cleaned).not.toContain("Here is the expanded passage");
  });

  it("removes process-language leaks from inline rewrite suggestions", () => {
    const raw = [
      "Rafi held the torn map closer to the lantern and watched the missing road darken under his thumb.",
      "This contextualizes the source material and textualizes the pressure from the selected passage.",
      "The replacement prose should preserve the context and source anchors.",
    ].join(" ");

    const cleaned = cleanInlineSuggestionText(raw);

    expect(cleaned).toContain("Rafi held the torn map");
    expect(cleaned).not.toMatch(/\b(?:context|contextuali[sz]|textuali[sz]|source material|source anchor|selected passage|replacement prose)\b/i);
  });

  it("does not fall back to a wholly leaked inline answer", () => {
    const cleaned = cleanInlineSuggestionText(
      "Contextualise the selected passage by textualising the source material in replacement prose.",
    );

    expect(cleaned).toBe("");
  });

  it("removes meta ending prose and trims broken final sentence fragments", () => {
    const raw = `
Lucius watched the doorway until the last worshiper vanished into the alley. He told himself the sound in his chest was only fatigue.

The chapter ends with Lucius staring at the Temple and realizing the city is already lost and
`;

    const result = sanitizeManuscriptText(raw);

    expect(result.text).toContain("He told himself the sound in his chest was only fatigue.");
    expect(result.text).not.toContain("The chapter ends with");
    expect(result.text.trim().endsWith("fatigue.")).toBe(true);
  });

  it("flags a truncated chapter ending for repair", () => {
    const assessment = assessManuscriptEnding(`Lucius reached for the torch, and`);

    expect(assessment.needsRepair).toBe(true);
    expect(assessment.isTruncated).toBe(true);
  });

  it("rejects leaked AI reasoning and raw app field paths from app fields", () => {
    expect(looksLikeAiLeakage("The user wants me to fill the character dossier.")).toBe(true);
    expect(looksLikeAiLeakage("dossier.relationshipDynamics.hiddenLoyalties:: Loyal before the court.")).toBe(true);
    expect(looksLikeAiLeakage("guarded | precise | grief-driven")).toBe(true);
    expect(cleanAiFieldText("quickProfile.age :: David Weiss should remain specific.", "Adult")).toBe("Adult");
    expect(cleanAiFieldText("Educated court register with faint regional roughness.", "")).toBe(
      "Educated court register with faint regional roughness.",
    );
  });
});
