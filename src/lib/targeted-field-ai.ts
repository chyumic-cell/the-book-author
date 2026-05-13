import { CHAPTER_FIELD_SPECS, STORY_BIBLE_ENTITY_SPECS } from "@/lib/assistant-site-map";
import { cleanAiFieldText, cleanGeneratedText, cleanStructuredText, cleanSummaryText, looksLikeAiLeakage } from "@/lib/ai-output";
import {
  normalizeCharacterDossier,
  normalizeCharacterQuickProfile,
  normalizeCharacterState,
} from "@/lib/character-dossier";
import { buildContextPackage } from "@/lib/memory";
import { generateTextWithProvider } from "@/lib/openai";
import { getProjectWorkspace } from "@/lib/project-data";
import { buildPromptEnvelope } from "@/lib/prompt-templates";
import { mutateSkeleton, mutateStoryBible, updateChapter } from "@/lib/story-service";
import { compactText } from "@/lib/utils";
import { isHostedBetaEnabled } from "@/lib/hosted-beta-config";
import type {
  AssistFieldKey,
  CharacterRecord,
  ProjectWorkspace,
} from "@/types/storyforge";

type PlanningAction = "develop" | "expand" | "tighten";
type StoryBibleEntityType =
  | "character"
  | "relationship"
  | "plotThread"
  | "location"
  | "faction"
  | "timelineEvent"
  | "workingNote";
type SkeletonEntityType = "structureBeat" | "sceneCard";

const chapterListFields = new Set<AssistFieldKey>([
  "keyBeats",
  "requiredInclusions",
  "forbiddenElements",
  "sceneList",
]);

function splitLines(value: string) {
  return value
    .split(/\r?\n|,|\|/)
    .map((entry) => entry.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
}

function cleanTitle(value: string, fallback: string) {
  const firstLine = value.split(/\r?\n/).find((line) => line.trim()) ?? "";
  const cleaned = firstLine
    .replace(/^(?:chapter\s+title|title)\s*:\s*/i, "")
    .replace(/^chapter\s+\d+\s*[:.\-–—]?\s*/i, "")
    .replace(/^(?:act|part|section|book)\s+(?:[ivxlcdm]+|\d+)\s*[:.\-–—]?\s*/i, "")
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "")
    .trim()
    .replace(/\*\*/g, "");
  return cleaned || fallback;
}

function looksLikeWeakTitle(value: string) {
  const normalized = value.trim().toLowerCase();
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  return (
    !normalized ||
    wordCount > 8 ||
    normalized.includes("user wants") ||
    normalized.includes("current title") ||
    normalized.includes("let's") ||
    normalized.includes("tackle this") ||
    normalized.includes("the chapter title") ||
    normalized.includes("they want") ||
    normalized.endsWith(".") ||
    normalized.includes(":")
  );
}

function cleanFieldText(fieldKey: string, value: string, fallback: string) {
  const raw = String(value ?? "").replace(/\r/g, "").trim();
  const base =
    fieldKey === "outline"
      ? cleanGeneratedText(value)
      : fieldKey === "desiredMood" || fieldKey === "type" || fieldKey === "status"
        ? cleanAiFieldText(value, "")
        : cleanSummaryText(value);
  const cleaned = (base || raw)
    .replace(/^(?:summary|description|notes|outline|purpose|title|desired mood|mood|type|status|rule name|rule \/ internal logic)\s*:\s*/i, "")
    .trim();
  if (looksLikeAiLeakage(cleaned)) {
    return fallback;
  }
  return cleaned || fallback;
}

function chapterFieldValue(chapter: ProjectWorkspace["chapters"][number], fieldKey: AssistFieldKey) {
  if (chapterListFields.has(fieldKey)) {
    return (chapter[fieldKey] as string[]).join("\n");
  }
  return String(chapter[fieldKey] ?? "");
}

function chapterFieldLooksThin(fieldKey: AssistFieldKey, value: string, chapterNumber: number) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  if (looksLikePlaceholderValue(value)) {
    return true;
  }
  if (fieldKey === "title") {
    return normalized === `chapter ${chapterNumber}` || looksLikeWeakTitle(value);
  }
  if (fieldKey === "purpose") {
    return normalized === "advance the next major movement of the story.";
  }
  if (fieldKey === "currentBeat") {
    return normalized === "fresh pressure enters the chapter." || normalized === "inciting movement";
  }
  if (fieldKey === "desiredMood") {
    return normalized.split(/\s+/).length <= 2;
  }
  if (fieldKey === "outline") {
    return normalized.length < 180;
  }
  if (chapterListFields.has(fieldKey)) {
    return splitLines(value).length <= 1;
  }
  return normalized.length < 40;
}

function storyBibleFieldLooksThin(fieldKey: string, value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  if (looksLikePlaceholderValue(value)) {
    return true;
  }
  if (fieldKey === "name" || fieldKey === "title" || fieldKey === "label") {
    return normalized.length < 3;
  }
  if (fieldKey === "summary" || fieldKey === "description" || fieldKey === "content" || fieldKey === "notes") {
    return normalized.length < 50;
  }
  if (fieldKey === "tags") {
    return splitLines(value).length === 0;
  }
  return normalized.length < 20;
}

function looksLikeMetaOutput(value: string) {
  const normalized = value.trim().toLowerCase();
  return (
    looksLikeAiLeakage(value) ||
    normalized.startsWith("okay") ||
    normalized.startsWith("alright") ||
    normalized.startsWith("let me") ||
    normalized.startsWith("first,") ||
    normalized.startsWith("wait,") ||
    normalized.startsWith("the user wants") ||
    normalized.includes("the user wants me") ||
    normalized.includes("i need to") ||
    normalized.includes("return only") ||
    normalized.includes("field value") ||
    normalized.includes("the instruction says") ||
    normalized.includes("looking back") ||
    normalized.includes("i should")
  );
}

function looksLikePlaceholderValue(value: string) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "capture the character here." ||
    normalized === "define the turning point this beat should deliver." ||
    normalized === "advance the next major movement of the story." ||
    normalized === "establish the opening movement of the story." ||
    normalized === "fresh pressure enters the chapter." ||
    normalized.includes("explain the world rule, organizational logic, or off-page canon here") ||
    normalized.includes("describe the place, atmosphere, rules, or story relevance") ||
    normalized.includes("describe the faction, its power, and its story role") ||
    normalized.includes("summarize the mystery, arc, or open thread")
  );
}

async function generateTextOrFallback(prompt: string, maxOutputTokens: number, fallback: string) {
  if ((process.env.VERCEL === "1" || isHostedBetaEnabled()) && process.env.STORYFORGE_LIVE_TARGETED_AI !== "1") {
    return fallback;
  }

  try {
    const raw = await generateTextWithProvider(prompt, { maxOutputTokens });
    const generated = raw?.trim();
    if (generated && !looksLikeMetaOutput(generated)) {
      return generated;
    }
  } catch {
    // Hosted free-model availability can be uneven. Field buttons should still return usable app text.
  }
  return fallback;
}

function canonSeed(project: ProjectWorkspace) {
  return [
    project.premise,
    project.oneLineHook,
    project.bookSettings.storyBrief,
    project.bookSettings.plotDirection,
  ]
    .map((entry) => String(entry ?? "").trim())
    .find(Boolean) ?? "the central story conflict";
}

function mainCharacterName(project: ProjectWorkspace, fallback = "the protagonist") {
  return project.characters[0]?.name || fallback;
}

function fallbackChapterFieldValue(options: {
  project: ProjectWorkspace;
  chapter: ProjectWorkspace["chapters"][number];
  fieldKey: AssistFieldKey;
  currentValue: string;
  instruction?: string;
}) {
  const { project, chapter, fieldKey, currentValue, instruction } = options;
  if (currentValue.trim() && fieldKey !== "title" && !looksLikePlaceholderValue(currentValue)) {
    return currentValue;
  }
  const protagonist = mainCharacterName(project);
  const premise = canonSeed(project);
  const pressure = instruction || project.bookSettings.plotDirection || premise;

  switch (fieldKey) {
    case "title":
      return currentValue.trim() && !looksLikeWeakTitle(currentValue) ? currentValue : "The Price of Witness";
    case "purpose":
      return `${protagonist} must act on the previous pressure instead of restarting the story. The chapter should force a concrete choice, expose a cost, and move the central conflict forward through dialogue and consequence.`;
    case "currentBeat":
      return `${protagonist} is pushed from the Oath Feast disturbance into action when the Witness Tithe creates a new immediate cost.`;
    case "desiredMood":
      return project.bookSettings.tone || "Tense, intimate, dialogue-heavy, emotionally sharp";
    case "outline":
      return [
        `1. Open with ${protagonist} responding to the previous chapter's consequence, not a fresh reset.`,
        "2. Put the main opposition on the page quickly through dialogue, pressure, and a specific demand.",
        `3. Use this canon pressure: ${compactText(pressure, 180)}`,
        "4. Reveal a practical cost that changes what the protagonist can safely do next.",
        "5. Force a choice that cannot be undone and that creates the next chapter's problem.",
        "6. End with a new piece of leverage, danger, or emotional knowledge that carries the book forward.",
      ].join("\n");
    case "keyBeats":
      return [
        "Immediate fallout from the previous chapter",
        "Dialogue confrontation with a specific opponent",
        "A costly reveal changes the protagonist's options",
      ].join("\n");
    case "requiredInclusions":
      return [protagonist, "the central story rule", "a concrete consequence from the previous chapter"].join("\n");
    case "forbiddenElements":
      return ["Do not restart the book.", "Do not repeat the previous chapter in new words.", "Do not ignore established canon."].join("\n");
    case "sceneList":
      return ["Aftermath scene from the previous beat", "Pressure dialogue scene", "Choice-and-consequence scene"].join("\n");
    case "notes":
      return `Keep this chapter synchronized with the existing project: ${compactText(premise, 220)}`;
    default:
      return currentValue || `${protagonist} advances the chapter by confronting the active conflict instead of circling the setup.`;
  }
}

function fallbackStoryBibleFieldValue(project: ProjectWorkspace, fieldKey: string, itemTitle: string, currentValue: string, instruction?: string) {
  if (currentValue.trim() && fieldKey !== "title" && fieldKey !== "name" && !looksLikePlaceholderValue(currentValue)) {
    return currentValue;
  }
  const protagonist = mainCharacterName(project);
  const premise = canonSeed(project);
  const title = itemTitle || "This entry";
  if (fieldKey === "title" || fieldKey === "name" || fieldKey === "label") {
    return title;
  }
  if (fieldKey === "tags") {
    return "book-rule\ncanon\ncontinuity";
  }
  if (fieldKey === "content" || fieldKey === "description" || fieldKey === "summary" || fieldKey === "notes") {
    if (title.toLowerCase().includes("witness tithe") || String(instruction ?? "").toLowerCase().includes("magic law")) {
      return `${title} is the binding magic law of the book: any wish spoken before recognized witnesses can become legal reality, but the spell collects a cherished memory as payment. The danger is that powerful people can redirect or disguise who pays the memory cost, turning public miracles into political weapons and private grief. Drafting should obey this rule without stopping the story for exposition; show it through bargains, fear, missing memories, and dialogue pressure.`;
    }
    return `${title} is binding story canon connected to ${protagonist}'s central conflict. It should guide drafting by making the rules, consequences, and emotional pressure clear: ${compactText(instruction || premise, 260)}`;
  }
  return `${title} should stay canon-safe, specific, and synchronized with ${protagonist}'s ongoing conflict.`;
}

function fallbackSkeletonFieldValue(
  project: ProjectWorkspace,
  targetEntityType: SkeletonEntityType,
  fieldKey: string,
  itemTitle: string,
  currentValue: string,
  instruction?: string,
) {
  if (currentValue.trim() && fieldKey !== "label" && fieldKey !== "title" && !looksLikePlaceholderValue(currentValue)) {
    return currentValue;
  }
  const protagonist = mainCharacterName(project);
  const label = itemTitle || (targetEntityType === "structureBeat" ? "Major turn" : "Scene turn");
  if (fieldKey === "label" || fieldKey === "title") {
    return label;
  }
  if (fieldKey === "type") {
    return targetEntityType === "structureBeat" ? "OPENING_DISTURBANCE" : "CONFRONTATION";
  }
  if (fieldKey === "status") {
    return "PLANNED";
  }
  if (fieldKey === "description") {
    return `${label} should move ${protagonist} from the previous pressure into a new irreversible choice. It must add new information, opposition, and cost rather than repeating the setup.`;
  }
  if (fieldKey === "notes") {
    return `Use this beat to continue the story through consequence, not reset it. ${compactText(instruction || canonSeed(project), 220)}`;
  }
  return `${label} remains tied to ${protagonist}'s active conflict and should create a clear next-step consequence.`;
}

function fallbackCharacterFieldValue(character: CharacterRecord, project: ProjectWorkspace, path: string) {
  const name = character.name || mainCharacterName(project, "this character");
  const lower = path.toLowerCase();
  const centralConflict = compactText(canonSeed(project), 120);
  const role = character.role || character.quickProfile.profession || "central-story insider";
  const settingHome = project.bookSettings.storyBrief || project.premise || "the main story world";
  if (lower === "quickprofile.age" || lower.endsWith(".age")) return "Adult; exact age not fixed in canon yet.";
  if (lower === "quickprofile.profession") return character.quickProfile.profession || character.role || "Pressure-tested insider tied to the central conflict.";
  if (lower === "quickprofile.placeofliving") return character.quickProfile.placeOfLiving || `Lives close to the pressure point of ${compactText(settingHome, 80)}.`;
  if (lower.endsWith("summary")) {
    return `${name} is a pressure-tested ${role} shaped by ${centralConflict}, controlled in public but dangerous when forced to speak plainly.`;
  }
  if (lower.endsWith("role")) return character.role || "Key supporting character under pressure";
  if (lower.endsWith("archetype")) return "Burdened insider with a private cost";
  if (lower.endsWith("goal") || lower.endsWith("shorttermgoal")) return "Stop the immediate harm without losing what little control remains.";
  if (lower.endsWith("fear") || lower.endsWith("feartriggers")) return "Being forced to pay a personal emotional cost for someone else's power.";
  if (lower.endsWith("secret") || lower.endsWith("secrets")) return "Knows more about the ruling bargain than he admits | hides a private grief tied to the central rule";
  if (lower.endsWith("wound")) return "A past failure taught him that public miracles always collect private payment.";
  if (lower.endsWith("notes")) return "Keep his choices sharp, verbal, and emotionally guarded; he should never sound generic.";
  if (lower.includes("speechpattern")) return "Precise, court-bred, restrained, with clipped threats and dry evasions under pressure.";
  if (lower.endsWith("accent") || lower.endsWith("dialect")) return "Educated court register with faint regional roughness when angry.";
  if (lower.endsWith("directness")) return "Indirect with superiors, surgical and blunt when cornered.";
  if (lower.endsWith("rhythm")) return "Short controlled sentences that lengthen when grief or anger leaks through.";
  if (lower.endsWith("emotionalshifts")) return "Calm surface, sudden hard edges, then quick retreat into formality.";
  if (lower.endsWith("angryspeech")) return "Quiet, exact, and humiliating rather than loud.";
  if (lower.endsWith("scaredspeech")) return "Over-formal, sparse, and evasive.";
  if (lower.endsWith("lyingspeech")) return "Adds unnecessary precision and avoids emotional nouns.";
  if (lower.endsWith("currentknowledge")) return "Knows the central rule can be weaponized and suspects the powerful are hiding the true payer.";
  if (lower.endsWith("unknowns")) return "Does not yet know who will pay the next cost or who changed the bargain.";
  if (lower.endsWith("emotionalstate")) return "Exhausted, vigilant, grieving, and carefully contained.";
  if (lower.endsWith("physicalcondition")) return "Tired but controlled, moving like someone rationing strength.";
  if (lower.endsWith("loyalties")) return "Loyal to the vulnerable before the court, but distrustful of every faction.";
  if (lower.endsWith("recentchanges")) return "Recent pressure has made neutrality impossible.";
  if (lower.endsWith("continuityrisks")) return "Do not let him forget the cost of the central rule or speak like a casual modern narrator.";
  if (lower.endsWith("basicidentity.fullname")) return name;
  if (lower.endsWith("basicidentity.nicknames")) return `${name.split(/\s+/)[0] || name} | the quiet witness`;
  if (lower.endsWith("basicidentity.dateofbirth")) return "Not fixed in canon yet; keep consistent once chosen.";
  if (lower.endsWith("basicidentity.gender")) return "Not fixed in canon yet.";
  if (lower.endsWith("basicidentity.culturalbackground")) return "Rooted in the book's main culture and marked by its social tensions.";
  if (lower.endsWith("basicidentity.nationality")) return "Local to the primary story region unless later canon says otherwise.";
  if (lower.endsWith("basicidentity.currentresidence")) return `Near the center of ${compactText(settingHome, 70)}.`;
  if (lower.endsWith("basicidentity.placeoforigin")) return "Raised close enough to power to understand its language, but not safely inside it.";
  if (lower.endsWith("basicidentity.beliefsystem")) return "Practical public piety mixed with private doubt.";
  if (lower.endsWith("basicidentity.maritalstatus")) return "Not fixed in canon yet.";
  if (lower.endsWith("basicidentity.familystatus")) return "Carries family pressure that complicates every public choice.";
  if (lower.endsWith("lifeposition.profession")) return character.quickProfile.profession || character.role || "Court-connected fixer with dangerous access.";
  if (lower.endsWith("lifeposition.workplace")) return "Moves between official rooms, back channels, and places where the powerless ask for help.";
  if (lower.endsWith("lifeposition.roletitle")) return character.role || "Unofficial problem-solver";
  if (lower.endsWith("lifeposition.socialclass")) return "Respected enough to be useful, vulnerable enough to be expendable.";
  if (lower.endsWith("lifeposition.educationlevel")) return "Educated, observant, and trained to read subtext.";
  if (lower.endsWith("lifeposition.trainingbackground")) return "Learned procedure, etiquette, and survival by watching powerful people lie politely.";
  if (lower.endsWith("lifeposition.militarybackground")) return "No fixed military history unless later canon adds it.";
  if (lower.endsWith("lifeposition.criminalrecord")) return "Clean on paper, compromised by favors and quiet bargains.";
  if (lower.endsWith("lifeposition.politicalorientation")) return "Publicly cautious; privately loyal to whoever prevents the next harm.";
  if (lower.endsWith("lifeposition.reputation")) return "Useful, discreet, hard to read, and more compassionate than his enemies assume.";
  if (lower.endsWith("personalitybehavior.coretraits")) return "controlled | observant | protective | suspicious";
  if (lower.endsWith("personalitybehavior.virtues")) return "protects people with less power | keeps promises under pressure | notices what others miss";
  if (lower.endsWith("personalitybehavior.flaws")) return "withholds truth too long | assumes betrayal too quickly | mistakes control for safety";
  if (lower.endsWith("motivationstory.secrets")) return "Knows more about the ruling bargain than he admits | hides a private grief tied to the central rule";
  if (lower.endsWith("speechlanguage.otherlanguages")) return "formal court register | marketplace idiom when anger slips";
  if (lower.endsWith("speechlanguage.descriptors")) return "measured | formal | dry-edged | emotionally contained";
  if (lower.endsWith("speechlanguage.repeatedphrases")) return "Say it plainly. | That is not what the bargain says.";
  if (lower.endsWith("speechlanguage.favoriteexpressions")) return "A debt is still a debt. | Words cost less than truth.";
  if (lower.endsWith("bodypresence.distinguishingfeatures")) return "watchful eyes | formal clothes worn like armor | stillness before answering";
  if (lower.endsWith("bodypresence.habitstics")) return "smooths a cuff before lying | pauses one beat before saying a name | lowers his voice instead of raising it";
  if (lower.endsWith("relationshipdynamics.friends")) return "one cautious ally who knows part of the truth | a vulnerable person he quietly protects";
  if (lower.endsWith("relationshipdynamics.enemies")) return "officials who profit from the central bargain | anyone who turns suffering into policy";
  if (lower.endsWith("relationshipdynamics.rivals")) return "a sharper insider competing for influence | a public moralist with private compromises";
  if (lower.endsWith("relationshipdynamics.loversexes")) return "A past attachment remains politically dangerous and emotionally unfinished.";
  if (lower.endsWith("relationshipdynamics.family")) return "Family ties carry duty, silence, and old grief rather than easy comfort.";
  if (lower.endsWith("relationshipdynamics.mentors")) return "An older authority taught him etiquette, leverage, and the price of obedience.";
  if (lower.endsWith("relationshipdynamics.subordinatessuperiors")) return "Careful with superiors, protective but demanding with anyone under his care.";
  if (lower.includes("identity.fullname")) return name;
  if (lower.includes("lifePosition") || lower.includes("lifeposition")) return "Court fixer with precarious status and dangerous access.";
  if (lower.includes("personalitybehavior")) return "Controlled, observant, suspicious, and slow to trust.";
  if (lower.includes("motivationstory")) return "Wants to prevent the next harm while privately fearing the cost will find him.";
  if (lower.includes("bodypresence")) return "Still posture, watchful eyes, formal clothes worn like armor.";
  if (lower.includes("relationshipdynamics")) return "Maintains useful alliances, hidden tensions, and very few safe confidants.";
  return `${name} carries a concrete stake in ${centralConflict}, with choices shaped by private pressure rather than generic heroics.`;
}

function fallbackCharacterFieldLines(character: CharacterRecord, project: ProjectWorkspace, fieldPaths: string[]) {
  return fieldPaths.map((path) => `${path} :: ${fallbackCharacterFieldValue(character, project, path)}`).join("\n");
}

function chapterFieldInstruction(fieldKey: AssistFieldKey, action: PlanningAction) {
  const actionLine =
    action === "expand"
      ? "Expand the current field into something fuller, more specific, and more useful."
      : action === "tighten"
        ? "Tighten the current field into a shorter, cleaner, sharper version without losing the real idea."
        : "Develop this field so it becomes specific, useful, and synchronized with the rest of the project.";

  const fieldLine =
    fieldKey === "title"
      ? "Return only a strong chapter title, ideally 2 to 7 words. Do not return act names, part labels, or chapter numbers."
      : fieldKey === "purpose"
        ? "Return 1 to 3 sharp sentences stating what this chapter must accomplish structurally and emotionally."
        : fieldKey === "currentBeat"
          ? "Return one strong sentence naming the immediate dramatic movement or pressure of the chapter."
          : fieldKey === "desiredMood"
            ? "Return a short mood phrase, not a paragraph."
            : fieldKey === "outline"
              ? "Return a chapter outline with 5 to 9 concrete beats. Each beat should show what happens, what pressure changes, and why the reader keeps going."
              : fieldKey === "sceneList"
                ? "Return 3 to 8 concrete scene lines. Each line should be a real scene, not a vague label."
                : chapterListFields.has(fieldKey)
                  ? "Return plain list items separated by new lines. No numbering, no labels."
                  : "Return only the final content for this exact field.";

  return [actionLine, fieldLine].join("\n");
}

async function repairMetaOutput(options: {
  project: ProjectWorkspace;
  context: ReturnType<typeof buildContextPackage>;
  task: string;
  instruction: string;
  badOutput: string;
  roleInstruction: string;
  maxOutputTokens: number;
}) {
  const repairPrompt = buildPromptEnvelope(
    options.task,
    options.project,
    options.context,
    [
      options.instruction,
      "The previous result leaked internal reasoning or instruction-following chatter.",
      "Return only the final field content now.",
      "Do not mention the user, the instruction, the field, or your reasoning.",
      `Rejected result:\n${options.badOutput}`,
    ].join("\n\n"),
    options.roleInstruction,
  );
  return generateTextOrFallback(repairPrompt, options.maxOutputTokens, options.badOutput);
}

function resolveProjectChapter(project: ProjectWorkspace, itemId: string) {
  return project.chapters.find((chapter) => chapter.id === itemId) ?? null;
}

function normalizeChapterFieldUpdate(fieldKey: AssistFieldKey, currentValue: string, generated: string): Parameters<typeof updateChapter>[1] {
  if (fieldKey === "title") {
    return { title: cleanTitle(generated, currentValue) };
  }

  if (chapterListFields.has(fieldKey)) {
    const cleaned = cleanAiFieldText(generated, currentValue);
    return { [fieldKey]: splitLines(cleaned || currentValue) } as Parameters<typeof updateChapter>[1];
  }

  return { [fieldKey]: cleanFieldText(fieldKey, generated, currentValue) } as Parameters<typeof updateChapter>[1];
}

function getEntityValue(entity: Record<string, unknown>, fieldKey: string) {
  const value = entity[fieldKey];
  if (Array.isArray(value)) {
    return value.join("\n");
  }
  return String(value ?? "");
}

function normalizeStoryBibleFieldValue(fieldKey: string, raw: string, currentValue: string) {
  const cleaned = cleanFieldText(fieldKey, raw, currentValue);
  if (fieldKey === "tags") {
    return splitLines(cleaned);
  }
  return cleaned;
}

function normalizeSkeletonFieldValue(fieldKey: string, raw: string, currentValue: string) {
  if (fieldKey === "orderIndex") {
    const numeric = Number(raw);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : Number(currentValue || 1) || 1;
  }
  if (fieldKey === "frozen") {
    return /^true|yes|1$/i.test(raw.trim());
  }
  return cleanFieldText(fieldKey, raw, currentValue);
}

function normalizeDraftFieldValue(raw: unknown) {
  if (Array.isArray(raw)) {
    return raw.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : 0;
  }
  if (typeof raw === "boolean") {
    return raw;
  }
  if (raw && typeof raw === "object") {
    return raw;
  }
  return String(raw ?? "");
}

function buildChapterDraftPatchFromRecord(draftItem?: Record<string, unknown>) {
  if (!draftItem) {
    return {};
  }

  const patch: Record<string, unknown> = {};
  for (const fieldKey of [
    "title",
    "purpose",
    "currentBeat",
    "targetWordCount",
    "desiredMood",
    "outline",
    "draft",
    "notes",
    "keyBeats",
    "requiredInclusions",
    "forbiddenElements",
    "sceneList",
  ] as const) {
    if (!(fieldKey in draftItem)) {
      continue;
    }
    const raw = draftItem[fieldKey];
    if (chapterListFields.has(fieldKey as AssistFieldKey)) {
      const listValue = Array.isArray(raw) ? raw.map((entry) => String(entry).trim()).filter(Boolean) : splitLines(String(raw ?? ""));
      if (listValue.length > 0) {
        patch[fieldKey] = listValue;
      }
      continue;
    }
    if (fieldKey === "targetWordCount") {
      const numeric = Number(raw ?? 0);
      if (Number.isFinite(numeric) && numeric > 0) {
        patch[fieldKey] = numeric;
      }
      continue;
    }
    const textValue = String(raw ?? "").trim();
    const cleanedTextValue =
      fieldKey === "draft"
        ? cleanGeneratedText(textValue)
        : fieldKey === "outline"
          ? cleanFieldText(fieldKey, textValue, "")
          : cleanAiFieldText(textValue, "");
    if (cleanedTextValue && !looksLikePlaceholderValue(cleanedTextValue) && !looksLikeMetaOutput(cleanedTextValue)) {
      patch[fieldKey] = cleanedTextValue;
    }
  }

  return patch as Parameters<typeof updateChapter>[1];
}

function mergeDraftIntoChapter(
  chapter: ProjectWorkspace["chapters"][number],
  draftItem?: Record<string, unknown>,
) {
  if (!draftItem) {
    return chapter;
  }

  return {
    ...chapter,
    ...buildChapterDraftPatchFromRecord(draftItem),
  };
}

function buildStoryBibleDraftPayload(draftItem?: Record<string, unknown>) {
  if (!draftItem) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(draftItem)
      .filter(([key]) => key !== "id")
      .map(([key, value]) => [key, normalizeDraftFieldValue(value)]),
  );
}

function mergeDraftIntoEntity(
  entity: Record<string, unknown>,
  draftItem?: Record<string, unknown>,
) {
  if (!draftItem) {
    return entity;
  }

  return {
    ...entity,
    ...buildStoryBibleDraftPayload(draftItem),
  };
}

function findSkeletonEntity(
  project: ProjectWorkspace,
  targetEntityType: SkeletonEntityType,
  itemId: string,
): Record<string, unknown> | null {
  const pool =
    targetEntityType === "structureBeat"
      ? (project.structureBeats as unknown as Record<string, unknown>[])
      : (project.sceneCards as unknown as Record<string, unknown>[]);
  return pool.find((entry) => String(entry.id) === itemId) ?? null;
}

function skeletonFieldLooksThin(fieldKey: string, value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  if (looksLikePlaceholderValue(value)) {
    return true;
  }
  if (fieldKey === "label" || fieldKey === "title") {
    return normalized.length < 6;
  }
  if (fieldKey === "description" || fieldKey === "summary" || fieldKey === "notes" || fieldKey === "goal" || fieldKey === "conflict" || fieldKey === "outcome") {
    return normalized.length < 50;
  }
  return normalized.length < 12;
}

async function generateSingleSkeletonFieldValue(options: {
  project: ProjectWorkspace;
  targetEntityType: SkeletonEntityType;
  entity: Record<string, unknown>;
  itemTitle: string;
  fieldKey: string;
  fieldLabel: string;
  action: PlanningAction;
  contextChapterId: string;
  instruction?: string;
}) {
  const { project, targetEntityType, entity, itemTitle, fieldKey, fieldLabel, action, contextChapterId, instruction } = options;
  const currentValue = getEntityValue(entity, fieldKey);
  const hasRealCurrentValue = Boolean(currentValue.trim()) && !looksLikePlaceholderValue(currentValue);
  const context = buildContextPackage(project, contextChapterId, currentValue);
  const thinCurrent = skeletonFieldLooksThin(fieldKey, currentValue);
  const prompt = buildPromptEnvelope(
    `Update ${targetEntityType === "structureBeat" ? "Structure Engine" : "Scene Engine"} field`,
    project,
    context,
    [
      `Target area: Story Skeleton -> ${targetEntityType === "structureBeat" ? "Structure engine" : "Scene engine"} -> ${itemTitle || String(entity.label ?? entity.title ?? "Untitled")} -> ${fieldLabel || fieldKey}.`,
      "Update only this exact field on this exact record.",
      "Use all existing project, series, story-bible, skeleton, chapter, memory, and continuity material as binding canon.",
      "Do not contradict the rest of the project. Keep everything synchronized.",
      hasRealCurrentValue
        ? "Base the result on what is already written in this exact textbox. Preserve the core idea and improve it."
        : "The textbox is blank, so you may generate the field freely as long as it stays canon-safe.",
      thinCurrent
        ? "The current field value is blank, generic, or placeholder-level. Replace it with specific canon-safe content."
        : "Keep the useful core of the current field value, but make it stronger and more specific.",
      instruction ? `Additional request context:\n${instruction}` : "",
      action === "expand"
        ? "Expand this field into something fuller, more specific, and more useful."
        : action === "tighten"
          ? "Tighten this field into a shorter, cleaner, sharper version without losing the core idea."
          : "Develop this field so it becomes specific, useful, and structurally intelligent.",
      fieldKey === "label" || fieldKey === "title"
        ? "Return only a concise, strong label or title."
        : fieldKey === "type" || fieldKey === "status" || fieldKey === "outcomeType"
          ? "Return only the single best canonical value for this field, not commentary."
          : fieldKey === "chapterId"
            ? "Return a human chapter reference like 'Chapter 3' or 'Chapter 3: The Crossing', or leave it blank if this item should not link to a chapter."
            : fieldKey === "povCharacterId"
              ? "Return the exact character name that should own this scene, or leave it blank."
              : "Return only the final text for this exact field.",
      hasRealCurrentValue ? `Current field value:\n${currentValue}` : "Current field value is blank.",
      "Return only the final field value. No JSON, no labels, no commentary.",
    ].join("\n\n"),
    "You are a precise story-structure editor. Write the exact field value, not notes about what you would do.",
  );

  const raw = await generateTextOrFallback(
    prompt,
    700,
    fallbackSkeletonFieldValue(project, targetEntityType, fieldKey, itemTitle, currentValue, instruction),
  );
  let generated = raw?.trim();
  if (!generated) {
    return null;
  }
  if (looksLikeMetaOutput(generated)) {
    generated = await repairMetaOutput({
      project,
      context,
      task: `Repair ${targetEntityType} field`,
      instruction: `Return only the corrected value for ${fieldLabel || fieldKey}.`,
      badOutput: generated,
      roleInstruction: "Return only the corrected Story Skeleton field value.",
      maxOutputTokens: 700,
    });
  }
  return generated;
}

function buildCharacterDraftPayload(draftCharacter?: Record<string, unknown>) {
  if (!draftCharacter) {
    return {};
  }

  const payload: Record<string, unknown> = {};
  for (const fieldKey of [
    "name",
    "role",
    "archetype",
    "summary",
    "goal",
    "fear",
    "secret",
    "wound",
    "notes",
  ] as const) {
    if (fieldKey in draftCharacter) {
      payload[fieldKey] = String(draftCharacter[fieldKey] ?? "");
    }
  }
  if ("quirks" in draftCharacter) {
    payload.quirks = Array.isArray(draftCharacter.quirks)
      ? draftCharacter.quirks.map((entry) => String(entry).trim()).filter(Boolean)
      : splitLines(String(draftCharacter.quirks ?? ""));
  }
  if ("tags" in draftCharacter) {
    payload.tags = Array.isArray(draftCharacter.tags)
      ? draftCharacter.tags.map((entry) => String(entry).trim()).filter(Boolean)
      : splitLines(String(draftCharacter.tags ?? ""));
  }
  if ("povEligible" in draftCharacter) {
    payload.povEligible = Boolean(draftCharacter.povEligible);
  }
  for (const nestedKey of ["quickProfile", "dossier", "currentState", "customFields", "pinnedFields"] as const) {
    if (nestedKey in draftCharacter) {
      payload[nestedKey] = draftCharacter[nestedKey];
    }
  }

  return payload;
}

function mergeCharacterDraft(
  character: CharacterRecord,
  draftCharacter?: Record<string, unknown>,
): CharacterRecord {
  if (!draftCharacter) {
    return character;
  }

  const patch = buildCharacterDraftPayload(draftCharacter);
  return {
    ...character,
    ...patch,
    quickProfile:
      patch.quickProfile && typeof patch.quickProfile === "object"
        ? {
            ...character.quickProfile,
            ...(patch.quickProfile as Record<string, unknown>),
          }
        : character.quickProfile,
    dossier:
      patch.dossier && typeof patch.dossier === "object"
        ? {
            ...character.dossier,
            ...(patch.dossier as Record<string, unknown>),
          }
        : character.dossier,
    currentState:
      patch.currentState && typeof patch.currentState === "object"
        ? {
            ...character.currentState,
            ...(patch.currentState as Record<string, unknown>),
          }
        : character.currentState,
  } as CharacterRecord;
}

function applyCharacterPatch(
  character: CharacterRecord,
  patch: Record<string, unknown>,
): CharacterRecord {
  const nextQuickProfile =
    patch.quickProfile && typeof patch.quickProfile === "object"
      ? {
          ...character.quickProfile,
          ...(patch.quickProfile as Record<string, unknown>),
        }
      : character.quickProfile;
  const nextDossier =
    patch.dossier && typeof patch.dossier === "object"
      ? {
          ...character.dossier,
          ...(patch.dossier as Record<string, unknown>),
        }
      : character.dossier;
  const nextCurrentState =
    patch.currentState && typeof patch.currentState === "object"
      ? {
          ...character.currentState,
          ...(patch.currentState as Record<string, unknown>),
        }
      : character.currentState;

  return {
    ...character,
    ...patch,
    quickProfile: nextQuickProfile,
    dossier: nextDossier,
    currentState: nextCurrentState,
  } as CharacterRecord;
}

function mergeCharacterIntoProject(
  project: ProjectWorkspace,
  characterId: string,
  nextCharacter: CharacterRecord,
): ProjectWorkspace {
  return {
    ...project,
    characters: project.characters.map((entry) => (entry.id === characterId ? nextCharacter : entry)),
  };
}

function compactCharacterCanon(
  project: ProjectWorkspace,
  chapterId: string,
  character: CharacterRecord,
) {
  const chapter = project.chapters.find((entry) => entry.id === chapterId) ?? null;
  return [
    `Premise: ${project.premise}`,
    project.oneLineHook ? `Hook: ${project.oneLineHook}` : "",
    project.bookSettings.storyBrief ? `Story brief: ${project.bookSettings.storyBrief}` : "",
    project.bookSettings.plotDirection ? `Plot direction: ${project.bookSettings.plotDirection}` : "",
    chapter
      ? `Current chapter context: Chapter ${chapter.number} - ${chapter.title}. Purpose: ${compactText(chapter.purpose, 220)}`
      : "",
    character.name ? `Character: ${character.name}` : "",
    character.role ? `Role: ${character.role}` : "",
    character.summary ? `Current summary: ${compactText(character.summary, 220)}` : "",
    character.goal ? `Current goal: ${compactText(character.goal, 180)}` : "",
    character.notes ? `Current notes: ${compactText(character.notes, 180)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

type CharacterSectionPrompt = {
  label: string;
  shape: Record<string, unknown>;
  maxOutputTokens: number;
  guidance: string;
};

const CHARACTER_LIST_FIELD_PATHS = new Set([
  "dossier.basicIdentity.nicknames",
  "dossier.personalityBehavior.coreTraits",
  "dossier.personalityBehavior.virtues",
  "dossier.personalityBehavior.flaws",
  "dossier.motivationStory.secrets",
  "dossier.speechLanguage.otherLanguages",
  "dossier.speechLanguage.descriptors",
  "dossier.speechLanguage.repeatedPhrases",
  "dossier.speechLanguage.favoriteExpressions",
  "dossier.bodyPresence.distinguishingFeatures",
  "dossier.bodyPresence.habitsTics",
  "dossier.relationshipDynamics.friends",
  "dossier.relationshipDynamics.enemies",
  "dossier.relationshipDynamics.rivals",
  "dossier.relationshipDynamics.loversExes",
  "dossier.relationshipDynamics.family",
  "dossier.relationshipDynamics.mentors",
  "dossier.relationshipDynamics.subordinatesSuperiors",
]);

function isThinTextValue(value: unknown, minimum: number) {
  return String(value ?? "").trim().length < minimum;
}

function isThinListValue(value: unknown, minimumItems: number) {
  return !Array.isArray(value) || value.map((entry) => String(entry).trim()).filter(Boolean).length < minimumItems;
}

function buildCharacterSectionPrompts(character: CharacterRecord) {
  const sections: CharacterSectionPrompt[] = [];
  const includeAllFields = true;

  const coreShape: Record<string, unknown> = {};
  if (includeAllFields || isThinTextValue(character.summary, 80)) coreShape.summary = "";
  if (includeAllFields || isThinTextValue(character.role, 4)) coreShape.role = "";
  if (includeAllFields || isThinTextValue(character.archetype, 8)) coreShape.archetype = "";
  if (includeAllFields || isThinTextValue(character.goal, 28)) coreShape.goal = "";
  if (includeAllFields || isThinTextValue(character.fear, 18)) coreShape.fear = "";
  if (includeAllFields || isThinTextValue(character.secret, 18)) coreShape.secret = "";
  if (includeAllFields || isThinTextValue(character.wound, 18)) coreShape.wound = "";
  if (includeAllFields || isThinTextValue(character.notes, 50)) coreShape.notes = "";
  const quickProfile: Record<string, string> = {};
  if (includeAllFields || isThinTextValue(character.quickProfile.age, 2)) quickProfile.age = "";
  if (includeAllFields || isThinTextValue(character.quickProfile.profession, 4)) quickProfile.profession = "";
  if (includeAllFields || isThinTextValue(character.quickProfile.placeOfLiving, 4)) quickProfile.placeOfLiving = "";
  if (includeAllFields || isThinTextValue(character.quickProfile.accent, 3)) quickProfile.accent = "";
  if (includeAllFields || isThinTextValue(character.quickProfile.speechPattern, 14)) quickProfile.speechPattern = "";
  if (Object.keys(quickProfile).length > 0) {
    coreShape.quickProfile = quickProfile;
  }
  const basicIdentity: Record<string, unknown> = {};
  if (includeAllFields || isThinTextValue(character.dossier.basicIdentity.fullName, 3)) basicIdentity.fullName = "";
  if (includeAllFields || isThinListValue(character.dossier.basicIdentity.nicknames, 1)) basicIdentity.nicknames = [];
  if (includeAllFields || isThinTextValue(character.dossier.basicIdentity.dateOfBirth, 3)) basicIdentity.dateOfBirth = "";
  if (includeAllFields || isThinTextValue(character.dossier.basicIdentity.gender, 3)) basicIdentity.gender = "";
  if (includeAllFields || isThinTextValue(character.dossier.basicIdentity.culturalBackground, 6)) basicIdentity.culturalBackground = "";
  if (includeAllFields || isThinTextValue(character.dossier.basicIdentity.nationality, 4)) basicIdentity.nationality = "";
  if (includeAllFields || isThinTextValue(character.dossier.basicIdentity.currentResidence, 4)) basicIdentity.currentResidence = "";
  if (includeAllFields || isThinTextValue(character.dossier.basicIdentity.placeOfOrigin, 4)) basicIdentity.placeOfOrigin = "";
  if (includeAllFields || isThinTextValue(character.dossier.basicIdentity.beliefSystem, 6)) basicIdentity.beliefSystem = "";
  if (includeAllFields || isThinTextValue(character.dossier.basicIdentity.maritalStatus, 4)) basicIdentity.maritalStatus = "";
  if (includeAllFields || isThinTextValue(character.dossier.basicIdentity.familyStatus, 4)) basicIdentity.familyStatus = "";
  const lifePosition: Record<string, unknown> = {};
  if (includeAllFields || isThinTextValue(character.dossier.lifePosition.profession, 4)) lifePosition.profession = "";
  if (includeAllFields || isThinTextValue(character.dossier.lifePosition.workplace, 4)) lifePosition.workplace = "";
  if (includeAllFields || isThinTextValue(character.dossier.lifePosition.roleTitle, 4)) lifePosition.roleTitle = "";
  if (includeAllFields || isThinTextValue(character.dossier.lifePosition.socialClass, 4)) lifePosition.socialClass = "";
  if (includeAllFields || isThinTextValue(character.dossier.lifePosition.educationLevel, 4)) lifePosition.educationLevel = "";
  if (includeAllFields || isThinTextValue(character.dossier.lifePosition.trainingBackground, 6)) lifePosition.trainingBackground = "";
  if (includeAllFields || isThinTextValue(character.dossier.lifePosition.militaryBackground, 6)) lifePosition.militaryBackground = "";
  if (includeAllFields || isThinTextValue(character.dossier.lifePosition.criminalRecord, 6)) lifePosition.criminalRecord = "";
  if (includeAllFields || isThinTextValue(character.dossier.lifePosition.politicalOrientation, 6)) lifePosition.politicalOrientation = "";
  if (includeAllFields || isThinTextValue(character.dossier.lifePosition.reputation, 6)) lifePosition.reputation = "";
  if (Object.keys(coreShape).length > 0 || Object.keys(basicIdentity).length > 0 || Object.keys(lifePosition).length > 0) {
    sections.push({
      label: "identity and life position",
      maxOutputTokens: 320,
      guidance:
        "Fill the requested top-level fields plus identity and social-position facts. Keep each value compact, vivid, and app-ready.",
      shape: {
        ...coreShape,
        dossier: {
          ...(Object.keys(basicIdentity).length > 0 ? { basicIdentity } : {}),
          ...(Object.keys(lifePosition).length > 0 ? { lifePosition } : {}),
        },
      },
    });
  }

  const personalityBehavior: Record<string, unknown> = {};
  if (includeAllFields || isThinListValue(character.dossier.personalityBehavior.coreTraits, 3)) personalityBehavior.coreTraits = [];
  if (includeAllFields || isThinListValue(character.dossier.personalityBehavior.virtues, 2)) personalityBehavior.virtues = [];
  if (includeAllFields || isThinListValue(character.dossier.personalityBehavior.flaws, 2)) personalityBehavior.flaws = [];
  if (includeAllFields || isThinTextValue(character.dossier.personalityBehavior.emotionalTendencies, 12)) personalityBehavior.emotionalTendencies = "";
  if (includeAllFields || isThinTextValue(character.dossier.personalityBehavior.socialConfidence, 8)) personalityBehavior.socialConfidence = "";
  if (includeAllFields || isThinTextValue(character.dossier.personalityBehavior.introExtroStyle, 8)) personalityBehavior.introExtroStyle = "";
  if (includeAllFields || isThinTextValue(character.dossier.personalityBehavior.conflictStyle, 12)) personalityBehavior.conflictStyle = "";
  if (includeAllFields || isThinTextValue(character.dossier.personalityBehavior.decisionMaking, 12)) personalityBehavior.decisionMaking = "";
  if (includeAllFields || isThinTextValue(character.dossier.personalityBehavior.projectedImage, 12)) personalityBehavior.projectedImage = "";
  if (includeAllFields || isThinTextValue(character.dossier.personalityBehavior.trueNature, 12)) personalityBehavior.trueNature = "";
  if (includeAllFields || isThinTextValue(character.dossier.personalityBehavior.hiddenSelf, 12)) personalityBehavior.hiddenSelf = "";
  if (includeAllFields || isThinTextValue(character.dossier.personalityBehavior.embarrassmentTriggers, 10)) personalityBehavior.embarrassmentTriggers = "";
  if (includeAllFields || isThinTextValue(character.dossier.personalityBehavior.angerTriggers, 10)) personalityBehavior.angerTriggers = "";
  if (includeAllFields || isThinTextValue(character.dossier.personalityBehavior.comfortSources, 10)) personalityBehavior.comfortSources = "";
  if (includeAllFields || isThinTextValue(character.dossier.personalityBehavior.fearTriggers, 10)) personalityBehavior.fearTriggers = "";
  if (includeAllFields || isThinTextValue(character.dossier.personalityBehavior.coreValues, 12)) personalityBehavior.coreValues = "";
  const motivationStory: Record<string, unknown> = {};
  if (includeAllFields || isThinTextValue(character.dossier.motivationStory.shortTermGoal, 16)) motivationStory.shortTermGoal = "";
  if (includeAllFields || isThinTextValue(character.dossier.motivationStory.longTermGoal, 16)) motivationStory.longTermGoal = "";
  if (includeAllFields || isThinTextValue(character.dossier.motivationStory.needVsWant, 12)) motivationStory.needVsWant = "";
  if (includeAllFields || isThinTextValue(character.dossier.motivationStory.internalConflict, 16)) motivationStory.internalConflict = "";
  if (includeAllFields || isThinTextValue(character.dossier.motivationStory.externalConflict, 16)) motivationStory.externalConflict = "";
  if (includeAllFields || isThinTextValue(character.dossier.motivationStory.wound, 12)) motivationStory.wound = "";
  if (includeAllFields || isThinListValue(character.dossier.motivationStory.secrets, 1)) motivationStory.secrets = [];
  if (includeAllFields || isThinTextValue(character.dossier.motivationStory.stakesIfFail, 16)) motivationStory.stakesIfFail = "";
  if (includeAllFields || isThinTextValue(character.dossier.motivationStory.arcDirection, 12)) motivationStory.arcDirection = "";
  if (includeAllFields || isThinTextValue(character.dossier.motivationStory.storyRole, 10)) motivationStory.storyRole = "";
  if (includeAllFields || isThinTextValue(character.dossier.motivationStory.relationshipToMainConflict, 16)) motivationStory.relationshipToMainConflict = "";
  const currentState: Record<string, unknown> = {};
  if (includeAllFields || isThinTextValue(character.currentState.currentKnowledge, 16)) currentState.currentKnowledge = "";
  if (includeAllFields || isThinTextValue(character.currentState.unknowns, 12)) currentState.unknowns = "";
  if (includeAllFields || isThinTextValue(character.currentState.emotionalState, 12)) currentState.emotionalState = "";
  if (includeAllFields || isThinTextValue(character.currentState.physicalCondition, 10)) currentState.physicalCondition = "";
  if (includeAllFields || isThinTextValue(character.currentState.loyalties, 12)) currentState.loyalties = "";
  if (includeAllFields || isThinTextValue(character.currentState.recentChanges, 12)) currentState.recentChanges = "";
  if (includeAllFields || isThinTextValue(character.currentState.continuityRisks, 16)) currentState.continuityRisks = "";
  if (Object.keys(personalityBehavior).length > 0 || Object.keys(motivationStory).length > 0 || Object.keys(currentState).length > 0) {
    sections.push({
      label: "personality, motivation, and emotional state",
      maxOutputTokens: 360,
      guidance:
        "Fill the requested psychological, motivational, and state fields with concise but specific values that match the existing canon and emotional pressure.",
      shape: {
        dossier: {
          ...(Object.keys(personalityBehavior).length > 0 ? { personalityBehavior } : {}),
          ...(Object.keys(motivationStory).length > 0 ? { motivationStory } : {}),
        },
        ...(Object.keys(currentState).length > 0 ? { currentState } : {}),
      },
    });
  }

  const speechLanguage: Record<string, unknown> = {};
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.accent, 3)) speechLanguage.accent = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.dialect, 3)) speechLanguage.dialect = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.nativeLanguage, 3)) speechLanguage.nativeLanguage = "";
  if (includeAllFields || isThinListValue(character.dossier.speechLanguage.otherLanguages, 1)) speechLanguage.otherLanguages = [];
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.fluencyLevels, 10)) speechLanguage.fluencyLevels = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.formalityLevel, 8)) speechLanguage.formalityLevel = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.vocabularyLevel, 8)) speechLanguage.vocabularyLevel = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.educationInSpeech, 8)) speechLanguage.educationInSpeech = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.sentenceLength, 8)) speechLanguage.sentenceLength = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.directness, 8)) speechLanguage.directness = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.pointStyle, 8)) speechLanguage.pointStyle = "";
  if (includeAllFields || isThinListValue(character.dossier.speechLanguage.descriptors, 2)) speechLanguage.descriptors = [];
  if (includeAllFields || isThinListValue(character.dossier.speechLanguage.repeatedPhrases, 1)) speechLanguage.repeatedPhrases = [];
  if (includeAllFields || isThinListValue(character.dossier.speechLanguage.favoriteExpressions, 1)) speechLanguage.favoriteExpressions = [];
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.swearingLevel, 8)) speechLanguage.swearingLevel = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.rhythm, 8)) speechLanguage.rhythm = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.emotionalShifts, 10)) speechLanguage.emotionalShifts = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.angrySpeech, 12)) speechLanguage.angrySpeech = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.scaredSpeech, 12)) speechLanguage.scaredSpeech = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.lyingSpeech, 12)) speechLanguage.lyingSpeech = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.persuasiveSpeech, 12)) speechLanguage.persuasiveSpeech = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.superiorSpeech, 12)) speechLanguage.superiorSpeech = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.inferiorSpeech, 12)) speechLanguage.inferiorSpeech = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.lovedOnesSpeech, 12)) speechLanguage.lovedOnesSpeech = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.avoidedTopics, 10)) speechLanguage.avoidedTopics = "";
  if (includeAllFields || isThinTextValue(character.dossier.speechLanguage.commonMisunderstandings, 10)) speechLanguage.commonMisunderstandings = "";
  const bodyPresence: Record<string, unknown> = {};
  if (includeAllFields || isThinTextValue(character.dossier.bodyPresence.physicalDescription, 12)) bodyPresence.physicalDescription = "";
  if (includeAllFields || isThinTextValue(character.dossier.bodyPresence.build, 6)) bodyPresence.build = "";
  if (includeAllFields || isThinTextValue(character.dossier.bodyPresence.clothingStyle, 8)) bodyPresence.clothingStyle = "";
  if (includeAllFields || isThinTextValue(character.dossier.bodyPresence.grooming, 8)) bodyPresence.grooming = "";
  if (includeAllFields || isThinListValue(character.dossier.bodyPresence.distinguishingFeatures, 1)) bodyPresence.distinguishingFeatures = [];
  if (includeAllFields || isThinTextValue(character.dossier.bodyPresence.posture, 8)) bodyPresence.posture = "";
  if (includeAllFields || isThinTextValue(character.dossier.bodyPresence.movementStyle, 8)) bodyPresence.movementStyle = "";
  if (includeAllFields || isThinTextValue(character.dossier.bodyPresence.eyeContact, 8)) bodyPresence.eyeContact = "";
  if (includeAllFields || isThinListValue(character.dossier.bodyPresence.habitsTics, 1)) bodyPresence.habitsTics = [];
  if (includeAllFields || isThinTextValue(character.dossier.bodyPresence.roomEntry, 10)) bodyPresence.roomEntry = "";
  if (includeAllFields || isThinTextValue(character.dossier.bodyPresence.presenceFeel, 10)) bodyPresence.presenceFeel = "";
  const relationshipDynamics: Record<string, unknown> = {};
  if (includeAllFields || isThinListValue(character.dossier.relationshipDynamics.friends, 1)) relationshipDynamics.friends = [];
  if (includeAllFields || isThinListValue(character.dossier.relationshipDynamics.enemies, 1)) relationshipDynamics.enemies = [];
  if (includeAllFields || isThinListValue(character.dossier.relationshipDynamics.rivals, 1)) relationshipDynamics.rivals = [];
  if (includeAllFields || isThinListValue(character.dossier.relationshipDynamics.loversExes, 1)) relationshipDynamics.loversExes = [];
  if (includeAllFields || isThinListValue(character.dossier.relationshipDynamics.family, 1)) relationshipDynamics.family = [];
  if (includeAllFields || isThinListValue(character.dossier.relationshipDynamics.mentors, 1)) relationshipDynamics.mentors = [];
  if (includeAllFields || isThinListValue(character.dossier.relationshipDynamics.subordinatesSuperiors, 1)) relationshipDynamics.subordinatesSuperiors = [];
  if (includeAllFields || isThinTextValue(character.dossier.relationshipDynamics.trustLevels, 10)) relationshipDynamics.trustLevels = "";
  if (includeAllFields || isThinTextValue(character.dossier.relationshipDynamics.hiddenLoyalties, 10)) relationshipDynamics.hiddenLoyalties = "";
  if (includeAllFields || isThinTextValue(character.dossier.relationshipDynamics.unspokenTensions, 10)) relationshipDynamics.unspokenTensions = "";
  if (includeAllFields || isThinTextValue(character.dossier.relationshipDynamics.powerDynamics, 10)) relationshipDynamics.powerDynamics = "";
  const needsFreeTextCore = !includeAllFields && isThinTextValue(character.dossier.freeTextCore, 180);
  if (
    Object.keys(speechLanguage).length > 0 ||
    Object.keys(bodyPresence).length > 0 ||
    Object.keys(relationshipDynamics).length > 0 ||
    needsFreeTextCore
  ) {
    sections.push({
      label: "voice, body, and relationships",
      maxOutputTokens: 420,
      guidance:
        "Fill the requested voice, dialect, body-language, and relationship fields. Distinguish the character's speech and emotional behavior clearly, and keep the values brief and concrete.",
      shape: {
        dossier: {
          ...(Object.keys(speechLanguage).length > 0 ? { speechLanguage } : {}),
          ...(Object.keys(bodyPresence).length > 0 ? { bodyPresence } : {}),
          ...(Object.keys(relationshipDynamics).length > 0 ? { relationshipDynamics } : {}),
          ...(needsFreeTextCore ? { freeTextCore: "" } : {}),
        },
      },
    });
  }

  if (sections.length === 0) {
    sections.push({
      label: "dossier refresh",
      maxOutputTokens: 280,
      guidance: "Refresh the most useful parts of the dossier while preserving the strong existing canon.",
      shape: {
        summary: "",
        dossier: { freeTextCore: "" },
        currentState: { emotionalState: "" },
      },
    });
  }

  return sections;
}

function mergeCharacterDossierSections(baseDossier: CharacterRecord["dossier"], patch: Record<string, unknown>) {
  const patchDossier = patch.dossier && typeof patch.dossier === "object" ? (patch.dossier as Record<string, unknown>) : {};
  return normalizeCharacterDossier(
    {
      ...baseDossier,
      ...patchDossier,
      basicIdentity: {
        ...baseDossier.basicIdentity,
        ...((patchDossier.basicIdentity as Record<string, unknown> | undefined) ?? {}),
      },
      lifePosition: {
        ...baseDossier.lifePosition,
        ...((patchDossier.lifePosition as Record<string, unknown> | undefined) ?? {}),
      },
      personalityBehavior: {
        ...baseDossier.personalityBehavior,
        ...((patchDossier.personalityBehavior as Record<string, unknown> | undefined) ?? {}),
      },
      motivationStory: {
        ...baseDossier.motivationStory,
        ...((patchDossier.motivationStory as Record<string, unknown> | undefined) ?? {}),
      },
      speechLanguage: {
        ...baseDossier.speechLanguage,
        ...((patchDossier.speechLanguage as Record<string, unknown> | undefined) ?? {}),
      },
      bodyPresence: {
        ...baseDossier.bodyPresence,
        ...((patchDossier.bodyPresence as Record<string, unknown> | undefined) ?? {}),
      },
      relationshipDynamics: {
        ...baseDossier.relationshipDynamics,
        ...((patchDossier.relationshipDynamics as Record<string, unknown> | undefined) ?? {}),
      },
    },
    String((patchDossier.basicIdentity as Record<string, unknown> | undefined)?.fullName ?? baseDossier.basicIdentity.fullName ?? ""),
  );
}

function collectCharacterFieldPaths(shape: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(shape).flatMap(([key, value]) => {
    const nextPath = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(value)) {
      return [nextPath];
    }
    if (value && typeof value === "object") {
      return collectCharacterFieldPaths(value as Record<string, unknown>, nextPath);
    }
    return [nextPath];
  });
}

function extractCharacterShapeValues(source: unknown, shape: Record<string, unknown>): Record<string, unknown> {
  const sourceObject = source && typeof source === "object" ? (source as Record<string, unknown>) : {};
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(shape)) {
    const currentValue = sourceObject[key];
    if (Array.isArray(value)) {
      result[key] = Array.isArray(currentValue) ? currentValue : [];
      continue;
    }
    if (value && typeof value === "object") {
      result[key] = extractCharacterShapeValues(currentValue, value as Record<string, unknown>);
      continue;
    }
    result[key] = currentValue ?? "";
  }

  return result;
}

function collectEmptyCharacterFieldPaths(source: unknown, shape: Record<string, unknown>, prefix = ""): string[] {
  const sourceObject = source && typeof source === "object" ? (source as Record<string, unknown>) : {};
  return Object.entries(shape).flatMap(([key, value]) => {
    const nextPath = prefix ? `${prefix}.${key}` : key;
    const currentValue = sourceObject[key];
    if (Array.isArray(value)) {
      return splitLines(String(Array.isArray(currentValue) ? currentValue.join("|") : currentValue ?? "")).length > 0
        ? []
        : [nextPath];
    }
    if (value && typeof value === "object") {
      return collectEmptyCharacterFieldPaths(currentValue, value as Record<string, unknown>, nextPath);
    }
    return String(currentValue ?? "").trim() ? [] : [nextPath];
  });
}

function setCharacterFieldPath(target: Record<string, unknown>, path: string, value: unknown) {
  const segments = path.split(".");
  let current: Record<string, unknown> = target;
  segments.forEach((segment, index) => {
    if (index === segments.length - 1) {
      current[segment] = value;
      return;
    }
    if (!current[segment] || typeof current[segment] !== "object" || Array.isArray(current[segment])) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  });
}

function characterPayloadLeafCount(value: unknown): number {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean).length;
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).reduce<number>(
      (sum, entry) => sum + characterPayloadLeafCount(entry),
      0,
    );
  }
  return String(value ?? "").trim() ? 1 : 0;
}

function looksLikeCharacterFieldGarbage(path: string, value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  if (looksLikeMetaOutput(value)) {
    return true;
  }
  if (
    normalized.includes("::") ||
    normalized.includes("=>") ||
    normalized.includes("dossier.") ||
    normalized.includes("quickprofile.") ||
    normalized.includes("currentstate.") ||
    normalized.includes("relationshipdynamics") ||
    normalized.includes("personalitybehavior") ||
    normalized.includes("speechlanguage") ||
    normalized.includes("basicidentity") ||
    normalized.includes("lifeposition")
  ) {
    return true;
  }
  if (
    normalized.includes("should remain specific") ||
    normalized.includes("canon-safe") ||
    normalized.includes("requested field") ||
    normalized.includes("field path") ||
    normalized.includes("the dossier") ||
    normalized.includes("app-ready")
  ) {
    return true;
  }
  if (/^(guarded|precise|grief[- ]driven)(?:\s*[|,]\s*(guarded|precise|grief[- ]driven)){1,3}$/i.test(value.trim())) {
    return true;
  }
  if (path === "quickProfile.age" && value.trim().split(/\s+/).length > 9) {
    return true;
  }
  return false;
}

function cleanCharacterLineValue(path: string, rawValue: string) {
  const cleaned = cleanAiFieldText(rawValue, "");
  if (looksLikeCharacterFieldGarbage(path, cleaned)) {
    return null;
  }
  if (CHARACTER_LIST_FIELD_PATHS.has(path)) {
    const items = splitLines(cleaned)
      .map((entry) => entry.replace(/^["'`]+|["'`]+$/g, "").trim())
      .filter((entry) => entry && !looksLikeCharacterFieldGarbage(path, entry));
    const normalizedItems = items.map((entry) => entry.toLowerCase());
    const uniqueItems = items.filter((entry, index) => normalizedItems.indexOf(entry.toLowerCase()) === index).slice(0, 5);
    if (uniqueItems.length === 0) {
      return null;
    }
    return uniqueItems;
  }
  return cleaned;
}

function inferCharacterEmotionalStateFromRecord(character: CharacterRecord) {
  const explicit = String(character.currentState.emotionalState ?? "").trim();
  if (explicit) {
    return explicit;
  }

  const tendency = String(character.dossier.personalityBehavior.emotionalTendencies ?? "").trim();
  if (tendency) {
    return tendency;
  }

  const shifts = String(character.dossier.speechLanguage.emotionalShifts ?? "").trim();
  if (shifts) {
    return shifts;
  }

  const conflict = String(character.dossier.motivationStory.internalConflict ?? "").trim();
  const fear = String(character.fear ?? character.dossier.personalityBehavior.fearTriggers ?? "").trim();
  const goal = String(character.goal ?? character.dossier.motivationStory.shortTermGoal ?? "").trim();

  if (conflict && fear) {
    return `${conflict}; privately strained by ${fear.toLowerCase()}`;
  }
  if (conflict) {
    return conflict;
  }
  if (fear && goal) {
    return `Driven toward ${goal.toLowerCase()} but anxious about ${fear.toLowerCase()}`;
  }
  if (fear) {
    return `Guarded and pressured by ${fear.toLowerCase()}`;
  }
  if (goal) {
    return `Focused on ${goal.toLowerCase()}`;
  }

  return "";
}

function parseCharacterFieldLines(raw: string, allowedPaths: string[]) {
  const payload: Record<string, unknown> = {};
  const cleanedLines = raw
    .replace(/```[a-z]*|```/gi, " ")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const pathMatchers = allowedPaths
    .slice()
    .sort((left, right) => right.length - left.length)
    .map((path) => ({ path, normalized: path.toLowerCase() }));

  for (const line of cleanedLines) {
    for (const matcher of pathMatchers) {
      if (!line.toLowerCase().startsWith(matcher.normalized)) {
        continue;
      }
      const rest = line.slice(matcher.path.length).trimStart();
      const delimiter = ["::", "=>", "="].find((entry) => rest.startsWith(entry));
      if (!delimiter) {
        continue;
      }
      const value = rest.slice(delimiter.length).trim();
      if (!value) {
        break;
      }
      const cleanedValue = cleanCharacterLineValue(matcher.path, value);
      if (cleanedValue !== null) {
        setCharacterFieldPath(payload, matcher.path, cleanedValue);
      }
      break;
    }
  }

  return payload;
}

function mergeCharacterAiPayload(
  baseCharacter: CharacterRecord,
  draftPayload: Record<string, unknown>,
  parsed: Record<string, unknown> | null,
  fallbackDossier: string,
) {
  const mergedPayload: Record<string, unknown> = {
    ...draftPayload,
  };
  const baseName = String(draftPayload.name ?? baseCharacter.name ?? "").trim();
  if (baseName) {
    mergedPayload.name = baseName;
  }
  const baseRole = String(draftPayload.role ?? baseCharacter.role ?? "").trim();
  if (baseRole) {
    mergedPayload.role = baseRole;
  }

  if (parsed) {
    for (const fieldKey of ["summary", "role", "goal", "fear", "secret", "wound", "notes"] as const) {
      if (typeof parsed[fieldKey] === "string" && String(parsed[fieldKey]).trim()) {
        mergedPayload[fieldKey] = cleanFieldText(
          fieldKey,
          String(parsed[fieldKey]),
          String((baseCharacter as unknown as Record<string, unknown>)[fieldKey] ?? ""),
        );
      }
    }
    if (parsed.quickProfile && typeof parsed.quickProfile === "object") {
      mergedPayload.quickProfile = normalizeCharacterQuickProfile({
        ...baseCharacter.quickProfile,
        ...(parsed.quickProfile as Record<string, unknown>),
      });
    }
    if (parsed.dossier && typeof parsed.dossier === "object") {
      const nextDossier = parsed.dossier as Record<string, unknown>;
      const cleanedFreeTextCore =
        typeof nextDossier.freeTextCore === "string"
          ? cleanGeneratedText(String(nextDossier.freeTextCore)).trim()
          : "";
      mergedPayload.dossier = mergeCharacterDossierSections(baseCharacter.dossier, {
        dossier: {
          ...nextDossier,
          ...(cleanedFreeTextCore && !looksLikeMetaOutput(cleanedFreeTextCore)
            ? { freeTextCore: cleanedFreeTextCore }
            : {}),
        },
      });
    }
    if (parsed.currentState && typeof parsed.currentState === "object") {
      mergedPayload.currentState = normalizeCharacterState({
        ...baseCharacter.currentState,
        ...(parsed.currentState as Record<string, unknown>),
      });
    }
  } else if (fallbackDossier && !looksLikeMetaOutput(fallbackDossier)) {
    const existingDossier =
      mergedPayload.dossier && typeof mergedPayload.dossier === "object"
        ? mergeCharacterDossierSections(baseCharacter.dossier, {
            dossier: mergedPayload.dossier as Record<string, unknown>,
          })
        : baseCharacter.dossier;
    mergedPayload.dossier = mergeCharacterDossierSections(existingDossier, {
      dossier: {
        freeTextCore: fallbackDossier,
      },
    });
    if (String(mergedPayload.summary ?? baseCharacter.summary ?? "").trim().length < 40) {
      mergedPayload.summary = cleanFieldText(
        "summary",
        fallbackDossier.split(/\n+/)[0] ?? fallbackDossier,
        String(mergedPayload.summary ?? baseCharacter.summary ?? ""),
      );
    }
  }

  if (!String(mergedPayload.role ?? "").trim()) {
    const inferredRole = [
      (mergedPayload.quickProfile as Record<string, unknown> | undefined)?.profession,
      ((mergedPayload.dossier as Record<string, unknown> | undefined)?.lifePosition as Record<string, unknown> | undefined)?.roleTitle,
      ((mergedPayload.dossier as Record<string, unknown> | undefined)?.lifePosition as Record<string, unknown> | undefined)?.profession,
    ]
      .map((entry) => String(entry ?? "").trim())
      .find(Boolean);
    if (inferredRole) {
      mergedPayload.role = inferredRole;
    }
  }

  const previewCharacter = applyCharacterPatch(baseCharacter, mergedPayload);
  const inferredEmotion = inferCharacterEmotionalStateFromRecord(previewCharacter);
  if (inferredEmotion) {
    mergedPayload.currentState = normalizeCharacterState({
      ...previewCharacter.currentState,
      emotionalState: inferredEmotion,
    });
  }

  const nextQuickProfile =
    mergedPayload.quickProfile && typeof mergedPayload.quickProfile === "object"
      ? { ...(mergedPayload.quickProfile as Record<string, unknown>) }
      : {};
  const nextDossier =
    mergedPayload.dossier && typeof mergedPayload.dossier === "object"
      ? mergeCharacterDossierSections(baseCharacter.dossier, { dossier: mergedPayload.dossier as Record<string, unknown> })
      : baseCharacter.dossier;

  if (!String(nextQuickProfile.accent ?? "").trim() && nextDossier.speechLanguage.accent) {
    nextQuickProfile.accent = nextDossier.speechLanguage.accent;
  }
  if (!String(nextQuickProfile.speechPattern ?? "").trim()) {
    const speechPattern =
      nextDossier.speechLanguage.descriptors.join(", ") ||
      nextDossier.speechLanguage.directness ||
      nextDossier.speechLanguage.rhythm;
    if (speechPattern) {
      nextQuickProfile.speechPattern = speechPattern;
    }
  }
  if (Object.keys(nextQuickProfile).length > 0) {
    mergedPayload.quickProfile = normalizeCharacterQuickProfile({
      ...baseCharacter.quickProfile,
      ...nextQuickProfile,
    });
  }

  return mergedPayload;
}

async function generateSinglePlanningFieldValue(options: {
  project: ProjectWorkspace;
  chapter: ProjectWorkspace["chapters"][number];
  fieldKey: AssistFieldKey;
  fieldLabel: string;
  action: Exclude<PlanningAction, "develop"> | "develop";
  instruction?: string;
}) {
  const { project, chapter, fieldKey, fieldLabel, action, instruction } = options;
  const currentValue = chapterFieldValue(chapter, fieldKey);
  const hasRealCurrentValue = Boolean(currentValue.trim()) && !looksLikePlaceholderValue(currentValue);
  const context = buildContextPackage(project, chapter.id, currentValue || chapter.draft || chapter.outline);
  const previousChapter = project.chapters.find((entry) => entry.number === chapter.number - 1) ?? null;
  const nextChapter = project.chapters.find((entry) => entry.number === chapter.number + 1) ?? null;
  const fieldSpec = CHAPTER_FIELD_SPECS.find((field) => field.key === fieldKey);
  const thinCurrent = chapterFieldLooksThin(fieldKey, currentValue, chapter.number);
  const prompt = buildPromptEnvelope(
    `Update ${fieldLabel || fieldSpec?.label || fieldKey}`,
    project,
    context,
    [
      `Target area: Story Skeleton -> Chapter Runway -> ${chapter.title || `Chapter ${chapter.number}`} -> ${fieldLabel || fieldKey}.`,
      "Update only this one field. Do not write to notes. Do not write to the manuscript unless the target field is the manuscript.",
      "Use all existing project, series, story-bible, skeleton, chapter, memory, and continuity material as binding canon.",
      "Do not contradict already written or already planned material. Extend, refine, reconcile, or sharpen it.",
      hasRealCurrentValue
        ? "Base the result on what is already written in this exact textbox. Preserve its core idea and improve that existing text instead of wandering away from it."
        : "The textbox is blank, so you may generate the field freely as long as it stays canon-safe.",
      thinCurrent
        ? "The current field value is blank, generic, or placeholder-level. Replace it with specific canon-safe content. Do not repeat the placeholder wording."
        : "Keep the useful core of the current field value, but make it stronger and more specific.",
      instruction ? `Additional request context:\n${instruction}` : "",
      chapterFieldInstruction(fieldKey, action),
      fieldSpec ? `Field purpose: ${fieldSpec.description}\nExample shape: ${fieldSpec.example}` : "",
      previousChapter
        ? `Previous chapter context: Chapter ${previousChapter.number} - ${previousChapter.title}. Purpose: ${previousChapter.purpose}`
        : "",
      nextChapter
        ? `Next chapter target: Chapter ${nextChapter.number} - ${nextChapter.title}. Purpose: ${nextChapter.purpose}`
        : "",
      hasRealCurrentValue ? `Current field value:\n${currentValue}` : "Current field value is blank.",
      "Return only the final text to store in this field. No explanations, no labels, no markdown fences.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    "You are a precise outlining and planning partner. Write directly into the target planning field, not around it.",
  );

  const raw = await generateTextOrFallback(
    prompt,
    fieldKey === "outline" ? 1400 : 900,
    fallbackChapterFieldValue({ project, chapter, fieldKey, currentValue, instruction }),
  );
  let generated = raw?.trim();
  if (!generated) {
    return null;
  }
  if (fieldKey !== "title" && looksLikeMetaOutput(generated)) {
    generated = await repairMetaOutput({
      project,
      context,
      task: `Repair ${fieldLabel || fieldSpec?.label || fieldKey}`,
      instruction: chapterFieldInstruction(fieldKey, action),
      badOutput: generated,
      roleInstruction: "Return only the corrected field content.",
      maxOutputTokens: fieldKey === "outline" ? 1400 : 900,
    });
  }
  if (fieldKey === "title") {
    const cleanedTitle = cleanTitle(generated, currentValue);
    if (looksLikeWeakTitle(cleanedTitle)) {
      const repairPrompt = buildPromptEnvelope(
        "Repair chapter title",
        project,
        context,
        [
          `Target chapter: Chapter ${chapter.number}.`,
          "The previous result was not a usable chapter title.",
          "Return only a commercially strong chapter title, 2 to 6 words.",
          "No explanation. No reasoning. No labels. No punctuation at the end.",
          `Story premise: ${project.premise}`,
          `Chapter purpose: ${chapter.purpose}`,
          `Chapter outline: ${chapter.outline}`,
          `Rejected result: ${generated}`,
        ].join("\n\n"),
        "Return only the final title.",
      );
      const repaired = await generateTextOrFallback(
        repairPrompt,
        80,
        fallbackChapterFieldValue({ project, chapter, fieldKey, currentValue, instruction }),
      );
      generated = repaired?.trim() || generated;
    }
  }

  return generated;
}

async function generateSingleStoryBibleFieldValue(options: {
  project: ProjectWorkspace;
  entityType: StoryBibleEntityType;
  entity: Record<string, unknown>;
  itemTitle: string;
  fieldKey: string;
  fieldLabel: string;
  action: Exclude<PlanningAction, "develop"> | "develop";
  contextChapterId: string;
  instruction?: string;
}) {
  const { project, entityType, entity, itemTitle, fieldKey, fieldLabel, action, contextChapterId, instruction } = options;
  const spec = STORY_BIBLE_ENTITY_SPECS.find((entry) => entry.entityType === entityType);
  const fieldSpec = spec?.fields.find((field) => field.key === fieldKey);
  const currentValue = getEntityValue(entity, fieldKey);
  const hasRealCurrentValue = Boolean(currentValue.trim()) && !looksLikePlaceholderValue(currentValue);
  const context = buildContextPackage(project, contextChapterId, currentValue);
  const thinCurrent = storyBibleFieldLooksThin(fieldKey, currentValue);
  const prompt = buildPromptEnvelope(
    `Update ${spec?.label ?? "Story Bible field"}`,
    project,
    context,
    [
      `Target area: Story Bible -> ${spec?.label ?? "Entry"} -> ${itemTitle || String(entity.name ?? entity.title ?? entity.label ?? "Untitled")} -> ${fieldLabel || fieldKey}.`,
      "Update only this exact field on this exact record.",
      "Use all existing project, series, story-bible, skeleton, chapter, memory, and continuity material as binding canon.",
      "Do not invent contradictions. Improve what already exists and keep it synchronized with the rest of the project.",
      hasRealCurrentValue
        ? "Base the result on what is already written in this exact textbox. Preserve its core idea and improve that existing text instead of drifting into a different record."
        : "The textbox is blank, so you may generate the field freely as long as it stays canon-safe.",
      thinCurrent
        ? "The current field value is blank, generic, or thin. Replace it with specific canon-safe content instead of repeating the placeholder."
        : "Keep the useful core of the current field value, but make it stronger and more specific.",
      instruction ? `Additional request context:\n${instruction}` : "",
      action === "expand"
        ? "Expand this field into something fuller, more specific, and more useful."
        : action === "tighten"
          ? "Tighten this field into a shorter, cleaner, sharper version without losing the core idea."
          : "Develop this field so it becomes specific, useful, and canon-safe.",
      fieldSpec ? `Field purpose: ${fieldSpec.description}\nExample shape: ${fieldSpec.example}` : "",
      hasRealCurrentValue ? `Current field value:\n${currentValue}` : "Current field value is blank.",
      "Return only the final value for this field. No commentary, no JSON, no labels.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    "You are a canon-safe story bible editor. Write the exact field value, not notes about it.",
  );

  const raw = await generateTextOrFallback(
    prompt,
    900,
    fallbackStoryBibleFieldValue(project, fieldKey, itemTitle, currentValue, instruction),
  );
  let generated = raw?.trim();
  if (!generated) {
    return null;
  }
  if (looksLikeMetaOutput(generated)) {
    generated = await repairMetaOutput({
      project,
      context,
      task: `Repair ${spec?.label ?? "Story Bible"} field`,
      instruction: [
        `Target area: Story Bible -> ${spec?.label ?? "Entry"} -> ${itemTitle || String(entity.name ?? entity.title ?? entity.label ?? "Untitled")} -> ${fieldLabel || fieldKey}.`,
        "Update only this exact field on this exact record.",
        action === "expand"
          ? "Expand this field into something fuller, more specific, and more useful."
          : action === "tighten"
            ? "Tighten this field into a shorter, cleaner, sharper version without losing the core idea."
            : "Develop this field so it becomes specific, useful, and canon-safe.",
        "Return only the final value for this field.",
      ].join("\n\n"),
      badOutput: generated,
      roleInstruction: "Return only the corrected Story Bible field value.",
      maxOutputTokens: 900,
    });
  }
  return generated;
}

function findStoryBibleEntity(project: ProjectWorkspace, itemId: string): {
  entityType: StoryBibleEntityType;
  entity: Record<string, unknown>;
} | null {
  const groups: Array<[StoryBibleEntityType, Record<string, unknown>[]]> = [
    ["character", project.characters as unknown as Record<string, unknown>[]],
    ["relationship", project.relationships as unknown as Record<string, unknown>[]],
    ["plotThread", project.plotThreads as unknown as Record<string, unknown>[]],
    ["location", project.locations as unknown as Record<string, unknown>[]],
    ["faction", project.factions as unknown as Record<string, unknown>[]],
    ["timelineEvent", project.timelineEvents as unknown as Record<string, unknown>[]],
    ["workingNote", project.workingNotes as unknown as Record<string, unknown>[]],
  ];

  for (const [entityType, entities] of groups) {
    const entity = entities.find((entry) => String(entry.id) === itemId);
    if (entity) {
      return { entityType, entity };
    }
  }

  return null;
}

function lastUsefulChapterId(project: ProjectWorkspace) {
  return (
    project.chapters.findLast((chapter) => chapter.draft.trim() || chapter.outline.trim())?.id ??
    project.chapters.at(0)?.id ??
    null
  );
}

export async function runTargetedPlanningFieldAi(input: {
  projectId: string;
  itemId: string;
  itemTitle: string;
  fieldKey: AssistFieldKey;
  fieldLabel: string;
  action: PlanningAction;
  currentValue?: string;
  instruction?: string;
  draftItem?: Record<string, unknown>;
}) {
  const project = await getProjectWorkspace(input.projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  const chapter = resolveProjectChapter(project, input.itemId);
  if (!chapter) {
    throw new Error("Chapter not found.");
  }

  const workingChapter = mergeDraftIntoChapter(chapter, input.draftItem);
  const currentValue = input.currentValue?.trim()
    ? input.currentValue
    : chapterFieldValue(workingChapter, input.fieldKey);

  const generated = await generateSinglePlanningFieldValue({
    project,
    chapter: workingChapter,
    fieldKey: input.fieldKey,
    fieldLabel: input.fieldLabel,
    action: input.action,
    instruction: input.instruction,
  });
  if (!generated) {
    throw new Error("AI did not return any visible planning text.");
  }

  await updateChapter(chapter.id, {
    ...buildChapterDraftPatchFromRecord(input.draftItem),
    ...normalizeChapterFieldUpdate(input.fieldKey, currentValue, generated),
  });
  const nextProject = (await getProjectWorkspace(input.projectId)) ?? project;
  return {
    project: nextProject,
    contextPackage: null,
  };
}

export async function runTargetedSkeletonFieldAi(input: {
  projectId: string;
  targetEntityType: SkeletonEntityType;
  itemId: string;
  itemTitle: string;
  fieldKey: string;
  fieldLabel: string;
  action: PlanningAction;
  currentValue?: string;
  instruction?: string;
  draftItem?: Record<string, unknown>;
}) {
  const project = await getProjectWorkspace(input.projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  const entity = findSkeletonEntity(project, input.targetEntityType, input.itemId);
  if (!entity) {
    throw new Error(input.targetEntityType === "structureBeat" ? "Structure beat not found." : "Scene card not found.");
  }

  const contextChapterId = lastUsefulChapterId(project);
  if (!contextChapterId) {
    throw new Error("Project has no chapter context yet.");
  }

  const workingEntity = mergeDraftIntoEntity(entity, input.draftItem);
  const currentValue = input.currentValue?.trim() ? input.currentValue : getEntityValue(workingEntity, input.fieldKey);

  const generated = await generateSingleSkeletonFieldValue({
    project,
    targetEntityType: input.targetEntityType,
    entity: workingEntity,
    itemTitle: input.itemTitle,
    fieldKey: input.fieldKey,
    fieldLabel: input.fieldLabel,
    action: input.action,
    contextChapterId,
    instruction: input.instruction,
  });
  if (!generated) {
    throw new Error("AI did not return any visible Story Skeleton text.");
  }

  await mutateSkeleton(
    project.id,
    {
      entityType: input.targetEntityType,
      id: input.itemId,
      payload: {
        ...buildStoryBibleDraftPayload(input.draftItem),
        [input.fieldKey]: normalizeSkeletonFieldValue(input.fieldKey, generated, currentValue),
      },
    },
    "PATCH",
  );

  const nextProject = (await getProjectWorkspace(input.projectId)) ?? project;
  return {
    project: nextProject,
    contextPackage: null,
  };
}

export async function runTargetedStoryBibleFieldAi(input: {
  projectId: string;
  itemId: string;
  itemTitle: string;
  fieldKey: string;
  fieldLabel: string;
  action: PlanningAction;
  currentValue?: string;
  instruction?: string;
  draftItem?: Record<string, unknown>;
}) {
  const project = await getProjectWorkspace(input.projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  const match = findStoryBibleEntity(project, input.itemId);
  if (!match) {
    throw new Error("Story Bible record not found.");
  }

  const contextChapterId = lastUsefulChapterId(project);
  if (!contextChapterId) {
    throw new Error("Project has no chapter context yet.");
  }

  const workingEntity = mergeDraftIntoEntity(match.entity, input.draftItem);
  const currentValue = input.currentValue?.trim()
    ? input.currentValue
    : getEntityValue(workingEntity, input.fieldKey);

  const generated = await generateSingleStoryBibleFieldValue({
    project,
    entityType: match.entityType,
    entity: workingEntity,
    itemTitle: input.itemTitle,
    fieldKey: input.fieldKey,
    fieldLabel: input.fieldLabel,
    action: input.action,
    contextChapterId,
    instruction: input.instruction,
  });
  if (!generated) {
    throw new Error("AI did not return any visible Story Bible text.");
  }

  await mutateStoryBible(
    project.id,
      {
        entityType: match.entityType,
        id: input.itemId,
        payload: {
          ...buildStoryBibleDraftPayload(input.draftItem),
          [input.fieldKey]: normalizeStoryBibleFieldValue(input.fieldKey, generated, currentValue),
        },
      },
    "PATCH",
  );

  const nextProject = (await getProjectWorkspace(input.projectId)) ?? project;
  return {
    project: nextProject,
    contextPackage: null,
  };
}

export async function runTargetedCharacterAi(input: {
  projectId: string;
  characterId: string;
  action: "develop-dossier" | "expand-summary" | "tighten-summary";
  draftCharacter?: Record<string, unknown>;
  instruction?: string;
}) {
  const project = await getProjectWorkspace(input.projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  const character = project.characters.find((entry) => entry.id === input.characterId);
  if (!character) {
    throw new Error("Character not found.");
  }

  const contextChapterId = lastUsefulChapterId(project);
  if (!contextChapterId) {
    throw new Error("Project has no chapter context yet.");
  }

  const workingCharacter = mergeCharacterDraft(character, input.draftCharacter);
  const draftCharacterPayload = buildCharacterDraftPayload(input.draftCharacter);
  const compactCanon = compactCharacterCanon(project, contextChapterId, workingCharacter);
  let nextCharacter = workingCharacter;

  if (input.action !== "develop-dossier") {
    const prompt = [
      "You are a sharp character editor.",
      compactCanon,
      `Target area: Story Bible -> Character Master -> ${workingCharacter.name || "Unnamed character"} -> Summary.`,
      input.action === "expand-summary"
        ? "Expand the summary into a fuller, more specific, more human portrait."
        : "Tighten the summary into a cleaner, shorter, sharper version without losing essential canon.",
      workingCharacter.summary
        ? "Base the result on the exact summary already written in this textbox. Preserve its core idea while improving it."
        : "The summary textbox is blank, so you may draft it freely as long as it stays canon-safe.",
      input.instruction ? `Additional request context:\n${input.instruction}` : "",
      `Current summary:\n${workingCharacter.summary || "(blank)"}`,
      "Return only the final summary text. No labels. No commentary.",
    ]
      .filter(Boolean)
      .join("\n\n");
    const raw = await generateTextOrFallback(
      prompt,
      260,
      fallbackCharacterFieldValue(workingCharacter, project, "summary"),
    );
    const summary = raw?.trim();
    if (!summary) {
      throw new Error("AI did not return any visible character summary.");
    }
    await mutateStoryBible(
      project.id,
      {
        entityType: "character",
        id: character.id,
        payload: {
          ...draftCharacterPayload,
          summary: cleanFieldText("summary", summary, workingCharacter.summary),
        },
      },
      "PATCH",
    );
    nextCharacter = applyCharacterPatch(workingCharacter, {
      ...draftCharacterPayload,
      summary: cleanFieldText("summary", summary, workingCharacter.summary),
    });
  } else {
    const sectionPrompts = buildCharacterSectionPrompts(workingCharacter);
    let aggregatePayload: Record<string, unknown> = { ...draftCharacterPayload };
    let fallbackDossier = "";
    const sectionResults = await Promise.all(
      sectionPrompts.map(async (section) => {
        const fieldPaths = collectCharacterFieldPaths(section.shape);
        const sectionCharacter = applyCharacterPatch(workingCharacter, aggregatePayload);
        const sectionSnapshot = {
          name: sectionCharacter.name,
          ...extractCharacterShapeValues(sectionCharacter, section.shape),
        };
        const prompt = [
          "You are a fast character architect.",
          compactCanon,
          `Target area: Story Bible -> Character Master -> ${workingCharacter.name || "Unnamed character"} -> ${section.label}.`,
          "Respect what is already written in the visible character textboxes. Treat those entries as primary canon.",
          "Fill every requested field for this section. When a field already has useful text, preserve its core idea and sharpen it instead of changing it arbitrarily.",
          "Keep values compact, concrete, and immediately usable inside the app.",
          "Use short lists for array fields and short, vivid phrases for string fields.",
          "Do not output commentary.",
          "Do not describe what the field should do. Put the actual character fact, behavior, speech rule, or relationship in the field.",
          "Do not reuse the same three generic traits across unrelated fields.",
          "Do not include field names, JSON keys, app instructions, or words like dossier, canon-safe, requested field, or should remain specific inside field values.",
          "Every requested field path must appear exactly once in your answer, even if the value is short.",
          "Do not collapse multiple requested fields into one paragraph. Emit one path line per field.",
          "Return exactly one line per requested field using this format: path :: value",
          "For list fields, separate items with | on the same line.",
          input.instruction ? `Additional request context:\n${input.instruction}` : "",
          section.guidance,
          `Requested field paths:\n- ${fieldPaths.join("\n- ")}`,
          `Current values for these fields:\n${JSON.stringify(sectionSnapshot, null, 2)}`,
        ]
          .filter(Boolean)
          .join("\n\n");
        const sectionFallback = fallbackCharacterFieldLines(sectionCharacter, project, fieldPaths);
        const raw = await generateTextOrFallback(prompt, section.maxOutputTokens, sectionFallback);
        let parsed = raw ? parseCharacterFieldLines(raw, fieldPaths) : null;
        if (!parsed || Object.keys(parsed).length === 0) {
          const repairPrompt = [
            "Repair the character field lines.",
            compactCanon,
            `Target area: Story Bible -> Character Master -> ${workingCharacter.name || "Unnamed character"} -> ${section.label}.`,
            "Return exactly one line per requested field using the format path :: value.",
            "For list fields, separate items with |.",
            "Write the final field values only. Do not talk about the request, the app, field paths, or what the values should accomplish.",
            "Every field must receive a different, field-appropriate answer.",
            `Requested field paths:\n- ${fieldPaths.join("\n- ")}`,
            input.instruction ? `Additional request context:\n${input.instruction}` : "",
            `Rejected answer:\n${raw ?? ""}`,
          ]
            .filter(Boolean)
            .join("\n\n");
          const repaired = await generateTextOrFallback(repairPrompt, section.maxOutputTokens, sectionFallback);
          parsed = repaired ? parseCharacterFieldLines(repaired, fieldPaths) : null;
          return { parsed, raw: repaired ?? raw ?? "" };
        }
        return { parsed, raw: raw ?? "" };
      }),
    );

    let parsedLeafCount = 0;
    for (const result of sectionResults) {
      const resultRaw = cleanGeneratedText(result.raw ?? "").trim();
      const resultLeafCount = characterPayloadLeafCount(result.parsed);
      parsedLeafCount += resultLeafCount;
      if (resultLeafCount === 0 && resultRaw.length > fallbackDossier.length) {
        fallbackDossier = resultRaw;
      }
      aggregatePayload = mergeCharacterAiPayload(
        applyCharacterPatch(workingCharacter, aggregatePayload),
        aggregatePayload,
        result.parsed,
        "",
      );
    }

    const mergedPayload = mergeCharacterAiPayload(
      workingCharacter,
      aggregatePayload,
      null,
      parsedLeafCount === 0 ? fallbackDossier : "",
    );
    const previewCharacter = applyCharacterPatch(workingCharacter, mergedPayload);
    const missingPaths = sectionPrompts.flatMap((section) =>
      collectEmptyCharacterFieldPaths(
        {
          summary: previewCharacter.summary,
          role: previewCharacter.role,
          archetype: previewCharacter.archetype,
          goal: previewCharacter.goal,
          fear: previewCharacter.fear,
          secret: previewCharacter.secret,
          wound: previewCharacter.wound,
          notes: previewCharacter.notes,
          quickProfile: previewCharacter.quickProfile,
          dossier: previewCharacter.dossier,
          currentState: previewCharacter.currentState,
        },
        section.shape,
      ),
    );
    if (missingPaths.length > 0) {
      const repairPrompt = [
        "You are repairing a character dossier.",
        compactCanon,
        `Target area: Story Bible -> Character Master -> ${workingCharacter.name || "Unnamed character"} -> missing fields.`,
        "Return exactly one line per requested field using this format: path :: value",
        "For list fields, separate items with | on the same line.",
        "Do not output commentary.",
        "Write actual field values. Do not write field names, app instructions, or generic repeated trait triplets as values.",
        "Fill only the missing fields listed below. Keep everything consistent with the current saved character values.",
        input.instruction ? `Additional request context:\n${input.instruction}` : "",
        `Missing field paths:\n- ${missingPaths.join("\n- ")}`,
        `Current character values:\n${JSON.stringify(
          {
            name: previewCharacter.name,
            summary: previewCharacter.summary,
            role: previewCharacter.role,
            archetype: previewCharacter.archetype,
            goal: previewCharacter.goal,
            fear: previewCharacter.fear,
            secret: previewCharacter.secret,
            wound: previewCharacter.wound,
            notes: previewCharacter.notes,
            quickProfile: previewCharacter.quickProfile,
            dossier: previewCharacter.dossier,
            currentState: previewCharacter.currentState,
          },
          null,
          2,
        )}`,
      ]
        .filter(Boolean)
        .join("\n\n");
      const repairRaw = await generateTextOrFallback(
        repairPrompt,
        280,
        fallbackCharacterFieldLines(previewCharacter, project, missingPaths),
      );
      const repairParsed = repairRaw ? parseCharacterFieldLines(repairRaw, missingPaths) : null;
      if (repairParsed && Object.keys(repairParsed).length > 0) {
        Object.assign(
          mergedPayload,
          mergeCharacterAiPayload(previewCharacter, mergedPayload, repairParsed, ""),
        );
      }
    }
    if (Object.keys(mergedPayload).length === 0) {
      throw new Error("AI did not return usable character dossier content.");
    }
    await mutateStoryBible(
      project.id,
      {
        entityType: "character",
        id: character.id,
        payload: mergedPayload,
      },
      "PATCH",
    );
    nextCharacter = applyCharacterPatch(workingCharacter, mergedPayload);
  }

  let nextProject: ProjectWorkspace;
  try {
    nextProject = (await getProjectWorkspace(input.projectId)) ?? mergeCharacterIntoProject(project, character.id, nextCharacter);
  } catch {
    nextProject = mergeCharacterIntoProject(project, character.id, nextCharacter);
  }
  return {
    project: nextProject,
    contextPackage: null,
  };
}

export const __targetedFieldAiTestUtils = {
  characterPayloadLeafCount,
  cleanCharacterLineValue,
  collectCharacterFieldPaths,
  fallbackCharacterFieldLines,
  mergeCharacterAiPayload,
  parseCharacterFieldLines,
};
