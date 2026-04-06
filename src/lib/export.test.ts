import { describe, expect, it } from "vitest";

import { buildExportHtml, buildSpoilerFreeBackCoverSummary } from "@/lib/export";
import type { ProjectWorkspace } from "@/types/storyforge";

function makeProject(partial: Partial<ProjectWorkspace>): ProjectWorkspace {
  return {
    id: "project-1",
    title: "Test Project",
    slug: "test-project",
    premise: "In the end, the killer is the deputy who manipulated the chain of custody to hide the truth.",
    oneLineHook: "A body in the woods draws a county detective into a case where every answer deepens the danger.",
    bookSettings: {
      authorName: "",
      genre: "Forensic murder mystery",
      tone: "Dark and suspenseful",
      audience: "Adult",
      themes: [],
      pointOfView: "Close third-person",
      tense: "Past",
      targetChapterLength: 2500,
      targetBookLength: 15000,
      storyBrief: "A detective investigates a murder.",
      plotDirection: "Stay twisty.",
      pacingNotes: "",
      romanceLevel: 0,
      darknessLevel: 0,
      proseStyle: "",
      comparableTitles: [],
    },
    styleProfile: {
      guidanceIntensity: "STRONG",
      proseDensity: 5,
      pacing: 5,
      darkness: 5,
      romanceIntensity: 0,
      humorLevel: 0,
      actionFrequency: 0,
      mysteryDensity: 10,
      dialogueDescriptionRatio: 5,
      literaryCommercialBalance: 5,
      aestheticGuide: "",
      styleGuide: "",
      voiceRules: [],
    },
    generationPresets: [],
    characters: [],
    relationships: [],
    locations: [],
    factions: [],
    timelineEvents: [],
    plotThreads: [],
    ideaEntries: [],
    workingNotes: [],
    structureBeats: [],
    sceneCards: [],
    chapters: [
      {
        id: "chapter-1",
        projectId: "project-1",
        number: 1,
        title: "Where They Found Her",
        purpose: "A body is found in the woods and the detective thinks the answer will be simple.",
        currentBeat: "The case opens and certainty looks dangerous.",
        targetWordCount: 2500,
        keyBeats: [],
        requiredInclusions: [],
        forbiddenElements: [],
        desiredMood: "",
        sceneList: [],
        outline: "",
        draft: "",
        notes: "",
        status: "DRAFTING",
        povCharacterId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    longTermMemoryItems: [],
    shortTermMemoryItems: [],
    continuityIssues: [],
    assistRuns: [],
    ...partial,
  };
}

describe("export helpers", () => {
  it("prefers a spoiler-free hook over a spoilery premise", () => {
    const summary = buildSpoilerFreeBackCoverSummary(makeProject({}));

    expect(summary).toContain("body is found in the woods");
    expect(summary.toLowerCase()).not.toContain("killer");
    expect(summary.toLowerCase()).not.toContain("in the end");
  });

  it("falls back to early chapter setup when the hook is spoilery", () => {
    const summary = buildSpoilerFreeBackCoverSummary(
      makeProject({
        oneLineHook: "In the end, the killer is finally exposed.",
      }),
    );

    expect(summary).toContain("body is found in the woods");
    expect(summary.toLowerCase()).not.toContain("killer");
  });

  it("rejects hooks that spoil a catastrophic ending", () => {
    const summary = buildSpoilerFreeBackCoverSummary(
      makeProject({
        title: "Ember in Zion",
        oneLineHook:
          "A Roman spy inside besieged Jerusalem must choose between his duty to Rome and a growing pity for the doomed city, a choice culminating in the destruction of the Second Temple.",
        bookSettings: {
          ...makeProject({}).bookSettings,
          genre: "Historical war tragedy",
          tone: "Dark and tragic",
          storyBrief: "A Roman spy moves through the siege of Jerusalem as the city turns inward on itself.",
        },
        chapters: [
          {
            ...makeProject({}).chapters[0],
            purpose: "A Roman spy enters besieged Jerusalem and begins to see the city tearing itself apart under siege.",
            currentBeat: "The city is hungry, divided, and still full of faith.",
          },
        ],
      }),
    );

    expect(summary).toContain("Roman spy enters besieged Jerusalem");
    expect(summary.toLowerCase()).not.toContain("destruction");
    expect(summary.toLowerCase()).not.toContain("culminating");
  });

  it("avoids outline-style planning language in the blurb lead", () => {
    const summary = buildSpoilerFreeBackCoverSummary(
      makeProject({
        title: "Ember in Zion",
        oneLineHook:
          "A Roman spy inside besieged Jerusalem must choose between his duty to Rome and a growing pity for the doomed city, a choice culminating in the destruction of the Second Temple.",
        bookSettings: {
          ...makeProject({}).bookSettings,
          genre: "Historical war tragedy",
          storyBrief: "A Roman spy moves through the siege of Jerusalem as the city turns inward on itself.",
        },
        chapters: [
          {
            ...makeProject({}).chapters[0],
            purpose:
              "Establish Lucius's character, skillset, and mission parameters given by Titus and the dangers of spying in a city divided by internal factions and external threat.",
            currentBeat: "The city is hungry, divided, and still full of faith.",
          },
        ],
      }),
    );

    expect(summary).toContain("The city is hungry, divided, and still full of faith.");
    expect(summary).not.toContain("Establish Lucius");
    expect(summary.toLowerCase()).not.toContain("destruction");
  });

  it("uses justified text styling in the PDF export layout", () => {
    const html = buildExportHtml({
      title: "Test Project",
      authorName: "Uncredited Author",
      copyrightNotice: "Copyright notice.",
      backCoverSummary: "Back cover summary.",
      chapters: [
        {
          number: 1,
          title: "Where They Found Her",
          content: "Paragraph one.\n\nParagraph two.",
        },
      ],
    });

    expect(html).toContain("text-align: justify");
    expect(html).toContain("hyphens: auto");
  });

  it("renders internal thought markup as italics in the PDF export layout", () => {
    const html = buildExportHtml({
      title: "Test Project",
      authorName: "Uncredited Author",
      copyrightNotice: "Copyright notice.",
      backCoverSummary: "Back cover summary.",
      chapters: [
        {
          number: 1,
          title: "Where They Found Her",
          content: 'He looked at the blood and thought, *This cannot be right.*',
        },
      ],
    });

    expect(html).toContain("<em>This cannot be right.</em>");
  });
});
