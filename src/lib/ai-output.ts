type ManuscriptSanitizationOptions = {
  chapterTitle?: string;
  chapterNumber?: number;
  previousChapterDrafts?: string[];
};

type ManuscriptSanitizationResult = {
  text: string;
  issues: string[];
};

const editorialHeadingPattern =
  /^(?:\*\*|#+\s*)?(?:structural improvements?|editorial (?:notes?|assessment)|revision notes?|change summary|why this works|storyforge note|coach note|end of chapter|architecture fix|revision plan|chapter\s+\d+(?:\s*[-:]\s*.+)?)(?::)?(?:\*\*)?$/i;
const editorialParagraphPattern =
  /(?:the chapter now|the chapter ends with|the chapter closes with|this chapter ends|this chapter closes|the scene ends with|the scene closes with|clear pov anchoring|concrete goal|active opposition|meaningful change|character moment|escalating stakes|storyforge|revision pass|coach note|why this works|editorial note|editorial assessment|architecture fix|revision plan|return only final revised chapter prose|we are scrubbing|okay,\s*i will|here is the revised chapter|here is the full revised chapter|i will rewrite|i will revise)/i;
const inlineMetaLeadPattern =
  /^(?:we need to|i need to|we should|i should|let(?:'s| us)|the rewrite should|the selected text|rewrite only|improve the selected text|add tension by|we must apply style|the original likely|should we|we'?ll italic|use the text immediately before|return only the replacement prose|follow Bell-style|keep internal thought italicized)(?:\b|:)/i;
const inlineMetaSentencePattern =
  /(?:\bwe need to\b|\bi need to\b|\bwe should\b|\bthe rewrite should\b|\bthe selected text\b|\boriginal selected text\b|\breturn only the replacement prose\b|\bwe must apply style\b|\bshould we italicize\b|\bthe original likely\b|\bwe'?ll italic(?:ize)?\b|\buse the text immediately before\b|\bfollow Bell-style\b|\bkeep internal thought italicized\b)/i;
const editorialListPattern = /^(?:[-*]|\d+\.)\s+/;
const playScriptDialoguePattern = /^([A-Z][\p{L}'’.-]*(?:\s+[A-Z][\p{L}'’.-]*){0,3})\s*:\s+(.+)$/u;
const nonSpeakerLabels = new Set(["Chapter", "Scene", "Act", "Part", "Note"]);
const finishedSentenceEndingPattern = /[.!?â€¦]["â€œâ€']?$/;
const hangingEndingPattern =
  /(?:\b(?:and|or|but|that|the|a|an|to|of|with|for|from|into|onto|upon|through|across|beneath|behind|before|after|because|as|if|when|while|though|until|unless|where|who|which|whose|was|were|is|are|be|been|being|has|have|had|his|her|their|our|your|my|its|this|these|those|then|than|not)\b|[,;:\-])["â€œâ€']?$/i;

function normalizeComparableText(value: string) {
  return value
    .toLowerCase()
    .replace(/[`*_>#]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitParagraphs(value: string) {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function splitSentences(value: string) {
  const matches = value.match(/[^.!?]+(?:[.!?]+|$)/g);
  return (matches ?? [value]).map((sentence) => sentence.trim()).filter(Boolean);
}

function splitCompleteSentences(value: string) {
  const matches = value.match(/[^.!?â€¦]+(?:[.!?â€¦]+(?:["â€œâ€']+)?)/g);
  return (matches ?? []).map((sentence) => sentence.trim()).filter(Boolean);
}

function openingSignature(value: string) {
  return normalizeComparableText(value)
    .split(" ")
    .filter(Boolean)
    .slice(0, 14)
    .join(" ");
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

function stripLeadingWrapper(value: string) {
  let text = value.replace(/\r/g, "").replace(/```(?:json)?/gi, "").trim();

  text = text.replace(
    /^(?:here(?:'s| is)|below is|i(?:'ll| will))(?:.|\n)*?(?:\n\s*\n|\n---+\s*\n|\n#{1,6}\s+)/i,
    "",
  );
  text = text.replace(
    /^(?:revised|updated|new)\s+chapter(?:.|\n)*?(?:\n\s*\n|\n---+\s*\n|\n#{1,6}\s+)/i,
    "",
  );
  text = text.replace(/^\s*---+\s*/i, "");
  text = text.replace(/^\s*(?:\*\*|#+\s*)?chapter\s+\d+[^\n]*?(?:\*\*)?\s*\n+/i, "");
  text = text.replace(/^\s*(?:\*\*|#+\s*)?[a-z][^\n]{0,80}\s*\n+(?=chapter\s+\d+)/i, "");
  text = text.replace(/^\s*(?:\*\*|#+\s*)?(?:draft|outline|revision)[^\n]*\n+/i, "");
  text = text.replace(/^\s*(?:\*\*|#+\s*)?(?:editorial assessment|architecture fix|revision plan)[^\n]*\n+/i, "");

  return text.trim();
}

export function cleanStructuredText(value: string) {
  return stripLeadingWrapper(value)
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isEditorialParagraph(paragraph: string, chapterTitle?: string) {
  const trimmed = paragraph.trim();
  if (!trimmed) {
    return true;
  }

  if (editorialHeadingPattern.test(trimmed)) {
    return true;
  }

  if (/^\*\*end of chapter\*\*$/i.test(trimmed)) {
    return true;
  }

  if (editorialParagraphPattern.test(trimmed)) {
    return true;
  }

  if (editorialListPattern.test(trimmed) && editorialParagraphPattern.test(trimmed)) {
    return true;
  }

  if (chapterTitle && normalizeComparableText(trimmed) === normalizeComparableText(chapterTitle)) {
    return true;
  }

  return false;
}

function sanitizeParagraphLines(paragraph: string) {
  const lines = paragraph
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return "";
  }

  const cleanedLines = lines
    .filter((line) => !isEditorialParagraph(line))
    .map((line) => normalizeDialogueLine(line));
  return cleanedLines.join(" ").trim();
}

function normalizeDialogueLine(line: string) {
  const match = line.match(playScriptDialoguePattern);
  if (!match) {
    return line;
  }

  const speaker = match[1]?.trim() ?? "";
  const rawDialogue = match[2]?.trim() ?? "";
  if (!speaker || nonSpeakerLabels.has(speaker) || rawDialogue.length === 0) {
    return line;
  }

  const dialogue = rawDialogue.replace(/^["“”]+|["“”]+$/g, "").trim();
  if (!dialogue) {
    return line;
  }

  const punctuatedDialogue = /[.!?…]$/.test(dialogue) ? dialogue : `${dialogue}.`;
  return `${speaker} said, "${punctuatedDialogue}"`;
}

function balanceDialogueQuotes(paragraph: string, issues: string[]) {
  const quoteCount = (paragraph.match(/"/g) ?? []).length;
  if (quoteCount === 0 || quoteCount % 2 === 0) {
    return paragraph;
  }

  const trimmed = paragraph.trimEnd();
  issues.push("Closed an unmatched dialogue quotation mark.");

  if (/[.!?…]$/.test(trimmed)) {
    return `${trimmed}"`;
  }

  return `${trimmed}."`;
}

function trimIncompleteEndingSentence(paragraph: string, issues: string[]) {
  const trimmed = paragraph.trim();
  if (!trimmed) {
    return "";
  }

  if (finishedSentenceEndingPattern.test(trimmed) && !hangingEndingPattern.test(trimmed)) {
    return trimmed;
  }

  const completeSentences = splitCompleteSentences(trimmed);
  if (completeSentences.length === 0) {
    issues.push("Removed a broken chapter-ending fragment from generated prose.");
    return "";
  }

  const repaired = completeSentences.join(" ").trim();
  if (repaired !== trimmed) {
    issues.push("Trimmed a truncated sentence from the chapter ending.");
  }

  return repaired;
}

function finalizeChapterEnding(paragraphs: string[], issues: string[]) {
  const finalized = [...paragraphs];

  while (finalized.length > 0) {
    const lastIndex = finalized.length - 1;
    const trimmed = finalized[lastIndex]?.trim() ?? "";

    if (!trimmed) {
      finalized.pop();
      continue;
    }

    if (isEditorialParagraph(trimmed)) {
      issues.push("Removed meta ending text from generated prose.");
      finalized.pop();
      continue;
    }

    const balanced = balanceDialogueQuotes(trimmed, issues);
    const repaired = trimIncompleteEndingSentence(balanced, issues);

    if (!repaired) {
      finalized.pop();
      continue;
    }

    finalized[lastIndex] = repaired;
    break;
  }

  return finalized;
}

export type ManuscriptEndingAssessment = {
  needsRepair: boolean;
  reason: string | null;
  tail: string;
  isMeta: boolean;
  isTruncated: boolean;
};

function compactTail(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(-240);
}

export function assessManuscriptEnding(value: string): ManuscriptEndingAssessment {
  const paragraphs = splitParagraphs(stripLeadingWrapper(value));
  const lastParagraph = paragraphs.at(-1)?.trim() ?? "";

  if (!lastParagraph) {
    return {
      needsRepair: true,
      reason: "The chapter has no usable closing paragraph.",
      tail: "",
      isMeta: false,
      isTruncated: true,
    };
  }

  if (isEditorialParagraph(lastParagraph)) {
    return {
      needsRepair: true,
      reason: "The chapter ends with meta commentary instead of final prose.",
      tail: compactTail(lastParagraph),
      isMeta: true,
      isTruncated: false,
    };
  }

  const balanced = balanceDialogueQuotes(lastParagraph, []);
  const isTruncated =
    !finishedSentenceEndingPattern.test(balanced.trim()) || hangingEndingPattern.test(balanced.trim());

  return {
    needsRepair: isTruncated,
    reason: isTruncated ? "The chapter ending appears cut off or trails away without a finished final sentence." : null,
    tail: compactTail(lastParagraph),
    isMeta: false,
    isTruncated,
  };
}

export function cleanInlineSuggestionText(value: string) {
  const issues: string[] = [];
  const paragraphs = splitParagraphs(stripLeadingWrapper(value));
  const cleanedParagraphs = paragraphs
    .map((paragraph) => sanitizeParagraphLines(paragraph))
    .filter(Boolean)
    .map((paragraph) => {
      const sentences = splitSentences(paragraph).filter((sentence) => !inlineMetaSentencePattern.test(sentence.trim()));
      return sentences.join(" ").trim();
    })
    .filter(Boolean)
    .filter((paragraph) => !inlineMetaLeadPattern.test(paragraph.trim()))
    .map((paragraph) => balanceDialogueQuotes(paragraph, issues))
    .filter(Boolean);

  const cleaned = cleanedParagraphs.join("\n\n").trim();
  return cleaned || cleanStructuredText(value);
}

function trimRepeatedBoundaryOverlap(value: string, boundary: string, side: "start" | "end") {
  let nextValue = value.trim();
  const normalizedBoundary = boundary.trim();
  if (!nextValue || !normalizedBoundary) {
    return nextValue;
  }

  const boundarySentences =
    side === "start" ? splitSentences(normalizedBoundary).slice(-2) : splitSentences(normalizedBoundary).slice(0, 2);

  for (const sentence of boundarySentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence || trimmedSentence.length < 18) {
      continue;
    }

    if (side === "start") {
      const candidate = nextValue.slice(0, Math.min(nextValue.length, trimmedSentence.length + 40));
      if (overlapScore(candidate, trimmedSentence) >= 0.9) {
        nextValue = nextValue.slice(trimmedSentence.length).trimStart();
      }
    } else {
      const candidate = nextValue.slice(Math.max(0, nextValue.length - trimmedSentence.length - 40));
      if (overlapScore(candidate, trimmedSentence) >= 0.9) {
        nextValue = nextValue.slice(0, Math.max(0, nextValue.length - trimmedSentence.length)).trimEnd();
      }
    }
  }

  return nextValue.trim();
}

export function cleanInlineSuggestionAgainstContext(
  value: string,
  options: {
    beforeSelection?: string;
    afterSelection?: string;
  },
) {
  let cleaned = cleanInlineSuggestionText(value);
  cleaned = trimRepeatedBoundaryOverlap(cleaned, options.beforeSelection ?? "", "start");
  cleaned = trimRepeatedBoundaryOverlap(cleaned, options.afterSelection ?? "", "end");
  return cleaned.trim();
}

function dedupeSentenceStream(paragraph: string, recentSentences: string[], issues: string[]) {
  const kept: string[] = [];
  const keptSignatures: string[] = [];

  for (const sentence of splitSentences(paragraph)) {
    const signature = normalizeComparableText(sentence);
    if (!signature) {
      continue;
    }
    const substantialSentence = signature.length >= 40;

    const duplicateSentence = substantialSentence && recentSentences.some((prior) => overlapScore(prior, signature) >= 0.96);
    const repeatedInsideParagraph =
      substantialSentence && keptSignatures.some((prior) => overlapScore(prior, signature) >= 0.96);
    const interruptedMerge =
      substantialSentence &&
      sentence.length >= 120 &&
      /,\s+(?:and|but|or)\s+[A-Z][a-z]/.test(sentence) &&
      recentSentences.some((prior) => overlapScore(prior, signature) >= 0.58);

    if (duplicateSentence || repeatedInsideParagraph || interruptedMerge) {
      issues.push("Removed a repeated or merged sentence fragment from generated prose.");
      continue;
    }

    kept.push(sentence.trim());
    if (substantialSentence) {
      keptSignatures.push(signature);
    }
  }

  recentSentences.push(...keptSignatures.slice(-8));
  return kept.join(" ").trim();
}

function getOpeningParagraphs(previousChapterDrafts: string[]) {
  return previousChapterDrafts
    .map((draft) => splitParagraphs(stripLeadingWrapper(draft))[0] ?? "")
    .filter(Boolean);
}

export function sanitizeManuscriptText(
  value: string,
  options: ManuscriptSanitizationOptions = {},
): ManuscriptSanitizationResult {
  const issues: string[] = [];
  const priorOpenings = getOpeningParagraphs(options.previousChapterDrafts ?? []);
  const seenParagraphs: string[] = [];
  const recentSentences: string[] = [];
  let skipEditorialList = false;

  const paragraphs = splitParagraphs(stripLeadingWrapper(value));
  const cleanedParagraphs: string[] = [];

  for (const [index, originalParagraph] of paragraphs.entries()) {
    const trimmed = originalParagraph.trim();
    if (!trimmed) {
      continue;
    }

    if (editorialHeadingPattern.test(trimmed)) {
      issues.push("Removed editorial notes from generated prose.");
      skipEditorialList = true;
      continue;
    }

    if (skipEditorialList) {
      if (editorialListPattern.test(trimmed) || isEditorialParagraph(trimmed, options.chapterTitle)) {
        issues.push("Removed editorial note bullets from generated prose.");
        continue;
      }

      skipEditorialList = false;
    }

    if (isEditorialParagraph(trimmed, options.chapterTitle)) {
      issues.push("Removed non-manuscript text from generated prose.");
      continue;
    }

    const lineSanitized = sanitizeParagraphLines(trimmed);
    if (!lineSanitized) {
      issues.push("Dropped empty editorial block from generated prose.");
      continue;
    }

    let sentenceSanitized = dedupeSentenceStream(lineSanitized, recentSentences, issues);
    if (!sentenceSanitized) {
      continue;
    }

    const dialogueBalanced = balanceDialogueQuotes(sentenceSanitized, issues);
    if (dialogueBalanced !== sentenceSanitized) {
      sentenceSanitized = dialogueBalanced;
    }

    if (index < 2) {
      const paragraphSentences = splitSentences(sentenceSanitized);
      const firstSentence = paragraphSentences[0];
      const firstSentenceSignature = openingSignature(firstSentence ?? "");
      const repeatedOpeningSentence =
        firstSentence &&
        firstSentenceSignature.length >= 18 &&
        priorOpenings.some((opening) => {
          const priorSentence = splitSentences(opening)[0] ?? "";
          const priorSignature = openingSignature(priorSentence);
          return (
            overlapScore(priorSentence, firstSentence) >= 0.9 ||
            (priorSignature.length >= 18 && overlapScore(priorSignature, firstSentenceSignature) >= 0.72)
          );
        });

      if (repeatedOpeningSentence) {
        if (paragraphSentences.length === 1) {
          issues.push("Removed an opening sentence that repeated an earlier chapter scaffold.");
          continue;
        }

        sentenceSanitized = paragraphSentences.slice(1).join(" ").trim();
        issues.push("Trimmed a repeated opening sentence from generated prose.");
      }
    }

    const duplicateOpening =
      index < 2 &&
      sentenceSanitized.length >= 80 &&
      priorOpenings.some((opening) => {
        const currentSignature = openingSignature(sentenceSanitized);
        const priorSignature = openingSignature(opening);
        return overlapScore(opening, sentenceSanitized) >= 0.72 || overlapScore(priorSignature, currentSignature) >= 0.74;
      });
    if (duplicateOpening) {
      issues.push("Removed an opening paragraph that repeated an earlier chapter scaffold.");
      continue;
    }

    const duplicateParagraph =
      sentenceSanitized.length >= 80 && seenParagraphs.some((paragraph) => overlapScore(paragraph, sentenceSanitized) >= 0.96);
    if (duplicateParagraph) {
      issues.push("Removed a duplicated paragraph from generated prose.");
      continue;
    }

    seenParagraphs.push(sentenceSanitized);
    cleanedParagraphs.push(sentenceSanitized);
  }

  const finalizedParagraphs = finalizeChapterEnding(cleanedParagraphs, issues);

  return {
    text: finalizedParagraphs.join("\n\n").trim(),
    issues,
  };
}

export function cleanGeneratedText(value: string) {
  return sanitizeManuscriptText(value).text;
}

export function cleanSummaryText(value: string) {
  return sanitizeManuscriptText(value).text.replace(/\s+/g, " ").trim();
}

export function cleanCharacterNotes(value: string) {
  return value
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return true;
      }

      if (/^---+$/.test(trimmed)) {
        return false;
      }

      return !/^(?:ch\.\s*\d+:\s*)?(?:here(?:'s| is)|below is|i(?:'ll| will)|(?:\*\*|#+\s*)?chapter\s+\d+)/i.test(trimmed);
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
