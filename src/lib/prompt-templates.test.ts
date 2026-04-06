import { describe, expect, it } from "vitest";

import { buildPromptEnvelope, buildStyleConstraintReminder } from "@/lib/prompt-templates";
import type { ContextPackage, ProjectWorkspace } from "@/types/storyforge";

function makeProject(): ProjectWorkspace {
  return {
    id: "project-1",
    title: "Test Project",
    slug: "test-project",
    premise: "A novelist uses StoryForge to keep a book coherent without losing voice.",
    oneLineHook: "A writer tests whether structure can coexist with freedom.",
    availableSeriesNames: ["The Test Cycle"],
    series: null,
    seriesCanonicalAnchors: [],
    bookSettings: {
      authorName: "",
      seriesName: "",
      seriesOrder: null,
      genre: "Historical fiction",
      tone: "Tense and elegant",
      audience: "Adult",
      themes: ["duty", "loss"],
      pointOfView: "Third person limited",
      tense: "Past tense",
      targetChapterLength: 2200,
      targetBookLength: 85000,
      storyBrief: "A loyal officer loses the world he was built to serve.",
      plotDirection: "Escalate toward tragic defeat with moral pressure.",
      pacingNotes: "Keep momentum under reflective passages.",
      romanceLevel: 1,
      darknessLevel: 6,
      proseStyle: "Measured but vivid",
      comparableTitles: ["A Tale of Two Cities"],
    },
    styleProfile: {
      guidanceIntensity: "STRONG",
      proseDensity: 7,
      pacing: 6,
      darkness: 6,
      romanceIntensity: 1,
      humorLevel: 1,
      actionFrequency: 5,
      mysteryDensity: 4,
      dialogueDescriptionRatio: 8,
      literaryCommercialBalance: 7,
      aestheticGuide: "Cold candlelight, cavalry leather, winter roads.",
      styleGuide: "Favor clear, muscular sentences with selective lyric lift.",
      voiceRules: ["Keep dialogue pointed and class-aware."],
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
    chapters: [],
    longTermMemoryItems: [],
    shortTermMemoryItems: [],
    continuityIssues: [],
    assistRuns: [],
  };
}

function makeContext(): ContextPackage {
  return {
    projectBrief: "A royalist tragedy.",
    chapterGoal: "Show the protagonist recommitting himself to a doomed cause.",
    previousChapterSummary: "He escaped Paris but learned the king was already dead.",
    chapterBlueprint: ["Chapter 5: The Oath", "Purpose: Renew his vow"],
    seriesContext: ["Series character from Book 1: Rene - older and more bitter after exile."],
    storyBibleContext: ["Character dossier: Rene - embittered cavalry officer"],
    dialogueVoiceContext: [
      "Voice map: Rene - Directness: blunt | Rhythm: clipped and martial | When angry: sharp and contemptuous",
      "Voice friction: Rene <-> Julien - Relationship: RIVAL | Tension: Rene demands clarity while Julien evades",
    ],
    storySkeletonContext: ["Structure beat: Midpoint oath of no return"],
    relevantLongTermMemory: [],
    recentShortTermMemory: [],
    activePlotThreads: [],
    stylisticInstructions: [],
    continuityConstraints: [],
    localExcerpt: "He watched the torchlight move over the river.",
    tokenEstimate: 420,
  };
}

describe("prompt templates", () => {
  it("treats style dials as active constraints", () => {
    const reminder = buildStyleConstraintReminder(makeProject());

    expect(reminder).toContain("active constraints");
    expect(reminder).toContain("dialogue ratio 8/10");
    expect(reminder).toContain("commercial pull 7/10");
  });

  it("includes the style contract inside prompt envelopes", () => {
    const prompt = buildPromptEnvelope(
      "Generate chapter draft",
      makeProject(),
      makeContext(),
      "Write the next chapter.",
    );

    expect(prompt).toContain("Treat the project's style dials");
    expect(prompt).toContain("Dialogue balance:");
    expect(prompt).toContain("dialogue-forward scenes with supportive description");
    expect(prompt).toContain("Spoken dialogue uses normal prose with double quotation marks");
    expect(prompt).toContain("Internal thought stays interior and italicized");
    expect(prompt).toContain("Chapter blueprint:");
    expect(prompt).toContain("Series canon:");
    expect(prompt).toContain("Story bible canon:");
    expect(prompt).toContain("Dialogue voice map:");
    expect(prompt).toContain("Different characters must not sound interchangeable.");
    expect(prompt).toContain("Make voices feel like real people under pressure, not polished robots");
    expect(prompt).toContain("If a character dossier is thin or missing");
    expect(prompt).toContain("Do not randomly assign mismatched speech patterns or fake accents.");
    expect(prompt).toContain("Story skeleton support:");
  });
});
