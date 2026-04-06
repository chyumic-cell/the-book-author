import type { PlotThreadRecord } from "@/types/storyforge";

const STOPWORDS = new Set([
  "a",
  "about",
  "after",
  "again",
  "against",
  "all",
  "almost",
  "also",
  "among",
  "and",
  "another",
  "any",
  "are",
  "around",
  "as",
  "at",
  "back",
  "because",
  "been",
  "before",
  "being",
  "between",
  "both",
  "but",
  "by",
  "came",
  "can",
  "city",
  "could",
  "day",
  "did",
  "do",
  "does",
  "down",
  "during",
  "each",
  "end",
  "even",
  "ever",
  "every",
  "felt",
  "few",
  "for",
  "from",
  "had",
  "has",
  "have",
  "her",
  "here",
  "him",
  "his",
  "how",
  "into",
  "its",
  "just",
  "like",
  "many",
  "might",
  "more",
  "most",
  "much",
  "must",
  "never",
  "next",
  "not",
  "now",
  "only",
  "other",
  "our",
  "out",
  "over",
  "same",
  "seemed",
  "should",
  "since",
  "some",
  "still",
  "such",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "toward",
  "under",
  "until",
  "very",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "will",
  "with",
  "within",
  "would",
  "your",
]);

export function normalizeAnalysisText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractSignificantTerms(value: string | null | undefined, maxTerms = 10) {
  const counts = new Map<string, number>();

  for (const word of normalizeAnalysisText(value).split(/\s+/)) {
    if (word.length < 4 || STOPWORDS.has(word) || /^\d+$/.test(word)) {
      continue;
    }

    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => {
      if (right[1] === left[1]) {
        return left[0].localeCompare(right[0]);
      }

      return right[1] - left[1];
    })
    .map(([word]) => word)
    .slice(0, maxTerms);
}

export function countDistinctTermMatches(text: string | null | undefined, terms: string[]) {
  const haystack = normalizeAnalysisText(text);

  return Array.from(new Set(terms.filter(Boolean))).reduce((count, term) => {
    return haystack.includes(term) ? count + 1 : count;
  }, 0);
}

export function buildOpeningSignature(text: string | null | undefined) {
  const firstParagraph = (text ?? "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .find(Boolean);

  if (!firstParagraph) {
    return "";
  }

  const firstSentence = firstParagraph.split(/(?<=[.!?])\s+/)[0] ?? firstParagraph;
  return normalizeAnalysisText(firstSentence)
    .split(/\s+/)
    .slice(0, 18)
    .join(" ");
}

export function compareOverlapRatio(sourceTerms: string[], targetText: string | null | undefined) {
  if (sourceTerms.length === 0) {
    return 0;
  }

  return countDistinctTermMatches(targetText, sourceTerms) / sourceTerms.length;
}

export function detectPlotThreadSignal(thread: PlotThreadRecord, chapterSignal: string) {
  const normalizedTitle = normalizeAnalysisText(thread.title);
  const titleTerms = extractSignificantTerms(thread.title, 6);
  const supportTerms = extractSignificantTerms(
    [thread.summary, thread.promisedPayoff, ...(thread.progressMarkers ?? []).map((marker) => marker.label)].join(" "),
    8,
  ).filter((term) => !titleTerms.includes(term));
  const exactTitleMatch = normalizedTitle.length > 0 && normalizeAnalysisText(chapterSignal).includes(normalizedTitle);
  const titleHits = countDistinctTermMatches(chapterSignal, titleTerms);
  const supportHits = countDistinctTermMatches(chapterSignal, supportTerms.slice(0, 5));
  const score = (exactTitleMatch ? 3 : 0) + titleHits * 1.25 + supportHits * 0.6;
  const touched = exactTitleMatch || titleHits >= 3 || (titleHits >= 2 && supportHits >= 1);

  return {
    score,
    touched,
    titleHits,
    supportHits,
    exactTitleMatch,
    titleTerms,
    supportTerms,
  };
}
