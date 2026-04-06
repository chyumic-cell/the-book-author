import { buildBellCraftReference } from "@/lib/bell-craft-reference";
import { builtInHeuristics } from "@/lib/defaults";
import { compactText } from "@/lib/utils";
import type { ContextPackage, ProjectWorkspace } from "@/types/storyforge";

type PromptFlavor = "planning" | "drafting" | "revision" | "coaching" | "selection";

type SectionBudget = {
  series: number;
  storyBible: number;
  skeleton: number;
  longTerm: number;
  shortTerm: number;
  threads: number;
  continuity: number;
  excerptChars: number;
};

const PROMPT_BUDGETS: Record<PromptFlavor, SectionBudget> = {
  planning: {
    series: 4,
    storyBible: 5,
    skeleton: 5,
    longTerm: 5,
    shortTerm: 2,
    threads: 4,
    continuity: 3,
    excerptChars: 420,
  },
  drafting: {
    series: 5,
    storyBible: 7,
    skeleton: 6,
    longTerm: 6,
    shortTerm: 4,
    threads: 4,
    continuity: 4,
    excerptChars: 900,
  },
  revision: {
    series: 5,
    storyBible: 6,
    skeleton: 5,
    longTerm: 5,
    shortTerm: 4,
    threads: 4,
    continuity: 5,
    excerptChars: 1100,
  },
  coaching: {
    series: 3,
    storyBible: 4,
    skeleton: 4,
    longTerm: 4,
    shortTerm: 3,
    threads: 4,
    continuity: 4,
    excerptChars: 750,
  },
  selection: {
    series: 3,
    storyBible: 4,
    skeleton: 3,
    longTerm: 4,
    shortTerm: 3,
    threads: 3,
    continuity: 4,
    excerptChars: 950,
  },
};

function classifyPromptFlavor(task: string): PromptFlavor {
  const lowerTask = task.toLowerCase();

  if (lowerTask.includes("coach")) {
    return "coaching";
  }

  if (lowerTask.includes("selected text")) {
    return "selection";
  }

  if (lowerTask.includes("revise")) {
    return "revision";
  }

  if (lowerTask.includes("plan") || lowerTask.includes("outline")) {
    return "planning";
  }

  return "drafting";
}

function describeDial(
  value: number,
  bands: {
    low: string;
    midLow: string;
    mid: string;
    midHigh: string;
    high: string;
  },
) {
  if (value <= 2) {
    return bands.low;
  }
  if (value <= 4) {
    return bands.midLow;
  }
  if (value <= 6) {
    return bands.mid;
  }
  if (value <= 8) {
    return bands.midHigh;
  }
  return bands.high;
}

function section(title: string, body: string) {
  const trimmed = body.trim();
  return trimmed ? `${title}:\n${trimmed}` : "";
}

function formatBullets(items: string[], maxItems: number, maxChars = 220) {
  return items
    .filter(Boolean)
    .slice(0, maxItems)
    .map((item) => `- ${compactText(item, maxChars)}`)
    .join("\n");
}

function formatMemory(items: ContextPackage["relevantLongTermMemory"], maxItems: number, maxChars = 190) {
  return items
    .slice(0, maxItems)
    .map((item) => `- ${item.title}: ${compactText(item.content, maxChars)}`)
    .join("\n");
}

function formatThreads(items: ContextPackage["activePlotThreads"], maxItems: number, maxChars = 160) {
  return items
    .slice(0, maxItems)
    .map((thread) => `- ${thread.title}: ${compactText(thread.summary, maxChars)}`)
    .join("\n");
}

function formatContinuity(items: ContextPackage["continuityConstraints"], maxItems: number, maxChars = 180) {
  return items
    .slice(0, maxItems)
    .map((issue) => `- ${issue.title}: ${compactText(issue.description, maxChars)}`)
    .join("\n");
}

function buildCompactStyleGuide(project: ProjectWorkspace) {
  const style = project.styleProfile;

  return [
    `Style dials: prose ${style.proseDensity}/10, pacing ${style.pacing}/10, darkness ${style.darkness}/10, romance ${style.romanceIntensity}/10, humor ${style.humorLevel}/10, action ${style.actionFrequency}/10, mystery ${style.mysteryDensity}/10, dialogue ${style.dialogueDescriptionRatio}/10, commercial ${style.literaryCommercialBalance}/10.`,
    `Prose target: ${describeDial(style.proseDensity, {
      low: "very lean and spare",
      midLow: "lean with restrained texture",
      mid: "balanced and readable",
      midHigh: "rich with noticeable texture",
      high: "lush and highly descriptive",
    })}; pacing target: ${describeDial(style.pacing, {
      low: "slow and reflective",
      midLow: "measured",
      mid: "balanced",
      midHigh: "brisk",
      high: "fast and urgent",
    })}.`,
    `Dialogue balance: ${describeDial(style.dialogueDescriptionRatio, {
      low: "favor narration and description over dialogue",
      midLow: "slightly more narration than dialogue",
      mid: "balanced dialogue and description",
      midHigh: "dialogue-forward scenes with supportive description",
      high: "strongly dialogue-driven writing",
    })}.`,
    `Tone pull: ${describeDial(style.darkness, {
      low: "light and humane",
      midLow: "softly shadowed",
      mid: "moderately dark",
      midHigh: "consistently dark",
      high: "grim and severe",
    })}; commercial pull: ${describeDial(style.literaryCommercialBalance, {
      low: "literary and interior",
      midLow: "slightly literary",
      mid: "balanced literary and commercial",
      midHigh: "commercially readable",
      high: "strongly commercial and page-turning",
    })}.`,
  ].join("\n");
}

function buildDialogueFormattingGuidance() {
  return [
    "Dialogue rules:",
    '- Spoken dialogue uses normal prose with double quotation marks, never `Name: line` play-script formatting.',
    "Every spoken line must close its quotation marks.",
    "Internal thought stays interior and italicized rather than sounding spoken aloud.",
    "Do not leave raw markdown-looking asterisk fragments hanging around dialogue or thought.",
    "Different characters must not sound interchangeable.",
    "Make voices feel like real people under pressure, not polished robots taking turns speaking.",
    "Vary diction, directness, sentence length, rhythm, subtext, emotional leakage, and what each speaker avoids saying.",
    "Let class, education, profession, emotional state, relationship tension, and power imbalance shape how a character phrases the same idea.",
  ].join("\n");
}

function buildDialogueVoiceContract() {
  return [
    "Dialogue voice contract:",
    "Whenever two or more characters speak, the reader should be able to feel who is talking even before a dialogue tag confirms it.",
    "Use the character dossiers and voice map actively: accent, dialect, directness, formality, vocabulary, rhythm, verbal habits, emotional state, conflict style, and relationship tension must shape the lines.",
    "If a character dossier is thin or missing, infer the most plausible voice from the person's role, class, rank, education, origin, religion, and emotional pressure in the scene.",
    "Do not randomly assign mismatched speech patterns or fake accents. A noble should not suddenly sound like a street beggar, and a speaker from one region should not slip into another region's accent unless the story explains it.",
    "When accent is uncertain, keep the syntax and vocabulary natural rather than forcing phonetic spelling.",
    "Do not give every speaker the same clean sentence rhythm, emotional temperature, or explanatory clarity.",
    "Allow interruption, evasion, bluntness, politeness, hedging, sarcasm, clipped phrasing, over-explaining, or silence according to the character rather than the AI's default voice.",
    "When characters misunderstand each other, let that misunderstanding appear naturally in the exchange instead of flattening it away.",
  ].join("\n");
}

export function buildStyleConstraintReminder(project: ProjectWorkspace) {
  const style = project.styleProfile;

  return [
    "Treat the project's style dials and written style notes as active constraints for every AI writing, editing, outlining, revision, coaching example, and assistant-applied change.",
    "Do not ignore those settings unless the writer explicitly overrides them for this exact request.",
    `Global style contract: match prose density ${style.proseDensity}/10, pacing ${style.pacing}/10, darkness ${style.darkness}/10, romance ${style.romanceIntensity}/10, humor ${style.humorLevel}/10, action ${style.actionFrequency}/10, mystery ${style.mysteryDensity}/10, dialogue ratio ${style.dialogueDescriptionRatio}/10, and commercial pull ${style.literaryCommercialBalance}/10.`,
  ].join("\n");
}

export function buildSystemGuidance(project: ProjectWorkspace) {
  const base = builtInHeuristics[project.styleProfile.guidanceIntensity];
  const voice = project.styleProfile.voiceRules;
  const extras = [
    buildStyleConstraintReminder(project),
    buildCompactStyleGuide(project),
    buildDialogueFormattingGuidance(),
    project.styleProfile.aestheticGuide ? `Aesthetic guide: ${project.styleProfile.aestheticGuide}` : "",
    project.styleProfile.styleGuide ? `Style guide: ${project.styleProfile.styleGuide}` : "",
  ].filter(Boolean);

  return [...base, ...voice, ...extras].join("\n");
}

function buildCoreProjectContext(project: ProjectWorkspace, context: ContextPackage) {
  return [
    `Project: ${project.title}`,
    project.bookSettings.seriesName
      ? `Series: ${project.bookSettings.seriesName}${project.bookSettings.seriesOrder ? ` (Book ${project.bookSettings.seriesOrder})` : ""}`
      : "",
    `Premise: ${compactText(project.premise, 260)}`,
    project.oneLineHook ? `Hook: ${compactText(project.oneLineHook, 180)}` : "",
    `Story brief: ${compactText(project.bookSettings.storyBrief, 260)}`,
    `Plot direction: ${compactText(project.bookSettings.plotDirection, 220)}`,
    project.bookSettings.themes.length ? `Themes: ${project.bookSettings.themes.join(" | ")}` : "",
    `Chapter goal: ${compactText(context.chapterGoal, 220)}`,
  ].filter(Boolean);
}

function buildCanonHierarchy() {
  return [
    "Canon hierarchy and hard constraints:",
    "1. The current chapter blueprint is the immediate source of truth for this chapter.",
    "2. Series canon from other books in the same series is the source of truth for recurring characters, locations, and long-running arcs across books.",
    "3. The story bible canon is the source of truth for character identity, world rules, relationships, lore, and ongoing states.",
    "4. The story skeleton support is the source of truth for structure, scene purpose, planned turns, and story architecture.",
    "5. Long-term memory is durable canon and must not be contradicted.",
    "6. Short-term memory tracks recent temporary conditions and should be preserved unless the chapter explicitly changes them.",
    "7. Active plot threads and continuity constraints are obligations, not optional flavor.",
    "If any instruction seems to conflict with the canon hierarchy, preserve canon rather than inventing a new version of the story.",
    "Do not rename characters, change relationships, alter world rules, move chronology, or swap motivations unless the writer explicitly instructs that change.",
    "Do not drift away from the chapter outline, required inclusions, forbidden elements, current beat, or established series continuity.",
  ].join("\n");
}

function buildCanonicalAnchors(context: ContextPackage) {
  return [
    ...context.chapterBlueprint.slice(0, 8).map((entry) => `- ${compactText(entry, 220)}`),
    ...context.seriesContext.slice(0, 6).map((entry) => `- ${compactText(entry, 220)}`),
    ...context.storyBibleContext.slice(0, 6).map((entry) => `- ${compactText(entry, 220)}`),
    ...context.storySkeletonContext.slice(0, 5).map((entry) => `- ${compactText(entry, 220)}`),
  ].join("\n");
}

export function buildPromptEnvelope(
  task: string,
  project: ProjectWorkspace,
  context: ContextPackage,
  instruction: string,
  roleInstruction?: string,
) {
  const flavor = classifyPromptFlavor(task);
  const budget = PROMPT_BUDGETS[flavor];

  const sections = [
    `Task: ${task}`,
    roleInstruction ? `Role behavior: ${roleInstruction}` : "",
    buildCanonHierarchy(),
    ...buildCoreProjectContext(project, context),
    section("Canonical anchors you must preserve", buildCanonicalAnchors(context)),
    section("Chapter blueprint", formatBullets(context.chapterBlueprint, 6, 180)),
    section("Series canon", formatBullets(context.seriesContext, budget.series, 220)),
    context.previousChapterSummary
      ? `Previous chapter summary: ${compactText(context.previousChapterSummary, flavor === "drafting" ? 260 : 180)}`
      : "",
    context.localExcerpt
      ? section("Local excerpt", compactText(context.localExcerpt, budget.excerptChars))
      : "",
    section("Story bible canon", formatBullets(context.storyBibleContext, budget.storyBible, 220)),
    section("Dialogue voice map", formatBullets(context.dialogueVoiceContext, Math.max(3, budget.storyBible), 240)),
    section("Story skeleton support", formatBullets(context.storySkeletonContext, budget.skeleton, 200)),
    section("Relevant long-term memory", formatMemory(context.relevantLongTermMemory, budget.longTerm)),
    section("Recent short-term memory", formatMemory(context.recentShortTermMemory, budget.shortTerm, 160)),
    section("Active plot threads", formatThreads(context.activePlotThreads, budget.threads)),
    section("Continuity constraints", formatContinuity(context.continuityConstraints, budget.continuity)),
    section("Writing guidance", buildSystemGuidance(project)),
    section("Dialogue individuality", buildDialogueVoiceContract()),
    section("James Scott Bell guide reference from the user's PDF", buildBellCraftReference(task)),
    `Instruction: ${instruction}`,
  ];

  return sections.filter(Boolean).join("\n\n");
}
