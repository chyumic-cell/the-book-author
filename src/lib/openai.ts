import "server-only";

import OpenAI from "openai";

import { buildBellCraftReference } from "@/lib/bell-craft-reference";
import { APP_NAME } from "@/lib/brand";
import {
  assessManuscriptEnding,
  cleanInlineSuggestionAgainstContext,
  cleanInlineSuggestionText,
  cleanStructuredText,
  cleanSummaryText,
  sanitizeManuscriptText,
} from "@/lib/ai-output";
import { buildContextPackage } from "@/lib/memory";
import { buildPromptEnvelope, buildSystemGuidance } from "@/lib/prompt-templates";
import { getProviderSetupStatus, resolveProviderRuntime } from "@/lib/provider-config";
import { getChapterById, getLatestChapterSummary, getProjectWorkspace } from "@/lib/project-data";
import { compactText } from "@/lib/utils";
import type {
  AiRole,
  AssistActionType,
  AssistMode,
  BestsellerGuideRecommendation,
  BestsellerGuideReport,
  ChapterRecord,
  CharacterInterpretationSuggestion,
  CharacterRecord,
  ContextPackage,
  MemoryExtractionResult,
  ProjectWorkspace,
} from "@/types/storyforge";

function getRoleInstruction(role: AiRole) {
  switch (role) {
    case "GHOSTWRITER":
      return "Write decisive prose and carry continuity confidently, but do not flatten the user's existing voice.";
    case "STORY_DOCTOR":
      return "Prioritize diagnosis, causality, and structural pressure over decorative prose.";
    case "DEVELOPMENTAL_EDITOR":
      return "Be candid, editorial, and revision-focused. Improve architecture before polish.";
    case "OUTLINE_ARCHITECT":
      return "Think in turns, beats, escalation, promises, and payoff logic.";
    case "BRAINSTORM_PARTNER":
      return "Generate multiple strong options, variants, and surprising combinations without sounding generic.";
    case "WRITING_COACH":
      return "Guide plainly, teach clearly, and avoid drafting unless the user explicitly asks for text.";
    case "BETA_READER":
      return "Respond like an engaged reader noticing confusion, drag, surprise, and emotional pull.";
    case "COWRITER":
    default:
      return "Collaborate closely with the writer, offer usable text, and stay responsive to the current page.";
  }
}

async function getProviderClient() {
  const provider = await resolveProviderRuntime();
  if (!provider) {
    return null;
  }

  return {
    label: provider.label,
    model: provider.model,
    client: new OpenAI({
      apiKey: provider.apiKey,
      baseURL: provider.baseUrl,
      defaultHeaders: provider.defaultHeaders,
    }),
  };
}

type ProviderCallOptions = {
  maxOutputTokens?: number;
};

const OPENROUTER_VISIBLE_TEXT_FALLBACK_MODELS = [
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "openai/gpt-oss-20b:free",
  "meta-llama/llama-3.2-3b-instruct:free",
  "arcee-ai/trinity-large-preview:free",
] as const;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableProviderError(error: unknown) {
  const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: unknown }).status) : null;
  if (status && (status === 408 || status === 409 || status === 429 || status >= 500)) {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("timeout") || message.includes("temporarily unavailable") || message.includes("rate limit");
}

function isRateLimitedProviderError(error: unknown) {
  const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: unknown }).status) : null;
  if (status === 429) {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("429") || message.includes("rate limit");
}

function extractTextFromResponsePayload(response: unknown) {
  if (typeof response === "object" && response && "output_text" in response) {
    const outputText = (response as { output_text?: unknown }).output_text;
    if (typeof outputText === "string" && outputText.trim()) {
      return outputText.trim();
    }
  }

  if (typeof response === "object" && response && "output" in response) {
    const output = (response as {
      output?: Array<{ content?: Array<{ text?: string }> }>;
    }).output;
    const contentText = (output ?? [])
      .flatMap((item) => item.content ?? [])
      .map((item) => item.text ?? "")
      .join("\n")
      .trim();

    if (contentText) {
      return contentText;
    }
  }

  if (typeof response === "object" && response && "choices" in response) {
    const firstMessage = (response as {
      choices?: Array<{
        message?: { content?: string | Array<{ text?: string }> };
      }>;
    }).choices?.[0]?.message?.content;

    if (typeof firstMessage === "string" && firstMessage.trim()) {
      return firstMessage.trim();
    }

    if (Array.isArray(firstMessage)) {
      const text = firstMessage
        .map((part) => part?.text ?? "")
        .join("\n")
        .trim();
      if (text) {
        return text;
      }
    }
  }

  return "";
}

function hasReasoningOnlyOutput(response: unknown) {
  if (typeof response !== "object" || !response || !("output" in response)) {
    return false;
  }

  const output = (response as {
    output?: Array<{ type?: string }>;
  }).output;

  return Array.isArray(output) && output.length > 0 && output.every((item) => item?.type === "reasoning");
}

function getChapterWordRange(chapter: ChapterRecord) {
  const target = Math.max(300, chapter.targetWordCount || 0);
  return {
    target,
    min: Math.max(150, target - 200),
    max: target + 100,
  };
}

function buildChapterWordRangeInstruction(chapter: ChapterRecord) {
  const range = getChapterWordRange(chapter);
  return `Length constraint: aim for about ${range.target} words and keep the finished chapter between ${range.min} and ${range.max} words.`;
}

function buildFullChapterRevisionInstruction(chapter: ChapterRecord, instruction: string) {
  const range = getChapterWordRange(chapter);
  return [
    buildChapterWordRangeInstruction(chapter),
    "Rewrite the full chapter manuscript, not a short patch, excerpt, note, or sample.",
    "Preserve the chapter's chronology, canon facts, POV, and continuity unless the instruction explicitly changes them.",
    "Do not recycle a stock opening line, repeated mantra, or reused first image from another chapter.",
    `If the current chapter is materially under target, expand it with real scene development until it lands within ${range.min} to ${range.max} words.`,
    "Do not stop after a partial fix if the chapter still falls far short of the target range.",
    "Do not stop mid-sentence, mid-thought, or mid-paragraph.",
    "End with a complete final paragraph and a fully finished final sentence.",
    "Land the ending on consequence, tension, revelation, dread, or unresolved pressure rather than letting the prose trail off.",
    "Do not include meta prose such as 'the chapter ends with' or editorial commentary.",
    "Return only the finished revised chapter prose.",
    instruction,
  ].join("\n");
}

function formatChapterInstruction(chapter: ChapterRecord, task: "outline" | "draft") {
  const lines = [
    `${task === "outline" ? "Outline" : "Write"} chapter ${chapter.number}: ${chapter.title}.`,
    buildChapterWordRangeInstruction(chapter),
    "Treat the chapter blueprint, outline, story bible, story skeleton, memory layers, and continuity constraints as binding context, not optional hints.",
    "Give this chapter its own opening image and motion. Do not start with a recycled stock phrase or a paraphrase of an earlier chapter opener.",
    chapter.currentBeat ? `Current beat: ${chapter.currentBeat}` : "",
    chapter.purpose ? `Chapter purpose: ${chapter.purpose}` : "",
    chapter.desiredMood ? `Desired mood / aesthetic: ${chapter.desiredMood}` : "",
    chapter.keyBeats.length ? `Key beats:\n- ${chapter.keyBeats.join("\n- ")}` : "",
    chapter.requiredInclusions.length ? `Required inclusions:\n- ${chapter.requiredInclusions.join("\n- ")}` : "",
    chapter.forbiddenElements.length ? `Forbidden elements:\n- ${chapter.forbiddenElements.join("\n- ")}` : "",
    chapter.sceneList.length ? `Scene list / lane suggestions:\n- ${chapter.sceneList.join("\n- ")}` : "",
    "Honor the project's style dials and written style guidance in every beat and line choice, especially the dialogue-versus-description balance.",
    "Format spoken dialogue in standard prose with double quotation marks, never as `Name: line` play-script formatting.",
    "Render internal thoughts as internal thought in italics rather than spoken dialogue, unless the writer explicitly asks for another style.",
    "Do not leave dialogue with missing closing quotation marks.",
    "If a character lacks a full speech dossier, infer a plausible voice from rank, class, education, origin, role, and scene pressure rather than defaulting to generic AI dialogue.",
      "Do not make unrelated characters drift into the wrong accent, class register, or social rhythm unless the story explicitly motivates it.",
      "Make each speaking character sound like a distinct human being rather than a variation of the same narrator.",
      "Let dialogue reflect dossier-level differences in class, confidence, education, directness, emotional restraint, verbal habits, and relationship tension.",
      "If the chapter contains multiple speakers, vary rhythm, sentence length, diction, and emotional leakage so they do not all sound polished or interchangeable.",
      "If the project already names characters, places, factions, institutions, or recurring terms, keep those names instead of inventing replacements.",
      "Prefer established canon entities over surprise substitutions.",
      "Do not stop mid-sentence, mid-thought, or mid-paragraph.",
    "End with a complete final paragraph and a finished closing sentence that creates forward pull.",
    "Do not include meta prose such as 'the chapter ends with' or editorial commentary.",
    task === "outline"
      ? "Return a compact scene-by-scene outline as 6 to 9 numbered beats. Each beat should escalate pressure, reveal change, and end with momentum."
      : "Return finished prose only, with no prefatory explanation, bullet notes, revision commentary, markdown end markers, or metadata.",
    task === "draft"
      ? "Do not restart the novel, replay an earlier chapter, or reuse an opening scaffold from a previous chapter unless the instruction explicitly asks for a flashback."
      : "",
    task === "draft" ? "Stay in the current chronology and make this chapter materially new." : "",
  ];

  return lines.filter(Boolean).join("\n\n");
}

function withAdditionalInstruction(baseInstruction: string, additionalInstruction?: string) {
  const trimmed = additionalInstruction?.trim();
  if (!trimmed) {
    return baseInstruction;
  }

  return [baseInstruction, `Additional writer direction:\n${trimmed}`].join("\n\n");
}

function clampScore(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function buildGuideJsonContract(scope: "chapter" | "book", chapter?: ChapterRecord) {
  const chapterNumber = chapter?.number ?? 0;
  const chapterTitle = chapter?.title ?? "";

  return JSON.stringify(
    {
      alignmentScore: 72,
      verdict: scope === "chapter" ? "The chapter has solid pressure but needs sharper scene escalation." : "The book has strong promise but needs firmer structural carry-through.",
      guideSummary:
        scope === "chapter"
          ? "Explain in 2-3 sentences how well this chapter matches the Bell-style bestseller guide."
          : "Explain in 2-3 sentences how well the whole book matches the Bell-style bestseller guide.",
      strengths: ["Specific strength 1", "Specific strength 2"],
      recommendations: [
        {
          title: "Concrete issue title",
          severity: "MEDIUM",
          explanation: "What is currently weak or missing.",
          whatToAdd: "What the writer should add, sharpen, or clarify.",
          whyItMatters: "Why this matters for tension, momentum, reader pull, or payoff.",
          fixInstruction:
            scope === "chapter"
              ? "Revise this chapter to add the missing pressure while preserving continuity."
              : "Revise the targeted chapter to add the missing pressure while preserving continuity and the existing manuscript facts.",
          targetChapterNumber: chapterNumber,
          targetChapterTitle: chapterTitle,
        },
      ],
    },
    null,
    2,
  );
}

function extractJsonObject(raw: string) {
  const cleaned = raw.replace(/```json|```/gi, "").trim();
  const candidates = [cleaned];
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    candidates.push(cleaned.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as Record<string, unknown>;
    } catch {
      continue;
    }
  }

  return null;
}

function normalizeGuideRecommendation(
  project: ProjectWorkspace,
  scope: "CHAPTER" | "BOOK",
  source: Record<string, unknown>,
  fallbackChapter: ChapterRecord | null,
  index: number,
): BestsellerGuideRecommendation {
  const requestedChapterNumber =
    typeof source.targetChapterNumber === "number" && Number.isFinite(source.targetChapterNumber)
      ? Math.round(source.targetChapterNumber)
      : null;
  const resolvedChapter =
    (requestedChapterNumber
      ? project.chapters.find((chapter) => chapter.number === requestedChapterNumber) ?? null
      : null) ?? fallbackChapter;

  return {
    id:
      typeof source.id === "string" && source.id.trim()
        ? source.id.trim()
        : `${scope.toLowerCase()}-guide-rec-${index + 1}`,
    severity:
      source.severity === "HIGH" || source.severity === "MEDIUM" || source.severity === "LOW"
        ? source.severity
        : "MEDIUM",
    title:
      typeof source.title === "string" && source.title.trim()
        ? source.title.trim()
        : `Guide gap ${index + 1}`,
    explanation:
      typeof source.explanation === "string" && source.explanation.trim()
        ? source.explanation.trim()
        : "The draft needs a clearer Bell-style pressure point.",
    whatToAdd:
      typeof source.whatToAdd === "string" && source.whatToAdd.trim()
        ? source.whatToAdd.trim()
        : "Add a sharper obstacle, complication, or reveal that materially changes the chapter.",
    whyItMatters:
      typeof source.whyItMatters === "string" && source.whyItMatters.trim()
        ? source.whyItMatters.trim()
        : "Readers keep turning pages when a chapter gains pressure, change, and forward pull.",
    fixInstruction:
      typeof source.fixInstruction === "string" && source.fixInstruction.trim()
        ? source.fixInstruction.trim()
        : resolvedChapter
          ? `Revise chapter ${resolvedChapter.number} to fix this Bell-guide gap while preserving the manuscript's facts and continuity.`
          : "Revise the most relevant chapter to fix this Bell-guide gap while preserving the manuscript's facts and continuity.",
    targetChapterNumber: resolvedChapter?.number ?? requestedChapterNumber ?? null,
    targetChapterTitle:
      resolvedChapter?.title ??
      (typeof source.targetChapterTitle === "string" ? source.targetChapterTitle.trim() : ""),
    targetChapterId: resolvedChapter?.id ?? null,
  };
}

function normalizeGuideReport(
  project: ProjectWorkspace,
  scope: "CHAPTER" | "BOOK",
  source: Record<string, unknown> | null,
  fallbackChapter: ChapterRecord | null,
): BestsellerGuideReport | null {
  if (!source) {
    return null;
  }

  const rawRecommendations = Array.isArray(source.recommendations)
    ? source.recommendations.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    : [];
  const strengths = Array.isArray(source.strengths)
    ? source.strengths.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 5)
    : [];

  return {
    scope,
    analyzedChapterId: scope === "CHAPTER" ? fallbackChapter?.id ?? null : null,
    analyzedChapterTitle: scope === "CHAPTER" ? fallbackChapter?.title ?? "" : "",
    alignmentScore: clampScore(typeof source.alignmentScore === "number" ? source.alignmentScore : 65),
    verdict:
      typeof source.verdict === "string" && source.verdict.trim()
        ? source.verdict.trim()
        : scope === "CHAPTER"
          ? "The chapter is partly aligned with the bestseller guide, but it still needs sharper pressure and payoff movement."
          : "The book is partly aligned with the bestseller guide, but it still needs stronger structural carry-through.",
    guideSummary:
      typeof source.guideSummary === "string" && source.guideSummary.trim()
        ? source.guideSummary.trim()
        : scope === "CHAPTER"
          ? "This chapter has workable material, but it needs a clearer objective, stronger escalation, and a more propulsive end beat."
          : "The manuscript has strong story promise, but the whole-book architecture needs firmer escalation, payoff timing, and chapter-to-chapter momentum.",
    strengths:
      strengths.length > 0
        ? strengths
        : [
            scope === "CHAPTER" ? "The chapter already has usable scene material." : "The book already has a usable premise and chapter spine.",
            "The current story state gives the AI enough canon to diagnose practical fixes.",
          ],
    recommendations: rawRecommendations
      .slice(0, 6)
      .map((recommendation, index) => normalizeGuideRecommendation(project, scope, recommendation, fallbackChapter, index)),
    sourceFramework: [
      "James Scott Bell guide",
    `${APP_NAME} commercial-fiction heuristics`,
      "LOCK, scenes, stakes, and page-turner review",
    ],
  };
}

function buildChapterGuideFallback(project: ProjectWorkspace, chapter: ChapterRecord): BestsellerGuideReport {
  const recommendations: BestsellerGuideRecommendation[] = [];
  const fallbackChapter = chapter;
  const hasDialogue = /["“”]/.test(chapter.draft);
  const chapterEnding = chapter.draft.trim().split(/\n+/).at(-1) ?? "";
  const lowMomentumEnding = chapterEnding && !/[!?]/.test(chapterEnding) && chapterEnding.length < 180;

  if (!chapter.purpose.trim() || !chapter.currentBeat.trim()) {
    recommendations.push(
      normalizeGuideRecommendation(
        project,
        "CHAPTER",
        {
          title: "Sharpen the chapter objective",
          severity: "HIGH",
          explanation: "The chapter's objective and immediate pressure are not explicit enough yet.",
          whatToAdd: "Clarify what the POV character is trying to get, avoid, or force in this chapter, then make resistance visible on the page.",
          whyItMatters: "Bell-style momentum depends on a clear objective colliding with friction, not vague movement.",
          fixInstruction: `Revise chapter ${chapter.number} so the chapter objective and resistance are unmistakably clear inside the manuscript itself.`,
          targetChapterNumber: chapter.number,
          targetChapterTitle: chapter.title,
        },
        fallbackChapter,
        recommendations.length,
      ),
    );
  }

  if (!hasDialogue && project.styleProfile.dialogueDescriptionRatio >= 6) {
    recommendations.push(
      normalizeGuideRecommendation(
        project,
        "CHAPTER",
        {
          title: "Add dialogue pressure",
          severity: "MEDIUM",
          explanation: "This chapter is light on on-page dialogue relative to the current dialogue-forward style settings.",
          whatToAdd: "Add a short exchange where opposing desires, status, or misunderstanding sharpen the beat.",
          whyItMatters: "Dialogue is one of the fastest ways to create conflict, reveal motive, and speed the page-turner feel.",
          fixInstruction: `Revise chapter ${chapter.number} to add meaningful dialogue pressure without changing the chapter's continuity or core event.`,
          targetChapterNumber: chapter.number,
          targetChapterTitle: chapter.title,
        },
        fallbackChapter,
        recommendations.length,
      ),
    );
  }

  if (lowMomentumEnding) {
    recommendations.push(
      normalizeGuideRecommendation(
        project,
        "CHAPTER",
        {
          title: "Sharpen the chapter ending",
          severity: "MEDIUM",
          explanation: "The ending lands softly instead of leaving the reader with a sharper question, pressure point, or reversal.",
          whatToAdd: "Close on a revelation, choice, threat, setback, or question that creates forward pull.",
          whyItMatters: "Bell-style commercial momentum depends on endings that make the reader need the next chapter.",
          fixInstruction: `Revise the ending of chapter ${chapter.number} so it closes on stronger momentum, sharper uncertainty, or a more consequential turn.`,
          targetChapterNumber: chapter.number,
          targetChapterTitle: chapter.title,
        },
        fallbackChapter,
        recommendations.length,
      ),
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      normalizeGuideRecommendation(
        project,
        "CHAPTER",
        {
          title: "Deepen the chapter turn",
          severity: "LOW",
          explanation: "The chapter is serviceable, but it could end with a stronger Bell-style turn or deeper consequence.",
          whatToAdd: "Intensify the obstacle, reveal, or emotional price in the scene's key turn.",
          whyItMatters: "Even strong chapters benefit from a more decisive change beat and stronger carry-forward energy.",
          fixInstruction: `Revise chapter ${chapter.number} to deepen the most important turn while preserving the existing continuity and scene facts.`,
          targetChapterNumber: chapter.number,
          targetChapterTitle: chapter.title,
        },
        fallbackChapter,
        recommendations.length,
      ),
    );
  }

  const strengths = [
    chapter.purpose.trim() ? "The chapter already has a stated purpose." : "",
    chapter.currentBeat.trim() ? "The chapter already names a current beat or lane of pressure." : "",
    chapter.outline.trim() ? "There is chapter scaffolding available to support revision." : "",
    hasDialogue ? "The draft already contains spoken exchange that can carry tension." : "",
  ].filter(Boolean);

  const alignmentScore = clampScore(78 - recommendations.length * 8 + strengths.length * 4);

  return {
    scope: "CHAPTER",
    analyzedChapterId: chapter.id,
    analyzedChapterTitle: chapter.title,
    alignmentScore,
    verdict:
      alignmentScore >= 76
        ? "The chapter is broadly aligned with the bestseller guide, but there are still a few pressure and payoff upgrades available."
        : "The chapter has solid raw material, but it still needs Bell-style tightening around objective, escalation, and chapter pull.",
    guideSummary:
      recommendations[0]?.explanation ??
      "The chapter needs clearer pressure, stronger scene movement, and a more compelling carry-forward beat.",
    strengths:
      strengths.length > 0
        ? strengths
        : ["The chapter already has enough material for a focused Bell-style revision pass."],
    recommendations,
    sourceFramework: [
      "James Scott Bell guide",
    `${APP_NAME} commercial-fiction heuristics`,
      "LOCK, scenes, stakes, and page-turner review",
    ],
  };
}

function buildBookGuideFallback(project: ProjectWorkspace): BestsellerGuideReport {
  const totalWords = project.chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0);
  const missingSummaries = project.chapters.filter((chapter) => chapter.summaries.length === 0);
  const midpointChapter = project.chapters[Math.max(0, Math.floor(project.chapters.length / 2) - 1)] ?? project.chapters[0] ?? null;
  const openingChapter = project.chapters[0] ?? null;
  const endingChapter = project.chapters.at(-1) ?? null;
  const recommendations: BestsellerGuideRecommendation[] = [];
  const structureTypes = new Set(project.structureBeats.map((beat) => beat.type));

  if (project.plotThreads.length < 2 && midpointChapter) {
    recommendations.push(
      normalizeGuideRecommendation(
        project,
        "BOOK",
        {
          title: "Strengthen secondary arcs",
          severity: "HIGH",
          explanation: "The book has too few active plot threads to create a rich Bell-style web of promises and payoffs.",
          whatToAdd: "Introduce or strengthen at least one secondary pressure line that intersects with the main conflict.",
          whyItMatters: "Readers stay engaged when subplots and promises deepen the main line instead of leaving only one lane of movement.",
          fixInstruction: `Revise chapter ${midpointChapter.number} to strengthen or introduce a secondary arc that meaningfully intersects with the main conflict.`,
          targetChapterNumber: midpointChapter.number,
          targetChapterTitle: midpointChapter.title,
        },
        midpointChapter,
        recommendations.length,
      ),
    );
  }

  if ((!structureTypes.has("MIDPOINT") || !structureTypes.has("CLIMAX")) && midpointChapter) {
    recommendations.push(
      normalizeGuideRecommendation(
        project,
        "BOOK",
        {
          title: "Clarify structural turns",
          severity: "HIGH",
          explanation: "The structure map is missing one or more major Bell-style turns such as a midpoint shift or climax marker.",
          whatToAdd: "Strengthen a visible turn where the story reframes, sharpens, or escalates irreversibly.",
          whyItMatters: "Whole-book momentum weakens when the reader cannot feel the larger architecture tightening.",
          fixInstruction: `Revise chapter ${midpointChapter.number} so it carries a clearer midpoint-style turn or escalation that strengthens the book's structure.`,
          targetChapterNumber: midpointChapter.number,
          targetChapterTitle: midpointChapter.title,
        },
        midpointChapter,
        recommendations.length,
      ),
    );
  }

  if (missingSummaries.length > 0 && openingChapter) {
    recommendations.push(
      normalizeGuideRecommendation(
        project,
        "BOOK",
        {
          title: "Strengthen chapter-to-chapter carry-forward",
          severity: "MEDIUM",
          explanation: "Some chapters still do not have enough derived story-state support, which weakens whole-book continuity and pressure tracking.",
          whatToAdd: "Make sure each chapter ends with a meaningful shift that can be summarized and carried forward into the next lane of story pressure.",
          whyItMatters: "Bell-style propulsion relies on chapters handing tension forward instead of resetting.",
          fixInstruction: `Revise chapter ${openingChapter.number} so it closes on a clearer unresolved pressure line that carries more strongly into the next chapter.`,
          targetChapterNumber: openingChapter.number,
          targetChapterTitle: openingChapter.title,
        },
        openingChapter,
        recommendations.length,
      ),
    );
  }

  if (endingChapter && totalWords < project.bookSettings.targetBookLength * 0.55) {
    recommendations.push(
      normalizeGuideRecommendation(
        project,
        "BOOK",
        {
          title: "Build more connective escalation",
          severity: "MEDIUM",
          explanation: "The manuscript is still much shorter than the target, which often means some escalation lanes, reversals, or payoffs are underdeveloped.",
          whatToAdd: "Add one or two decisive complications or consequences that deepen the main line before the ending closes.",
          whyItMatters: "Commercial-fiction structure usually needs progressive tightening, not only a clean ending.",
          fixInstruction: `Revise chapter ${endingChapter.number} so the late-book pressure and payoff feel more fully earned and connected to the book's earlier promises.`,
          targetChapterNumber: endingChapter.number,
          targetChapterTitle: endingChapter.title,
        },
        endingChapter,
        recommendations.length,
      ),
    );
  }

  if (recommendations.length === 0 && endingChapter) {
    recommendations.push(
      normalizeGuideRecommendation(
        project,
        "BOOK",
        {
          title: "Sharpen the book's strongest pressure lane",
          severity: "LOW",
          explanation: "The book is broadly aligned, but one additional pass could tighten its strongest promise-and-payoff lane.",
          whatToAdd: "Choose the most important conflict line and make its setup/payoff chain slightly more explicit and consequential.",
          whyItMatters: "Even healthy books benefit from one more pass on escalation, clarity, and payoff timing.",
          fixInstruction: `Revise chapter ${endingChapter.number} to make the final payoff chain more forceful and clearly tied to the book's central promise.`,
          targetChapterNumber: endingChapter.number,
          targetChapterTitle: endingChapter.title,
        },
        endingChapter,
        recommendations.length,
      ),
    );
  }

  const strengths = [
    project.plotThreads.length >= 2 ? "The book already has multiple active plot threads." : "",
    structureTypes.has("CLIMAX") ? "The structure map already includes a climax marker." : "",
    project.characters.length >= 3 ? "The character set is broad enough to support layered interaction." : "",
    project.longTermMemoryItems.length > 0 ? "There is canon memory available to help sustain continuity." : "",
  ].filter(Boolean);

  const alignmentScore = clampScore(74 - recommendations.length * 7 + strengths.length * 4);

  return {
    scope: "BOOK",
    analyzedChapterId: null,
    analyzedChapterTitle: "",
    alignmentScore,
    verdict:
      alignmentScore >= 76
        ? "The book is broadly in line with the bestseller guide, but a few targeted structural upgrades could strengthen its commercial pull."
        : "The book has strong promise, but it still needs clearer structural pressure, carry-forward, and payoff planning to match the guide.",
    guideSummary:
      recommendations[0]?.explanation ??
      "The manuscript needs firmer story architecture, stronger escalation, and better payoff timing across chapters.",
    strengths:
      strengths.length > 0
        ? strengths
        : ["The manuscript already has enough story material to support a focused whole-book guide pass."],
    recommendations,
    sourceFramework: [
      "James Scott Bell guide",
    `${APP_NAME} commercial-fiction heuristics`,
      "LOCK, scenes, stakes, and page-turner review",
    ],
  };
}

function buildBookGuidePrompt(project: ProjectWorkspace) {
  const characterRows = project.characters
    .slice(0, 6)
    .map((character) =>
      `- ${character.name}: ${compactText([character.role, character.summary, character.goal, character.currentState.emotionalState].filter(Boolean).join(" | "), 170)}`,
    )
    .join("\n");
  const chapterRows = project.chapters
    .slice(0, 24)
    .map((chapter) => {
      const summary = getLatestChapterSummary(chapter) || chapter.outline || chapter.purpose || chapter.currentBeat;
      return `Chapter ${chapter.number}: ${chapter.title} | purpose: ${compactText(chapter.purpose || "Not set", 120)} | summary: ${compactText(summary || "No summary yet.", 180)} | words: ${chapter.wordCount}`;
    })
    .join("\n");
  const threadRows = project.plotThreads
    .slice(0, 8)
    .map((thread) => `- ${thread.title}: ${compactText(thread.summary || thread.promisedPayoff || "", 150)}`)
    .join("\n");
  const structureRows = project.structureBeats
    .slice(0, 8)
    .map((beat) => `- ${beat.label} (${beat.type}): ${compactText(beat.description || beat.notes || "", 140)}`)
    .join("\n");
  const continuityRows = project.continuityIssues
    .filter((issue) => issue.status === "OPEN")
    .slice(0, 6)
    .map((issue) => `- ${issue.title}: ${compactText(issue.description, 150)}`)
    .join("\n");
  const longTermRows = project.longTermMemoryItems
    .slice(0, 6)
    .map((item) => `- ${item.title}: ${compactText(item.content, 140)}`)
    .join("\n");

  return [
    "Task: Review the whole book against the James Scott Bell bestseller guide.",
    `You are ${APP_NAME}'s structured commercial-fiction reviewer. Diagnose alignment with Bell-style craft principles, especially LOCK, scene pressure, chapter momentum, structural turns, stakes, dialogue usefulness, and payoff logic.`,
    `Premise: ${compactText(project.premise, 220)}`,
    `Story brief: ${compactText(project.bookSettings.storyBrief, 260)}`,
    `Plot direction: ${compactText(project.bookSettings.plotDirection, 220)}`,
    project.bookSettings.themes.length ? `Themes: ${project.bookSettings.themes.join(" | ")}` : "",
    `Style guidance:\n${buildSystemGuidance(project)}`,
    `Scott Bell guide reference:\n${buildBellCraftReference("whole-book review")}`,
    characterRows ? `Key characters:\n${characterRows}` : "",
    chapterRows ? `Chapter lineup:\n${chapterRows}` : "",
    threadRows ? `Active plot threads:\n${threadRows}` : "",
    structureRows ? `Structure beats:\n${structureRows}` : "",
    continuityRows ? `Open continuity issues:\n${continuityRows}` : "",
    longTermRows ? `Canon memory highlights:\n${longTermRows}` : "",
    "Return strict JSON only. No markdown, no commentary, no fenced code block.",
    `Use this exact shape:\n${buildGuideJsonContract("book")}`,
    "Give 2 to 5 strengths and 2 to 5 recommendations.",
    "Each recommendation must name one existing target chapter number where the fix should be applied.",
    "The fixInstruction must be directly usable as a second AI revision prompt on that chapter.",
    "Be practical and specific about what to add, not vague.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildChapterGuideInstruction(chapter: ChapterRecord) {
  return [
      `Evaluate whether chapter ${chapter.number}: ${chapter.title} is aligned with the James Scott Bell bestseller guide and ${APP_NAME}'s commercial-fiction heuristics.`,
    "Focus on LOCK clarity, scene goal/conflict/outcome, chapter tension, character choice, dialogue usefulness, payoff/new-question balance, and ending momentum.",
    "Return strict JSON only. No markdown, no commentary, no fenced code block.",
    `Use this exact shape:\n${buildGuideJsonContract("chapter", chapter)}`,
    `For every recommendation, use targetChapterNumber ${chapter.number} and targetChapterTitle "${chapter.title}".`,
    "Give 2 to 5 strengths and 2 to 5 recommendations.",
    "Every recommendation must include a directly usable fixInstruction for a second AI revision pass on this chapter.",
    "Be concrete about what should be added or strengthened.",
  ].join("\n\n");
}

function describeDialogueBalanceForAction(project: ProjectWorkspace, actionType: AssistActionType) {
  const ratio = project.styleProfile.dialogueDescriptionRatio;

  if (ratio <= 2) {
    return actionType === "ADD_DIALOGUE" || actionType === "DESCRIPTION_TO_DIALOGUE"
      ? "Even when adding dialogue, keep the passage mostly descriptive and use only the minimum dialogue needed to carry the beat."
      : "Favor narration, interiority, and description over dialogue in this result.";
  }

  if (ratio <= 4) {
    return actionType === "ADD_DIALOGUE" || actionType === "DESCRIPTION_TO_DIALOGUE"
      ? "Add dialogue carefully, but keep description and action beats slightly dominant."
      : "Lean slightly toward narration and description rather than letting dialogue take over.";
  }

  if (ratio <= 6) {
    return "Keep dialogue and description in balanced proportion.";
  }

  if (ratio <= 8) {
    return actionType === "EXPAND"
      ? "Lean dialogue-forward where it helps the beat, but support it with tight action beats and selective description."
      : "Let dialogue carry more of the movement while preserving enough description to keep the scene grounded.";
  }

  return actionType === "EXPAND"
    ? "Make the passage strongly dialogue-driven where appropriate, using spoken exchange and brief action beats as the main engine of expansion."
    : "Make the result strongly dialogue-driven, with spoken exchange doing most of the dramatic work.";
}

function buildSelectionStyleInstruction(project: ProjectWorkspace, actionType: AssistActionType) {
  const style = project.styleProfile;

  return [
    "Honor every project style dial for this exact rewrite. These are active constraints, not optional hints.",
    "Treat the active chapter blueprint, story bible, story skeleton, long-term memory, short-term memory, plot threads, and continuity constraints as canon that this rewrite must preserve.",
    "Do not change names, roles, scene purpose, chronology, relationships, world rules, or established facts unless the writer explicitly instructs that change.",
    `Match prose density ${style.proseDensity}/10, pacing ${style.pacing}/10, darkness ${style.darkness}/10, romance ${style.romanceIntensity}/10, humor ${style.humorLevel}/10, action ${style.actionFrequency}/10, mystery ${style.mysteryDensity}/10, dialogue ratio ${style.dialogueDescriptionRatio}/10, and commercial pull ${style.literaryCommercialBalance}/10.`,
    describeDialogueBalanceForAction(project, actionType),
    "If characters speak in this result, make them sound like different real people with different habits, emotional pressure, and social instincts rather than one shared AI voice.",
    actionType === "EXPAND"
      ? "Stay attached to the exact selected moment. Do not introduce new plot turns, new chronology, or unrelated scene developments outside the selected span."
      : "",
    actionType === "SHARPEN_VOICE"
      ? "Make the result materially more voice-specific, not just lightly polished."
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function sanitizeGeneratedChapterText(project: ProjectWorkspace, chapter: ChapterRecord, value: string) {
  return sanitizeManuscriptText(value, {
    chapterTitle: chapter.title,
    chapterNumber: chapter.number,
    previousChapterDrafts: project.chapters
      .filter((entry) => entry.number < chapter.number)
      .map((entry) => entry.draft)
      .filter(Boolean),
  }).text;
}

function roughWordCount(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

function truncateText(value: string | null | undefined, maxLength: number) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

function normalizeComparableText(value: string) {
  return value
    .toLowerCase()
    .replace(/[`*_>#]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function overlapScore(left: string, right: string) {
  const leftWords = new Set(normalizeComparableText(left).split(" ").filter((word) => word.length >= 4));
  const rightWords = new Set(normalizeComparableText(right).split(" ").filter((word) => word.length >= 4));

  if (leftWords.size === 0 || rightWords.size === 0) {
    return 0;
  }

  let shared = 0;
  for (const word of leftWords) {
    if (rightWords.has(word)) {
      shared += 1;
    }
  }

  return shared / Math.max(leftWords.size, rightWords.size);
}

function capOutputTokens(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function wordBudgetToTokens(words: number, min: number, max: number) {
  return capOutputTokens(words * 1.45, min, max);
}

function chapterOutputTokenBudget(chapter: ChapterRecord) {
  const range = getChapterWordRange(chapter);
  return wordBudgetToTokens(range.max + 180, 1400, 12000);
}

function revisionOutputTokenBudget(chapter: ChapterRecord, sourceText: string) {
  const sourceWords = roughWordCount(sourceText);
  const range = getChapterWordRange(chapter);
  const targetWords = sourceWords > 0 ? Math.min(Math.max(sourceWords, range.min), range.max) : range.max;
  return wordBudgetToTokens(targetWords + 180, 1400, 12000);
}

function assistOutputTokenBudget(actionType: AssistActionType, selectionText: string) {
  const selectedWords = roughWordCount(selectionText);
  const baselineWords = selectedWords || 200;

  switch (actionType) {
    case "TIGHTEN":
      return wordBudgetToTokens(Math.max(Math.ceil(baselineWords / 3), 60), 120, 1200);
    case "EXPAND":
      return wordBudgetToTokens(baselineWords * 3, 320, 5200);
    case "ADD_DIALOGUE":
      return wordBudgetToTokens(baselineWords * 1.45, 260, 2400);
    case "DESCRIPTION_TO_DIALOGUE":
      return wordBudgetToTokens(baselineWords * 1.2, 240, 2200);
    case "NEXT_BEATS":
      return wordBudgetToTokens(Math.min(Math.max(baselineWords * 0.65, 90), 220), 180, 600);
    case "CONTINUE":
      return wordBudgetToTokens(Math.min(Math.max(baselineWords * 1.4, 200), 420), 260, 900);
    case "COACH":
      return wordBudgetToTokens(Math.min(Math.max(baselineWords * 0.85, 140), 260), 220, 760);
    case "SHARPEN_VOICE":
      return wordBudgetToTokens(baselineWords * 1.3, 220, 2400);
    case "IMPROVE_PROSE":
    case "ADD_TENSION":
      return wordBudgetToTokens(baselineWords * 1.18, 220, 2200);
    case "REPHRASE":
    case "CUSTOM_EDIT":
      return wordBudgetToTokens(baselineWords * 1.08, 200, 2200);
    default:
      return wordBudgetToTokens(baselineWords, 220, 1800);
  }
}

async function callProvider(
  provider: NonNullable<Awaited<ReturnType<typeof getProviderClient>>>,
  prompt: string,
  options: ProviderCallOptions = {},
) {
  const preferredModel =
    provider.label === "OpenRouter" && provider.model === "openrouter/free"
      ? OPENROUTER_VISIBLE_TEXT_FALLBACK_MODELS[0]
      : provider.model;

  if (provider.label === "OpenRouter") {
    try {
      const directChat = await callChatCompletion(provider, prompt, options, preferredModel);
      if (directChat) {
        return directChat;
      }
    } catch (error) {
      if (isRateLimitedProviderError(error)) {
        const fallbackText = await tryOpenRouterFallbackModels(provider, prompt, options);
        if (fallbackText) {
          return fallbackText;
        }
      }
      if (!isRetryableProviderError(error)) {
        throw error;
      }
    }
  }

  const retryDelaysMs = [0, 1800, 4200, 8500];
  let lastError: unknown = null;

  for (const [index, delay] of retryDelaysMs.entries()) {
    if (delay > 0) {
      await sleep(delay);
    }

    try {
      const response = await provider.client.responses.create({
        model: provider.model,
        input: prompt,
        ...(options.maxOutputTokens ? { max_output_tokens: options.maxOutputTokens } : {}),
      });

      const directText = extractTextFromResponsePayload(response);
      if (directText) {
        return directText;
      }

      if (!hasReasoningOnlyOutput(response)) {
        const chatText = await callChatCompletion(provider, prompt, options, provider.model);
        if (chatText) {
          return chatText;
        }
      }

      if (provider.label === "OpenRouter") {
        const fallbackText = await tryOpenRouterFallbackModels(provider, prompt, options);
        if (fallbackText) {
          return fallbackText;
        }
      }

      throw new Error(
        `The active model (${provider.model}) returned no visible text. Choose a text-producing model in AI settings.`,
      );
    } catch (error) {
      lastError = error;
      if (provider.label === "OpenRouter" && isRateLimitedProviderError(error)) {
        const fallbackText = await tryOpenRouterFallbackModels(provider, prompt, options);
        if (fallbackText) {
          return fallbackText;
        }
      }

      if (!isRetryableProviderError(error) || index === retryDelaysMs.length - 1) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("The live AI provider did not return a response.");
}

async function callChatCompletion(
  provider: NonNullable<Awaited<ReturnType<typeof getProviderClient>>>,
  prompt: string,
  options: ProviderCallOptions = {},
  modelOverride?: string,
) {
  const response = await provider.client.chat.completions.create({
    model: modelOverride ?? provider.model,
    messages: [{ role: "user", content: prompt }],
    ...(options.maxOutputTokens ? { max_tokens: options.maxOutputTokens } : {}),
  });

  return extractTextFromResponsePayload(response);
}

async function tryOpenRouterFallbackModels(
  provider: NonNullable<Awaited<ReturnType<typeof getProviderClient>>>,
  prompt: string,
  options: ProviderCallOptions,
) {
  for (const fallbackModel of OPENROUTER_VISIBLE_TEXT_FALLBACK_MODELS) {
    if (fallbackModel === provider.model) {
      continue;
    }

    try {
      const fallbackText = await callChatCompletion(provider, prompt, options, fallbackModel);
      if (fallbackText) {
        return fallbackText;
      }
    } catch {
      // Keep walking the free-model fallback chain until one responds with usable text.
    }
  }

  return null;
}

export async function generateTextWithProvider(prompt: string, options: ProviderCallOptions = {}) {
  const provider = await getProviderClient();
  if (!provider) {
    const setupStatus = await getProviderSetupStatus();
    if (setupStatus.requiresPersonalKey || !setupStatus.useMockFallback) {
      throw new Error(`${setupStatus.setupMessage} OpenRouter keys: ${setupStatus.openRouterSetupUrl}`);
    }

    return null;
  }

  return callProvider(provider, prompt, options);
}

function splitDraftParagraphs(value: string) {
  return value
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

async function repairChapterEndingIfNeeded(options: {
  project: ProjectWorkspace;
  chapter: ChapterRecord;
  context: ContextPackage;
  content: string;
}) {
  const assessment = assessManuscriptEnding(options.content);
  if (!assessment.needsRepair) {
    return options.content;
  }

  const paragraphs = splitDraftParagraphs(options.content);
  if (paragraphs.length === 0) {
    return options.content;
  }

  const tailParagraphCount = Math.min(3, paragraphs.length);
  const head = paragraphs.slice(0, Math.max(0, paragraphs.length - tailParagraphCount));
  const currentEnding = paragraphs.slice(-tailParagraphCount).join("\n\n");
  const bridge = head.slice(-2).join("\n\n");
  const repairInstruction = [
    `Repair only the ending of chapter ${options.chapter.number}: ${options.chapter.title}.`,
    buildChapterWordRangeInstruction(options.chapter),
    `Problem: ${assessment.reason ?? "The ending does not resolve as complete prose."}`,
    "Rewrite only the final 2 to 3 paragraphs so the chapter ends as complete prose with a finished final sentence and a stronger closing beat.",
    "Everything before this ending remains unchanged.",
    "Preserve canon, chronology, POV, scene facts, and the emotional line already in motion.",
    "Do not add meta prose, editorial notes, chapter-end labels, or bullet points.",
    bridge ? `Lead-in before the ending:\n${bridge}` : "",
    `Current ending to repair:\n${currentEnding}`,
    "Return only the rewritten ending paragraphs.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const repairPrompt = buildPromptEnvelope(
    "Repair chapter ending",
    options.project,
    options.context,
    repairInstruction,
    "Prioritize a grammatically complete final paragraph and a Bell-style closing beat with momentum.",
  );
  const tailWords = roughWordCount(currentEnding);
  const repairRaw = await generateTextWithProvider(repairPrompt, {
    maxOutputTokens: wordBudgetToTokens(Math.max(220, tailWords * 1.6), 320, 2200),
  });

  if (!repairRaw?.trim()) {
    return options.content;
  }

  const repairedEnding = sanitizeGeneratedChapterText(options.project, options.chapter, repairRaw);
  if (!repairedEnding.trim()) {
    return options.content;
  }

  const repairedAssessment = assessManuscriptEnding(repairedEnding);
  if (repairedAssessment.needsRepair) {
    return options.content;
  }

  return [...head, repairedEnding].join("\n\n").trim();
}

async function expandShortChapterIfNeeded(options: {
  project: ProjectWorkspace;
  chapter: ChapterRecord;
  context: ContextPackage;
  content: string;
}) {
  const words = roughWordCount(options.content);
  const range = getChapterWordRange(options.chapter);
  if (words >= range.min) {
    return options.content;
  }

  const expansionInstruction = [
    `The current full chapter draft is only about ${words} words, which is below the required range.`,
    buildChapterWordRangeInstruction(options.chapter),
    "Expand this full chapter until it lands inside the target range.",
    "Preserve the existing chronology, canon, POV, emotional line, and scene facts.",
    "Do not summarize, compress, or replace the chapter with a shorter version.",
    "Add real scene development, reactions, transitions, sensory detail, dialogue, and consequence where needed.",
    "Keep the opening and major events already present, but make the chapter feel fully built rather than abbreviated.",
    "Return only the full revised chapter prose.",
    `Current short chapter draft:\n${options.content}`,
  ].join("\n\n");

  const expansionPrompt = buildPromptEnvelope(
    "Expand under-length chapter draft",
    options.project,
    options.context,
    expansionInstruction,
    "You are repairing an under-length full chapter. Deliver a complete chapter inside the required word range without changing canon.",
  );
  const expandedRaw = await generateTextWithProvider(expansionPrompt, {
    maxOutputTokens: chapterOutputTokenBudget(options.chapter),
  });

  if (!expandedRaw?.trim()) {
    return options.content;
  }

  const expandedContent = sanitizeGeneratedChapterText(options.project, options.chapter, expandedRaw);
  if (!expandedContent.trim()) {
    return options.content;
  }

  return roughWordCount(expandedContent) > words ? expandedContent : options.content;
}

async function runPromptTask(options: {
  task: string;
  project: ProjectWorkspace;
  context: ContextPackage;
  instruction: string;
  roleInstruction?: string;
  maxOutputTokens?: number;
  mockContent?: string;
  clean?: (value: string) => string;
  chapter?: ChapterRecord;
  enforceOutlineDepth?: boolean;
  enforceChapterLength?: boolean;
  repairChapterEnding?: boolean;
}) {
  const prompt = buildPromptEnvelope(
    options.task,
    options.project,
    options.context,
    options.instruction,
    options.roleInstruction,
  );
  const raw = await generateTextWithProvider(prompt, {
    maxOutputTokens: options.maxOutputTokens,
  });
  const content = raw ?? options.mockContent ?? "";
  if (!content.trim()) {
    throw new Error("AI did not return any visible text.");
  }
  let cleaned = options.clean ? options.clean(content) : content.trim();

  if (options.enforceOutlineDepth && options.chapter && cleaned.trim()) {
    cleaned = await repairThinOutlineIfNeeded({
      project: options.project,
      chapter: options.chapter,
      context: options.context,
      content: cleaned,
    });
  }

  if (options.enforceChapterLength && options.chapter && cleaned.trim()) {
    cleaned = await expandShortChapterIfNeeded({
      project: options.project,
      chapter: options.chapter,
      context: options.context,
      content: cleaned,
    });
  }

  if (options.repairChapterEnding && options.chapter && cleaned.trim()) {
    cleaned = await repairChapterEndingIfNeeded({
      project: options.project,
      chapter: options.chapter,
      context: options.context,
      content: cleaned,
    });
  }

  return {
    content: cleaned.trim() ? cleaned : content.trim(),
    contextPackage: options.context,
  };
}

async function repairThinOutlineIfNeeded(options: {
  project: ProjectWorkspace;
  chapter: ChapterRecord;
  context: ContextPackage;
  content: string;
}) {
  const currentWords = roughWordCount(options.content);
  const numberedSteps = (options.content.match(/^\s*(?:\d+[\).\:-]|[-*])\s+/gm) ?? []).length;
  const normalized = options.content.trim().toLowerCase();
  const seemsMeta =
    normalized.includes("i would") ||
    normalized.includes("the chapter should") ||
    normalized.includes("this outline") ||
    normalized.includes("here's") ||
    normalized.includes("let's");
  const seemsThin = currentWords < 110 || numberedSteps < 4 || seemsMeta;
  if (!seemsThin) {
    return options.content;
  }

  const repairPrompt = buildPromptEnvelope(
    "Repair thin chapter outline",
    options.project,
    options.context,
    [
      formatChapterInstruction(options.chapter, "outline"),
      "The previous outline was too thin or incomplete.",
      "Return a stronger scene-by-scene outline with at least 6 concrete numbered beats.",
      "Each beat should say what happens, what pressure changes, and why the reader has to keep going.",
      "Do not give vague headings only. Do not return notes about how you would outline it. Return the actual outline.",
      "Previous outline:",
      options.content,
    ].join("\n\n"),
  );
  const repairedRaw = await generateTextWithProvider(repairPrompt, {
    maxOutputTokens: Math.max(1400, wordBudgetToTokens(260, 500, 2200)),
  });
  const repaired = repairedRaw ? cleanStructuredText(repairedRaw) : "";
  return roughWordCount(repaired) > currentWords ? repaired : options.content;
}

async function enforceInlineLengthIfNeeded(options: {
  project: ProjectWorkspace;
  context: ContextPackage;
  actionType: AssistActionType;
  selectionText: string;
  content: string;
}) {
  const sourceWords = roughWordCount(options.selectionText);
  const currentWords = roughWordCount(options.content);

  if (!sourceWords || !currentWords) {
    return options.content;
  }

  if (options.actionType === "EXPAND") {
    const targetWords = Math.max(sourceWords * 3, sourceWords + 12);
    const minimumAcceptable = Math.ceil(targetWords * 0.82);
    if (currentWords >= minimumAcceptable) {
      return options.content;
    }

    const repairPrompt = buildPromptEnvelope(
      "Repair expand length",
      options.project,
      options.context,
      [
        "Rewrite only the selected text.",
        "The previous result was too short.",
        `Original selected text word count: ${sourceWords}.`,
        `Your new result must land near ${targetWords} words, and not below ${minimumAcceptable} words.`,
        "Do not append outside the selected moment. Rebuild the same selected passage at greater depth and with richer progression.",
        "Preserve the same continuity, chronology, scene facts, and local speaker set.",
        "Return only the replacement prose.",
        "Selected text:",
        options.selectionText,
      ].join("\n\n"),
    );
    const repairedRaw = await generateTextWithProvider(repairPrompt, {
      maxOutputTokens: wordBudgetToTokens(targetWords, 420, 6200),
    });
    const repaired = repairedRaw ? cleanInlineSuggestionText(repairedRaw) : "";
    return roughWordCount(repaired) > currentWords ? repaired : options.content;
  }

  if (options.actionType === "TIGHTEN") {
    const targetWords = Math.max(Math.ceil(sourceWords / 3), 8);
    const maximumAcceptable = Math.max(Math.ceil(targetWords * 1.35), targetWords + 4);
    if (currentWords <= maximumAcceptable) {
      return options.content;
    }

    const repairPrompt = buildPromptEnvelope(
      "Repair tighten length",
      options.project,
      options.context,
      [
        "Rewrite only the selected text.",
        "The previous result was still too long.",
        `Original selected text word count: ${sourceWords}.`,
        `Your new result must land near ${targetWords} words, and stay at or below ${maximumAcceptable} words.`,
        "Keep the core meaning, continuity, and scene logic, but compress hard.",
        "Return only the replacement prose.",
        "Selected text:",
        options.selectionText,
      ].join("\n\n"),
    );
    const repairedRaw = await generateTextWithProvider(repairPrompt, {
      maxOutputTokens: wordBudgetToTokens(maximumAcceptable, 120, 1400),
    });
    const repaired = repairedRaw ? cleanInlineSuggestionText(repairedRaw) : "";
    return roughWordCount(repaired) < currentWords ? repaired : options.content;
  }

  return options.content;
}

async function enforceTensionIfNeeded(options: {
  project: ProjectWorkspace;
  context: ContextPackage;
  selectionText: string;
  content: string;
}) {
  const selectedWords = roughWordCount(options.selectionText);
  const currentWords = roughWordCount(options.content);
  const similarity = overlapScore(options.selectionText, options.content);
  const isTooClose = similarity >= 0.82 || currentWords <= Math.max(selectedWords + 6, Math.ceil(selectedWords * 1.08));

  if (!isTooClose) {
    return options.content;
  }

  const repairPrompt = buildPromptEnvelope(
    "Repair tension pass",
    options.project,
    options.context,
    [
      "Rewrite only the selected text so the scene pressure is materially stronger, not just cosmetically rephrased.",
      "Follow Bell-style scene craft: clarify what the focal character wants right now, strengthen what pushes back, increase worry, sharpen the possibility of loss, and make the passage end in a more pressured state than it began.",
      "Add real friction through resistance, uncertainty, threat, time pressure, subtext, bad options, or emotionally loaded reaction beats.",
      "Do not simply restate the same beats with synonyms.",
      "Preserve continuity, chronology, and scene facts, but make the pressure rise visibly on the page.",
      "Return only the replacement prose.",
      "Original selected text:",
      options.selectionText,
    ].join("\n\n"),
  );
  const repairedRaw = await generateTextWithProvider(repairPrompt, {
    maxOutputTokens: wordBudgetToTokens(Math.max(Math.ceil(selectedWords * 1.35), selectedWords + 24), 240, 2400),
  });
  const repaired = repairedRaw ? cleanInlineSuggestionText(repairedRaw) : "";
  return repaired.trim() && overlapScore(options.selectionText, repaired) < similarity ? repaired : options.content;
}

function mockOutline(project: ProjectWorkspace, chapterTitle: string, context: ContextPackage) {
  return [
    `1. Hook the chapter with ${chapterTitle} starting inside active pressure.`,
    `2. Bring in ${context.activePlotThreads[0]?.title ?? "the main plot thread"} before the midpoint.`,
    `3. Force a choice that complicates ${context.continuityConstraints[0]?.relatedEntity || "the current promise"}.`,
    "4. End with a revelation, sharper question, or practical setback that carries the reader forward.",
  ].join("\n");
}

function mockDraft(project: ProjectWorkspace, context: ContextPackage, chapterTitle: string) {
  return [
    `${chapterTitle}`,
    "",
    `${context.previousChapterSummary ? `The truth from the last chapter still throbbed at the edges of the scene. ` : ""}${project.characters[0]?.name ?? "The protagonist"} moved before certainty could harden into panic, carrying ${context.activePlotThreads[0]?.title.toLowerCase() ?? "the problem"} deeper into the city.`,
    "",
    `The chapter turns around ${context.chapterGoal.toLowerCase()}. Use ${project.styleProfile.aestheticGuide.toLowerCase()} to keep the atmosphere specific, then let the pressure come from a choice rather than exposition.`,
    "",
    `By the close, ${context.continuityConstraints[0]?.suggestedContext || "the immediate conflict should sharpen into the next chapter's demand"}.`,
  ].join("\n");
}

function mockCoach(context: ContextPackage, instruction: string) {
  return [
    "Coach note:",
    instruction || "Keep the chapter moving while preserving continuity.",
    "",
    `Use the next scene to pressure ${context.activePlotThreads[0]?.title ?? "the main tension"} through action, not summary.`,
    `Carry forward ${context.recentShortTermMemory[0]?.title ?? "the most recent emotional movement"} so the chapter feels connected.`,
    "If you feel stuck, write the next choice first, then backfill description around it.",
  ].join("\n");
}

function mockRevision(actionType: AssistActionType, selectionText: string, instruction: string) {
  const seed = selectionText || instruction;
  return `${seed}\n\n[${APP_NAME} ${actionType.toLowerCase()} pass] Heighten specificity, sharpen the beat change, and keep the sentence rhythm a little more tensile.`;
}

function buildAssistActionInstruction(actionType: AssistActionType) {
  switch (actionType) {
    case "TIGHTEN":
      return [
        "Rewrite only the selected text so the final result is approximately one third of the original word count.",
        "Cut hard and decisively, not gently.",
        "Preserve the core meaning, continuity, scene logic, and voice, but strip everything nonessential.",
        "Do not summarize vaguely. Keep the surviving language vivid, precise, and readable.",
      ].join(" ");
    case "EXPAND":
      return [
        "Rewrite and expand only the selected text.",
        "Do not merely append a sentence to the end.",
        "Internally break the selected passage into five micro-parts or beats, then rebuild all five with richer detail, stronger transitions, added texture, and clearer emotional movement.",
        "Increase the total length to approximately three times the original selected word count while preserving the same underlying event, chronology, and meaning.",
        "Keep the same dramatic center, speaker set, and local scene situation unless the selected text itself already changes them.",
        "Respect the project's dialogue-versus-description settings while expanding.",
      ].join(" ");
    case "IMPROVE_PROSE":
      return [
        "Rewrite only the selected text with materially stronger prose, not a light polish.",
        "Increase specificity, sensory clarity, rhythm, subtext, and emotional precision.",
        "Prefer sharp concrete choices over generic phrasing, and make the passage feel written by a human novelist rather than a neutral assistant.",
      ].join(" ");
    case "SHARPEN_VOICE":
      return [
        "Rewrite only the selected text so the voice becomes unmistakably more specific and character-driven.",
        "Make larger changes than a light polish: shift diction, syntax, rhythm, directness, subtext, and verbal habits as needed.",
        "Preserve the scene facts and continuity, but make the voice clearly more distinctive.",
        "If multiple characters speak, pull them farther apart so they no longer sound like the same person with minor wording changes.",
        "Make the emotional pressure audible in how each person chooses words, evades, blurts, flatters, hedges, or attacks.",
      ].join(" ");
    case "ADD_TENSION":
      return [
        "Rewrite only the selected text so the pressure rises in a real Bell-style way, not as a light rewording.",
        "Clarify what the focal character wants in this moment, what pushes back, and how the resistance gets worse on the page.",
        "Increase worry through opposition, uncertainty, subtext, bad options, time pressure, exposure, threat, or emotional consequence.",
        "Make the end of the selected passage more pressured than the beginning.",
        "Do not merely substitute sharper adjectives or slightly harsher wording.",
      ].join(" ");
    case "ADD_DIALOGUE":
      return [
        "Rewrite only the selected text so it contains stronger on-page dialogue.",
        "Use the chapter context, character dossiers, and current scene logic to decide who is most likely speaking.",
        "If a speaker lacks a full dossier, infer their voice from role, class, education, origin, and emotional pressure in the scene.",
        "Make the dialogue specific, dramatically useful, and natural for the characters involved.",
        "Each speaker should sound recognizably different in rhythm, directness, vocabulary, and emotional control.",
        "Use standard double quotation marks for every spoken line and make sure each one closes correctly.",
        "Avoid generic polished exchanges. Let people interrupt, deflect, misunderstand, or speak past one another when that fits the relationship.",
        "Preserve the same scene purpose and continuity.",
      ].join(" ");
    case "DESCRIPTION_TO_DIALOGUE":
      return [
        "Convert the selected descriptive or expository passage into dialogue and brief action beats.",
        "Preserve the same information, emotional intent, and scene logic.",
        "Use the most likely speaking characters based on the chapter context and their dossiers.",
        "If a likely speaker lacks a full dossier, infer a plausible voice from role, class, education, origin, and emotional pressure in the scene.",
        "Make the exchange sound natural and in-character.",
        "Use standard double quotation marks for every spoken line and make sure each one closes correctly.",
        "Do not make everyone sound equally articulate, equally calm, or equally explanatory.",
      ].join(" ");
    case "CUSTOM_EDIT":
      return "Follow the writer's instruction exactly on the selected text while preserving continuity, scene logic, and character-specific human voice.";
    case "REPHRASE":
      return "Rephrase only the selected text without changing its meaning.";
    default:
      return `Perform ${actionType.toLowerCase()} on the selected text.`;
  }
}

function buildAssistScopedInstruction(
  project: ProjectWorkspace,
  actionType: AssistActionType,
  instruction: string,
  beforeSelection = "",
  afterSelection = "",
) {
  const actionInstruction = buildAssistActionInstruction(actionType);
  const boundaryInstruction =
    beforeSelection.trim() || afterSelection.trim()
      ? [
          "Use the text immediately before and after the selected span as continuity boundaries.",
          "Understand what comes before and what comes after so the replacement fits naturally between them.",
          "Do not repeat, restate, or paraphrase the adjacent sentences just because they appear in context.",
          "Write only the replacement for the selected span itself.",
          beforeSelection.trim() ? `Immediate text before selection: ${beforeSelection.trim().slice(-280)}` : "",
          afterSelection.trim() ? `Immediate text after selection: ${afterSelection.trim().slice(0, 280)}` : "",
        ]
          .filter(Boolean)
          .join(" ")
      : "";

  if (actionType === "CONTINUE") {
    return [
      buildSelectionStyleInstruction(project, actionType),
      instruction || "Continue from the cursor.",
      boundaryInstruction,
      "Return only the new continuation text.",
      "Do not repeat the existing passage or add commentary.",
    ].join(" ");
  }

  if (actionType === "NEXT_BEATS") {
    return [
      buildSelectionStyleInstruction(project, actionType),
      instruction || "Suggest the next beats.",
      "Return only the suggested beats, with no prefatory explanation.",
    ].join(" ");
  }

  return [
    buildSelectionStyleInstruction(project, actionType),
    instruction || actionInstruction,
    boundaryInstruction,
    actionType === "CUSTOM_EDIT"
      ? "Treat the writer's custom instruction as the top priority for the selected text."
      : "",
    "Never describe what you are about to do.",
    "Never explain the style plan, continuity plan, or reasoning.",
    "Never mention the selected text, the rewrite process, the prompt, the instruction, or the surrounding context.",
    "Do not say things like 'we need to rewrite', 'the rewrite should', 'we must apply style', or 'should we italicize'.",
    "Return only the rewritten replacement text for the selected span.",
    "Do not repeat unchanged text from before or after the selection.",
    "Do not add commentary, labels, markdown, or wrapper quotation marks around the whole answer.",
    "Use normal dialogue quotation marks inside the prose whenever characters speak.",
    "If the selected text contains internal thought, keep it clearly interior and italicized rather than spoken aloud.",
    "Do not leave unmatched closing or opening quotation marks in the returned prose.",
  ]
    .filter(Boolean)
    .join(" ");
}

export async function generateStoryPlan(projectId: string) {
  const project = await getProjectWorkspace(projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  const context = buildContextPackage(project, project.chapters[0]?.id ?? "");
  return runPromptTask({
    task: "Generate a story plan",
    project,
    context,
    instruction: "Create a compact commercial-fiction story plan with act movement, core promises, and likely chapter lanes.",
    maxOutputTokens: 1200,
    mockContent: [
      "Act I: Sil discovers that the observatory's lateness is a pattern, not a mistake.",
      "Act II: Evidence widens into conspiracy; Tav's fragments and Orin's past become leverage.",
      "Act III: The engine's blind spot becomes public at a personal cost, forcing a new model of truth.",
    ].join("\n"),
  });
}

export async function generateChapterOutline(projectId: string, chapterId: string, additionalInstruction = "") {
  const project = await getProjectWorkspace(projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  const chapter = getChapterById(project, chapterId);
  if (!chapter) {
    throw new Error("Chapter not found.");
  }

  const context = buildContextPackage(project, chapterId);
  return runPromptTask({
    task: "Generate chapter outline",
    project,
    context,
    instruction: withAdditionalInstruction(formatChapterInstruction(chapter, "outline"), additionalInstruction),
    maxOutputTokens: 1100,
    mockContent: mockOutline(project, chapter.title, context),
    clean: cleanStructuredText,
    chapter,
    enforceOutlineDepth: true,
  });
}

export async function generateChapterDraft(projectId: string, chapterId: string, additionalInstruction = "") {
  const project = await getProjectWorkspace(projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  const chapter = getChapterById(project, chapterId);
  if (!chapter) {
    throw new Error("Chapter not found.");
  }

  const context = buildContextPackage(project, chapterId);
  return runPromptTask({
    task: "Generate chapter draft",
    project,
    context,
    instruction: withAdditionalInstruction(formatChapterInstruction(chapter, "draft"), additionalInstruction),
    maxOutputTokens: chapterOutputTokenBudget(chapter),
    mockContent: mockDraft(project, context, chapter.title),
    clean: (value) => sanitizeGeneratedChapterText(project, chapter, value),
    chapter,
    enforceChapterLength: true,
    repairChapterEnding: true,
  });
}

export async function reviseChapter(
  projectId: string,
  chapterId: string,
  instruction: string,
  actionType: AssistActionType = "REVISE",
  role: AiRole = "DEVELOPMENTAL_EDITOR",
) {
  const project = await getProjectWorkspace(projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  const chapter = getChapterById(project, chapterId);
  if (!chapter) {
    throw new Error("Chapter not found.");
  }

  const context = buildContextPackage(project, chapterId, chapter.draft);
  return runPromptTask({
    task: "Revise chapter",
    project,
    context,
    instruction: buildFullChapterRevisionInstruction(chapter, instruction),
    roleInstruction: getRoleInstruction(role),
    maxOutputTokens: revisionOutputTokenBudget(chapter, chapter.draft),
    mockContent: mockRevision(actionType, chapter.draft, instruction),
    clean: (value) => sanitizeGeneratedChapterText(project, chapter, value),
    chapter,
    enforceChapterLength: true,
    repairChapterEnding: true,
  });
}

export async function coachWriter(projectId: string, chapterId: string, instruction: string, role: AiRole = "WRITING_COACH") {
  const project = await getProjectWorkspace(projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  const chapter = getChapterById(project, chapterId);
  if (!chapter) {
    throw new Error("Chapter not found.");
  }

  const context = buildContextPackage(project, chapterId, chapter.draft);
  return runPromptTask({
    task: "Coach the writer",
    project,
    context,
    instruction,
    roleInstruction: getRoleInstruction(role),
    maxOutputTokens: 700,
    mockContent: mockCoach(context, instruction),
  });
}

export async function assistSelection(input: {
  projectId: string;
  chapterId: string;
  mode: AssistMode;
  role: AiRole;
  actionType: AssistActionType;
  selectionText: string;
  instruction: string;
  localExcerpt?: string;
  beforeSelection?: string;
  afterSelection?: string;
}) {
  const project = await getProjectWorkspace(input.projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  const context = buildContextPackage(project, input.chapterId, input.localExcerpt || input.selectionText);
  const result = await runPromptTask({
    task: `${input.actionType} selected text`,
    project,
    context,
    instruction: buildAssistScopedInstruction(
      project,
      input.actionType,
      input.instruction,
      input.beforeSelection,
      input.afterSelection,
    ),
    roleInstruction: getRoleInstruction(input.role),
    maxOutputTokens: assistOutputTokenBudget(input.actionType, input.selectionText),
    mockContent: mockRevision(input.actionType, input.selectionText, input.instruction),
    clean: (value) =>
      cleanInlineSuggestionAgainstContext(value, {
        beforeSelection: input.beforeSelection,
        afterSelection: input.afterSelection,
      }),
  });
  const enforcedContent = await enforceInlineLengthIfNeeded({
    project,
    context,
    actionType: input.actionType,
    selectionText: input.selectionText,
    content: result.content,
  });
  const tensionSafeContent =
    input.actionType === "ADD_TENSION"
      ? await enforceTensionIfNeeded({
          project,
          context,
          selectionText: input.selectionText,
          content: enforcedContent,
        })
      : enforcedContent;
  return {
    ...result,
    content: tensionSafeContent,
  };
}

export async function reviewChapterWithBestsellerGuide(projectId: string, chapterId: string) {
  const project = await getProjectWorkspace(projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  const chapter = getChapterById(project, chapterId);
  if (!chapter) {
    throw new Error("Chapter not found.");
  }

  const context = buildContextPackage(project, chapterId, chapter.draft);
  const prompt = buildPromptEnvelope(
    "Review chapter against bestseller guide",
    project,
    context,
    buildChapterGuideInstruction(chapter),
    getRoleInstruction("STORY_DOCTOR"),
  );
  const raw = await generateTextWithProvider(prompt, { maxOutputTokens: 1800 });
  return normalizeGuideReport(project, "CHAPTER", raw ? extractJsonObject(raw) : null, chapter) ?? buildChapterGuideFallback(project, chapter);
}

export async function reviewBookWithBestsellerGuide(projectId: string) {
  const project = await getProjectWorkspace(projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  const raw = await generateTextWithProvider(buildBookGuidePrompt(project), { maxOutputTokens: 2200 });
  return normalizeGuideReport(project, "BOOK", raw ? extractJsonObject(raw) : null, null) ?? buildBookGuideFallback(project);
}

export async function summarizeChapter(projectId: string, chapterId: string): Promise<MemoryExtractionResult> {
  const project = await getProjectWorkspace(projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  const chapter = getChapterById(project, chapterId);
  if (!chapter) {
    throw new Error("Chapter not found.");
  }

  const cleanedDraft = sanitizeManuscriptText(chapter.draft, {
    chapterTitle: chapter.title,
    chapterNumber: chapter.number,
    previousChapterDrafts: project.chapters
      .filter((entry) => entry.number < chapter.number)
      .map((entry) => entry.draft)
      .filter(Boolean),
  }).text;
  const summary = cleanedDraft
    .split(/(?<=[.!?])\s+/)
    .slice(0, 2)
    .join(" ")
    .trim();

  return {
    summary: cleanSummaryText(summary || chapter.outline || chapter.purpose),
    emotionalTone: chapter.desiredMood || project.bookSettings.tone,
    candidates: [],
  };
}

export async function getAiModeLabel() {
  const provider = await getProviderClient();
  if (provider) {
    return provider.label;
  }

  const setupStatus = await getProviderSetupStatus();
  return setupStatus.useMockFallback && !setupStatus.requiresPersonalKey ? "Mock AI" : "AI setup required";
}

function parseSuggestionJson(raw: string): CharacterInterpretationSuggestion[] | null {
  const cleaned = raw.replace(/```json|```/gi, "").trim();
  const candidates = [cleaned];
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start >= 0 && end > start) {
    candidates.push(cleaned.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as CharacterInterpretationSuggestion[];
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item) =>
            typeof item?.key === "string" &&
            typeof item?.label === "string" &&
            typeof item?.value === "string" &&
            typeof item?.reason === "string",
        );
      }
    } catch {
      continue;
    }
  }

  return null;
}

function getCharacterPathValue(character: CharacterRecord, path: string): string {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") {
      return "";
    }
    return (current as Record<string, unknown>)[segment];
  }, character) as string;
}

function mergeCharacterSuggestions(
  primary: CharacterInterpretationSuggestion[],
  secondary: CharacterInterpretationSuggestion[],
) {
  const merged: CharacterInterpretationSuggestion[] = [];
  const seen = new Set<string>();

  for (const suggestion of [...primary, ...secondary]) {
    const key = suggestion.key.trim().toLowerCase();
    if (!key || seen.has(key) || !suggestion.value.trim()) {
      continue;
    }
    seen.add(key);
    merged.push(suggestion);
  }

  return merged;
}

function mockCharacterInterpretation(character: CharacterRecord): CharacterInterpretationSuggestion[] {
  const text = `${character.summary}\n${character.goal}\n${character.fear}\n${character.secret}\n${character.wound}\n${character.dossier.freeTextCore}\n${character.notes}`.toLowerCase();
  const roleText = [
    character.role,
    character.archetype,
    character.quickProfile.profession,
    character.dossier.lifePosition.profession,
    character.dossier.lifePosition.roleTitle,
  ]
    .join(" ")
    .toLowerCase();
  const suggestions: CharacterInterpretationSuggestion[] = [];
  const addSuggestion = (suggestion: CharacterInterpretationSuggestion) => {
    if (!suggestion.value.trim() || getCharacterPathValue(character, suggestion.key)) {
      return;
    }
    if (suggestions.some((entry) => entry.key === suggestion.key)) {
      return;
    }
    suggestions.push(suggestion);
  };

  if (!character.quickProfile.profession.trim() && character.role.trim()) {
    addSuggestion({
      key: "quickProfile.profession",
      label: "Profession",
      value: character.role.trim(),
      reason: "The visible role field is filled, but the quick profile still lacks the profession that helps the AI keep the character grounded in dialogue and scene work.",
    });
  }

  if (!character.dossier.lifePosition.profession.trim() && (character.role.trim() || character.quickProfile.profession.trim())) {
    addSuggestion({
      key: "dossier.lifePosition.profession",
      label: "Life-position profession",
      value: character.role.trim() || character.quickProfile.profession.trim(),
      reason: "The dossier should restate the character's profession inside the life-position section so planning and continuity tools can retrieve it reliably.",
    });
  }

  if (!character.dossier.lifePosition.socialClass.trim()) {
    let socialClass = "";
    if (/(king|queen|prince|princess|duke|duchess|count|countess|baron|baroness|lord|lady|noble|royal|emperor|empress)/.test(roleText)) {
      socialClass = "aristocratic / ruling elite";
    } else if (/(priest|rabbi|cleric|scholar|scribe|doctor|magistrate|professor|judge|lawyer|teacher)/.test(roleText)) {
      socialClass = "educated professional / clerical class";
    } else if (/(captain|commander|officer|sergeant|soldier|guard|watchman)/.test(roleText)) {
      socialClass = "professional martial class";
    } else if (/(smuggler|thief|beggar|dock|laborer|servant|street|miner|farmer)/.test(roleText)) {
      socialClass = "working or precarious class";
    }
    if (socialClass) {
      addSuggestion({
        key: "dossier.lifePosition.socialClass",
        label: "Social class",
        value: socialClass,
        reason: "Role and status cues in the character record imply a social position that should shape power, access, and the way this person speaks.",
      });
    }
  }

  if (!character.dossier.speechLanguage.formalityLevel.trim()) {
    let formality = "";
    if (/(king|queen|prince|princess|duke|duchess|count|countess|baron|baroness|lord|lady|noble|royal|ambassador|diplomat)/.test(roleText)) {
      formality = "formal, controlled, and status-conscious";
    } else if (/(priest|rabbi|cleric|scholar|scribe|judge|magistrate|doctor)/.test(roleText)) {
      formality = "precise and educated, usually formal in public";
    } else if (/(captain|commander|officer|sergeant|soldier|guard)/.test(roleText)) {
      formality = "brief and practical, formal when hierarchy matters";
    } else if (/(smuggler|thief|dock|street|laborer|servant)/.test(roleText)) {
      formality = "casual and flexible, shifting with danger and status";
    }
    if (formality) {
      addSuggestion({
        key: "dossier.speechLanguage.formalityLevel",
        label: "Formality level",
        value: formality,
        reason: "The character's role and social position imply a speech register that should be explicit in the dossier so dialogue does not flatten into the same voice as everyone else.",
      });
    }
  }

  if (!character.dossier.speechLanguage.directness.trim()) {
    let directness = "";
    if (/(captain|commander|officer|sergeant|soldier|guard|watchman)/.test(roleText)) {
      directness = "direct, clipped, and action-first";
    } else if (/(diplomat|courtier|noble|ambassador|politician)/.test(roleText)) {
      directness = "indirect, strategic, and careful around the real point";
    } else if (/(priest|rabbi|cleric|scholar|judge|magistrate)/.test(roleText)) {
      directness = "measured and exact, with meaning built through careful qualification";
    }
    if (directness) {
      addSuggestion({
        key: "dossier.speechLanguage.directness",
        label: "Directness",
        value: directness,
        reason: "A clear directness pattern helps the AI keep the character's speech recognizably their own instead of defaulting to neutral exposition.",
      });
    }
  }

  if (!character.quickProfile.speechPattern.trim()) {
    let speechPattern = "";
    if (/(captain|commander|officer|sergeant|soldier|guard)/.test(roleText)) {
      speechPattern = "short commands, practical observations, little wasted language";
    } else if (/(noble|royal|ambassador|courtier)/.test(roleText)) {
      speechPattern = "measured, layered, and status-aware, with implication doing half the work";
    } else if (/(priest|rabbi|cleric|scholar|scribe|judge)/.test(roleText)) {
      speechPattern = "careful, articulate, and slightly over-explanatory when precision matters";
    } else if (/(smuggler|thief|dock|street|beggar)/.test(roleText)) {
      speechPattern = "quick, adaptive, and edged with deflection";
    }
    if (speechPattern) {
      addSuggestion({
        key: "quickProfile.speechPattern",
        label: "Speech pattern",
        value: speechPattern,
        reason: "A quick speech pattern gives the drafting tools a fast, reusable voice anchor for this character.",
      });
    }
  }

  if (!character.dossier.personalityBehavior.conflictStyle.trim() && /(captain|commander|officer|sergeant|soldier|guard|watchman)/.test(roleText)) {
    addSuggestion({
      key: "dossier.personalityBehavior.conflictStyle",
      label: "Conflict style",
      value: "presses for clarity fast, prefers action over debate, and treats hesitation as danger",
      reason: "A martial background should shape how the character behaves under pressure, not just what uniform they wear.",
    });
  }

  if (!character.dossier.speechLanguage.superiorSpeech.trim()) {
    addSuggestion({
      key: "dossier.speechLanguage.superiorSpeech",
      label: "Speech to superiors",
      value: /(noble|royal|courtier|ambassador)/.test(roleText)
        ? "controlled, polished, and layered with deference or careful challenge"
        : "more careful, less expansive, and alert to hierarchy",
      reason: "The AI needs an explicit contrast between how this character speaks upward versus sideways.",
    });
  }

  if (!character.dossier.speechLanguage.inferiorSpeech.trim()) {
    addSuggestion({
      key: "dossier.speechLanguage.inferiorSpeech",
      label: "Speech to inferiors",
      value: /(captain|commander|officer|sergeant|guard)/.test(roleText)
        ? "directive, practical, and sparing with explanation"
        : "more relaxed and less filtered, unless status anxiety makes them perform authority",
      reason: "This helps the dialogue engine vary speech by relationship and status instead of making every conversation sound the same.",
    });
  }

  if (!character.dossier.speechLanguage.lovedOnesSpeech.trim()) {
    addSuggestion({
      key: "dossier.speechLanguage.lovedOnesSpeech",
      label: "Speech to loved ones",
      value: "less guarded, more revealing, and more likely to let unfinished thoughts slip through",
      reason: "A private speech mode gives the AI a believable emotional contrast for intimate scenes.",
    });
  }

  if (!character.dossier.speechLanguage.scaredSpeech.trim()) {
    addSuggestion({
      key: "dossier.speechLanguage.scaredSpeech",
      label: "Scared speech",
      value: /(captain|commander|officer|sergeant|soldier|guard)/.test(roleText)
        ? "gets even shorter, more procedural, and more controlling"
        : "speeds up, narrows, and starts choosing safer half-truths",
      reason: "Fear should change cadence and wording in a specific way, not just add exclamation marks.",
    });
  }

  if (!character.dossier.personalityBehavior.emotionalTendencies.trim() && (character.fear.trim() || character.wound.trim() || character.secret.trim())) {
    addSuggestion({
      key: "dossier.personalityBehavior.emotionalTendencies",
      label: "Emotional tendencies",
      value: "usually controlled, but stress pushes the buried fear and wound closer to the surface",
      reason: "The record already shows fear, wound, or secrecy, so the dossier should explain how that pressure leaks into behavior.",
    });
  }

  if (text.includes("indirect") || text.includes("talks in circles") || text.includes("evasive")) {
    addSuggestion({
      key: "quickProfile.speechPattern",
      label: "Speech pattern",
      value: "indirect / evasive",
      reason: "The free-text notes describe speech that circles around the point and avoids direct statements.",
    });
  }

  if (text.includes("sarcastic")) {
    addSuggestion({
      key: "dossier.speechLanguage.descriptors",
      label: "Speech descriptors",
      value: "sarcastic",
      reason: "The notes explicitly describe sarcasm as part of the character's speech style.",
    });
  }

  if (text.includes("warm") || text.includes("kind")) {
    addSuggestion({
      key: "dossier.personalityBehavior.coreTraits",
      label: "Core traits",
      value: "warm",
      reason: "The free-text notes suggest an openly warm demeanor.",
    });
  }

  if (text.includes("polite")) {
    addSuggestion({
      key: "dossier.speechLanguage.formalityLevel",
      label: "Formality level",
      value: "polite / formal",
      reason: "The notes describe a more polite speech mode than the current quick profile shows.",
    });
  }

  if (text.includes("soldier") || text.includes("officer") || text.includes("guard")) {
    addSuggestion({
      key: "dossier.personalityBehavior.conflictStyle",
      label: "Conflict style",
      value: "direct, trained, tactical under pressure",
      reason: "The character language suggests a martial or security background that should shape how conflict is handled.",
    });
  }

  if (text.includes("ashamed") || text.includes("guilt")) {
    addSuggestion({
      key: "dossier.personalityBehavior.emotionalTendencies",
      label: "Emotional tendencies",
      value: "controlled on the surface, with guilt leaking through under stress",
      reason: "The notes imply guilt-driven emotional restraint rather than neutral description.",
    });
  }

  if (text.includes("lie") || text.includes("lying") || text.includes("secret")) {
    addSuggestion({
      key: "dossier.speechLanguage.lyingSpeech",
      label: "Lying speech",
      value: "gives partial truths, narrows the subject, and becomes more precise than usual",
      reason: "The character notes suggest concealment and strategic speech rather than simple honesty.",
    });
  }

  return suggestions;
}

export async function interpretCharacterProfile(projectId: string, characterId: string) {
  const project = await getProjectWorkspace(projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  const character = project.characters.find((entry) => entry.id === characterId);
  if (!character) {
    throw new Error("Character not found.");
  }

  const primaryChapter =
    project.chapters.find((entry) => entry.povCharacterId === character.id && entry.draft.trim()) ??
    project.chapters.find((entry) => entry.draft.includes(character.name)) ??
    project.chapters.find((entry) => entry.outline.includes(character.name)) ??
    project.chapters[0] ??
    null;
  const context = primaryChapter
    ? buildContextPackage(
        project,
        primaryChapter.id,
        truncateText(
          [primaryChapter.outline, primaryChapter.draft, primaryChapter.notes].filter(Boolean).join("\n\n"),
          1400,
        ),
      )
    : null;
  const relatedRelationships = project.relationships
    .filter((entry) => entry.sourceCharacterId === character.id || entry.targetCharacterId === character.id)
    .slice(0, 6)
    .map((entry) => ({
      source: entry.sourceCharacterName,
      target: entry.targetCharacterName,
      kind: entry.kind,
      description: truncateText(entry.description, 180),
      tension: truncateText(entry.tension, 120),
      status: truncateText(entry.status, 120),
    }));
  const relatedPlotThreads = project.plotThreads
    .filter((entry) => {
      const haystack = [entry.title, entry.summary, entry.promisedPayoff].join(" ").toLowerCase();
      return haystack.includes(character.name.toLowerCase());
    })
    .slice(0, 6)
    .map((entry) => ({
      title: entry.title,
      summary: truncateText(entry.summary, 180),
      promisedPayoff: truncateText(entry.promisedPayoff, 140),
    }));

  const prompt = [
    `You are ${APP_NAME}'s character dossier interpreter.`,
    "Read the full character snapshot and suggest strong structured dossier upgrades.",
    "Return strict JSON only as an array.",
    'Each item must look like {"key":"quickProfile.speechPattern","label":"Speech pattern","value":"indirect / evasive","reason":"..."}',
    "Return 8 to 12 useful suggestions when the material supports them, not just two or three tiny edits.",
    "Only suggest fields that are meaningfully supported by the character material.",
    "Prefer the fields that are currently empty, thin, generic, or obviously underdeveloped.",
    "Make the suggestions specific enough to materially improve future dialogue, planning, and drafting.",
    "Prioritize voice, class, education, speech rhythm, emotional leakage, conflict style, loyalties, fears, and continuity-sensitive current state.",
    "Treat project canon, story-bible canon, memory, continuity, and series canon as binding context for this character.",
    "If the dossier is thin, infer responsibly from the surrounding project data, role, class signals, relationships, and current story pressure instead of staying vague.",
    "When a target field is list-like, return the value as newline-separated items inside the string.",
    "Do not repeat information already captured clearly unless you are sharpening it into a more useful field.",
    "Avoid vague filler like 'complex' or 'interesting'.",
    "Useful keys include:",
    "- quickProfile.accent",
    "- quickProfile.speechPattern",
    "- quickProfile.profession",
    "- quickProfile.placeOfLiving",
    "- dossier.basicIdentity.culturalBackground",
    "- dossier.basicIdentity.beliefSystem",
    "- dossier.lifePosition.socialClass",
    "- dossier.lifePosition.educationLevel",
    "- dossier.lifePosition.reputation",
    "- dossier.personalityBehavior.coreTraits",
    "- dossier.personalityBehavior.virtues",
    "- dossier.personalityBehavior.flaws",
    "- dossier.personalityBehavior.emotionalTendencies",
    "- dossier.personalityBehavior.conflictStyle",
    "- dossier.personalityBehavior.projectedImage",
    "- dossier.personalityBehavior.trueNature",
    "- dossier.personalityBehavior.hiddenSelf",
    "- dossier.motivationStory.shortTermGoal",
    "- dossier.motivationStory.longTermGoal",
    "- dossier.motivationStory.internalConflict",
    "- dossier.motivationStory.externalConflict",
    "- dossier.motivationStory.relationshipToMainConflict",
    "- dossier.speechLanguage.formalityLevel",
    "- dossier.speechLanguage.descriptors",
    "- dossier.speechLanguage.directness",
    "- dossier.speechLanguage.pointStyle",
    "- dossier.speechLanguage.rhythm",
    "- dossier.speechLanguage.angrySpeech",
    "- dossier.speechLanguage.scaredSpeech",
    "- dossier.speechLanguage.lyingSpeech",
    "- dossier.speechLanguage.persuasiveSpeech",
    "- dossier.speechLanguage.superiorSpeech",
    "- dossier.speechLanguage.inferiorSpeech",
    "- dossier.speechLanguage.lovedOnesSpeech",
    "- dossier.speechLanguage.avoidedTopics",
    "- dossier.speechLanguage.commonMisunderstandings",
    "- dossier.bodyPresence.presenceFeel",
    "- currentState.currentKnowledge",
    "- currentState.unknowns",
    "- currentState.emotionalState",
    "- currentState.physicalCondition",
    "- currentState.loyalties",
    "- currentState.recentChanges",
    "- currentState.continuityRisks",
    "Character snapshot:",
    JSON.stringify(
      {
        projectCore: {
          title: project.title,
          premise: truncateText(project.premise, 220),
          oneLineHook: truncateText(project.oneLineHook, 160),
          seriesName: project.bookSettings.seriesName,
          seriesOrder: project.bookSettings.seriesOrder,
          genre: project.bookSettings.genre,
          tone: project.bookSettings.tone,
          audience: project.bookSettings.audience,
          pointOfView: project.bookSettings.pointOfView,
          tense: project.bookSettings.tense,
          storyBrief: truncateText(project.bookSettings.storyBrief, 220),
          plotDirection: truncateText(project.bookSettings.plotDirection, 220),
          voiceRules: project.styleProfile.voiceRules.slice(0, 8),
        },
        name: character.name,
        role: character.role,
        archetype: character.archetype,
        summary: character.summary,
        goal: character.goal,
        fear: character.fear,
        secret: character.secret,
        wound: character.wound,
        freeTextCore: character.dossier.freeTextCore,
        notes: character.notes,
        quickProfile: character.quickProfile,
        dossier: character.dossier,
        currentState: character.currentState,
        relatedRelationships,
        relatedPlotThreads,
        contextChapter:
          primaryChapter == null
            ? null
            : {
                number: primaryChapter.number,
                title: primaryChapter.title,
                purpose: primaryChapter.purpose,
                currentBeat: primaryChapter.currentBeat,
                desiredMood: primaryChapter.desiredMood,
                outlineExcerpt: truncateText(primaryChapter.outline, 320),
                draftExcerpt: truncateText(primaryChapter.draft, 320),
              },
        canonContext:
          context == null
            ? null
            : {
                seriesCanon: context.seriesContext.slice(0, 5),
                storyBibleCanon: context.storyBibleContext.slice(0, 6),
                dialogueVoiceCanon: context.dialogueVoiceContext.slice(0, 5),
                longTermMemory: context.relevantLongTermMemory.slice(0, 4).map((item) => item.title),
                shortTermMemory: context.recentShortTermMemory.slice(0, 4).map((item) => item.title),
                continuityConstraints: context.continuityConstraints.slice(0, 4).map((item) => item.title),
              },
      },
      null,
      2,
    ),
  ].join("\n\n");

  const raw = await generateTextWithProvider(prompt, { maxOutputTokens: 1800 });
  if (!raw) {
    return mockCharacterInterpretation(character);
  }

  const parsed = parseSuggestionJson(raw) ?? [];
  const heuristic = mockCharacterInterpretation(character);
  const merged = mergeCharacterSuggestions(parsed, heuristic);
  return merged.length ? merged.slice(0, 20) : heuristic;
}
