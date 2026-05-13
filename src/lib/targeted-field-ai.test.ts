import { describe, expect, it } from "vitest";

import { createEmptyCharacterDossier, createEmptyCharacterState } from "@/lib/character-dossier";
import { __targetedFieldAiTestUtils } from "@/lib/targeted-field-ai";
import type { CharacterRecord, ProjectWorkspace } from "@/types/storyforge";

function makeCharacter(): CharacterRecord {
  return {
    id: "char-david",
    name: "David Weiss",
    role: "",
    archetype: "",
    summary: "",
    goal: "",
    fear: "",
    secret: "",
    wound: "",
    quirks: [],
    notes: "",
    tags: [],
    povEligible: true,
    quickProfile: {
      age: "",
      profession: "",
      placeOfLiving: "",
      accent: "",
      speechPattern: "",
    },
    dossier: createEmptyCharacterDossier("David Weiss"),
    currentState: createEmptyCharacterState(),
    customFields: [],
    pinnedFields: [],
  };
}

function makeProject(character: CharacterRecord): ProjectWorkspace {
  return {
    premise: "A grieving court witness uncovers a bargain that lets powerful families erase public memory.",
    oneLineHook: "A man who remembers too much becomes the only threat to a lawful crime.",
    bookSettings: {
      storyBrief: "A political fantasy about memory, grief, and legal power.",
      plotDirection: "Force the witness to choose between safety and exposing the bargain.",
    },
    characters: [character],
  } as ProjectWorkspace;
}

describe("targeted character dossier AI guards", () => {
  it("uses field-specific fallback values instead of repeating the same trait trio everywhere", () => {
    const character = makeCharacter();
    const project = makeProject(character);
    const paths = [
      "quickProfile.age",
      "quickProfile.profession",
      "dossier.personalityBehavior.coreTraits",
      "dossier.personalityBehavior.virtues",
      "dossier.relationshipDynamics.enemies",
      "dossier.relationshipDynamics.family",
    ];

    const raw = __targetedFieldAiTestUtils.fallbackCharacterFieldLines(character, project, paths);
    expect(raw).toContain("quickProfile.age ::");
    const parsed = __targetedFieldAiTestUtils.parseCharacterFieldLines(raw, paths);
    const merged = __targetedFieldAiTestUtils.mergeCharacterAiPayload(character, {}, parsed, "");

    expect(parsed).toMatchObject({
      quickProfile: {
        age: "Adult; exact age not fixed in canon yet.",
      },
    });
    expect(merged.quickProfile).toMatchObject({
      age: "Adult; exact age not fixed in canon yet.",
    });
    expect(String((merged.quickProfile as Record<string, unknown>).profession)).not.toContain("should remain specific");

    const dossier = merged.dossier as CharacterRecord["dossier"];
    expect(dossier.personalityBehavior.coreTraits).toEqual(["controlled", "observant", "protective", "suspicious"]);
    expect(dossier.personalityBehavior.virtues).not.toEqual(dossier.personalityBehavior.coreTraits);
    expect(dossier.relationshipDynamics.enemies.join(" ")).toContain("central bargain");
    expect(dossier.relationshipDynamics.family.join(" ")).toContain("Family ties");
    expect(dossier.freeTextCore).toBe("");
  });

  it("rejects meta instructions, raw field paths, and generic repeated trait triplets", () => {
    const paths = [
      "quickProfile.age",
      "dossier.personalityBehavior.coreTraits",
      "dossier.relationshipDynamics.enemies",
      "dossier.relationshipDynamics.trustLevels",
    ];
    const badRaw = [
      "quickProfile.age :: David Weiss should remain specific, emotionally grounded, and synchronized with the book's central conflict.",
      "dossier.personalityBehavior.coreTraits :: guarded | precise | grief-driven",
      "dossier.relationshipDynamics.enemies :: guarded | precise | grief-driven",
      "dossier.relationshipDynamics.trustLevels :: Maintains useful alliances. dossier.relationshipDynamics.hiddenLoyalties:: Loyal to the vulnerable.",
    ].join("\n");

    const parsed = __targetedFieldAiTestUtils.parseCharacterFieldLines(badRaw, paths);

    expect(__targetedFieldAiTestUtils.characterPayloadLeafCount(parsed)).toBe(0);
  });
});
