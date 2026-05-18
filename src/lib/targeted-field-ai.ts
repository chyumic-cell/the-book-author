import { CHAPTER_FIELD_SPECS, STORY_BIBLE_ENTITY_SPECS } from "@/lib/assistant-site-map";
import { cleanAiFieldText, cleanGeneratedText, cleanSummaryText, looksLikeAiLeakage } from "@/lib/ai-output";
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
    looksLikeGarbledFieldOutput(value) ||
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

function oddFieldCharacterRatio(value: string) {
  const compact = value.replace(/\s/g, "");
  if (!compact) {
    return 1;
  }

  const allowed =
    compact.match(/[\p{Script=Latin}\p{Script=Hebrew}\p{Script=Arabic}\p{N}"'“”‘’.,!?;:()[\]{}\-–—…/%$&@]/gu)
      ?.length ?? 0;
  return 1 - allowed / compact.length;
}

function looksLikeGarbledFieldOutput(value: string) {
  const text = value.trim();
  if (!text) {
    return false;
  }

  const cjkCount = text.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g)?.length ?? 0;
  if (cjkCount > Math.max(4, Math.floor(text.length * 0.025))) {
    return true;
  }

  if (oddFieldCharacterRatio(text) > 0.1) {
    return true;
  }

  return /(?:\bfunction\s*\(|\bimport\s+|ModelBase|ToolChain|x0041|hrefBEGINN|drinkingFountain|pyrolyse|```|\\hat|<\s*\/?\w+)/i.test(
    text,
  );
}

function looksLikePlaceholderValue(value: string) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "add character summary." ||
    normalized === "add character summary" ||
    normalized === "new character" ||
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

async function generateTextOrFallback(prompt: string, maxOutputTokens: number, fallback: string, timeoutMs = 6000) {
  if (
    (process.env.VERCEL === "1" || isHostedBetaEnabled()) &&
    (process.env.STORYFORGE_DISABLE_LIVE_TARGETED_AI === "1" || process.env.STORYFORGE_LIVE_TARGETED_AI !== "1")
  ) {
    return fallback;
  }

  try {
    const raw = await generateTextWithProvider(prompt, { maxOutputTokens, timeoutMs });
    const generated = raw?.trim() ?? "";
    if (generated && !looksLikeMetaOutput(generated)) {
      return generated;
    }

    if (generated && looksLikeGarbledFieldOutput(generated)) {
      const retryPrompt = [
        prompt,
        "The previous model response was unusable because it contained gibberish, code, random multilingual fragments, or symbols.",
        "Ignore that previous response completely.",
        "Return clean, book-specific field content only. No code. No random languages. No symbols. No commentary.",
      ].join("\n\n");
      const retryRaw = await generateTextWithProvider(retryPrompt, { maxOutputTokens, timeoutMs });
      const retry = retryRaw?.trim() ?? "";
      if (retry && !looksLikeMetaOutput(retry)) {
        return retry;
      }
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
  const { project, fieldKey, currentValue, instruction } = options;
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
    fieldKey === "description" || fieldKey === "notes" ? 560 : 320,
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
      maxOutputTokens: fieldKey === "description" || fieldKey === "notes" ? 560 : 320,
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
    character.summary && !looksLikePlaceholderValue(character.summary)
      ? `Current summary: ${compactText(character.summary, 220)}`
      : "",
    character.goal ? `Current goal: ${compactText(character.goal, 180)}` : "",
    character.notes ? `Current notes: ${compactText(character.notes, 180)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

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

function extractJsonObject(raw: string) {
  const stripped = raw.replace(/```(?:json)?|```/gi, "").trim();
  const candidates = [stripped];
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start >= 0 && end > start) {
    candidates.push(stripped.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function blueprintSection(root: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = root[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return {};
}

function cleanBlueprintString(raw: unknown, fallback: string) {
  const candidate = cleanAiFieldText(String(raw ?? ""), "");
  if (candidate && !looksLikeMetaOutput(candidate) && !looksLikePlaceholderValue(candidate)) {
    return candidate;
  }
  const cleanedFallback = cleanAiFieldText(fallback, "");
  return cleanedFallback && !looksLikeMetaOutput(cleanedFallback) && !looksLikePlaceholderValue(cleanedFallback)
    ? cleanedFallback
    : "";
}

function currentOrFallback(current: unknown, fallback: string) {
  const currentText = String(current ?? "").trim();
  if (currentText && !looksLikePlaceholderValue(currentText) && !looksLikeMetaOutput(currentText)) {
    return currentText;
  }
  return fallback;
}

function textFromBlueprint(
  section: Record<string, unknown>,
  key: string,
  current: unknown,
  fallback: string,
) {
  const raw = section[key];
  const candidate = cleanBlueprintString(raw, "");
  if (candidate && !looksLikeCharacterFieldGarbage(key, candidate)) {
    return candidate;
  }
  const fallbackCandidate = cleanBlueprintString(currentOrFallback(current, fallback), fallback);
  return fallbackCandidate && !looksLikeCharacterFieldGarbage(key, fallbackCandidate) ? fallbackCandidate : "";
}

function listFromBlueprint(
  section: Record<string, unknown>,
  key: string,
  current: unknown,
  fallback: string,
  path: string,
  maxItems = 5,
) {
  const raw = section[key];
  const candidateItems = Array.isArray(raw) ? raw : typeof raw === "string" ? splitLines(raw) : [];
  const currentItems = Array.isArray(current) ? current : typeof current === "string" ? splitLines(current) : [];
  const fallbackItems = splitLines(fallback);
  const sourceItems = candidateItems.length ? candidateItems : currentItems.length ? currentItems : fallbackItems;
  const unique = new Set<string>();
  const cleaned: string[] = [];

  for (const item of sourceItems) {
    const value = cleanBlueprintString(item, "");
    if (!value || looksLikeCharacterFieldGarbage(path, value)) {
      continue;
    }
    const signature = value.toLowerCase();
    if (unique.has(signature)) {
      continue;
    }
    unique.add(signature);
    cleaned.push(value);
    if (cleaned.length >= maxItems) {
      break;
    }
  }

  return cleaned;
}

function characterFallback(character: CharacterRecord, project: ProjectWorkspace, path: string) {
  return fallbackCharacterFieldValue(character, project, path);
}

function buildCharacterBlueprintPayload(
  character: CharacterRecord,
  project: ProjectWorkspace,
  blueprint: Record<string, unknown>,
) {
  const root = blueprintSection(blueprint, "character", "payload", "dossierBlueprint");
  const source = Object.keys(root).length ? root : blueprint;
  const quick = blueprintSection(source, "quickProfile", "quick");
  const identity = blueprintSection(source, "identity", "basicIdentity");
  const life = blueprintSection(source, "life", "lifePosition", "socialPosition");
  const personality = blueprintSection(source, "personality", "personalityBehavior");
  const motivation = blueprintSection(source, "motivation", "motivationStory");
  const speech = blueprintSection(source, "speech", "speechLanguage", "voice");
  const body = blueprintSection(source, "body", "bodyPresence", "presence");
  const relationships = blueprintSection(source, "relationships", "relationshipDynamics");
  const state = blueprintSection(source, "currentState", "state");
  const name = textFromBlueprint(source, "name", character.name, character.name || mainCharacterName(project, "Unnamed character"));

  const nextQuickProfile = normalizeCharacterQuickProfile({
    age: textFromBlueprint(quick, "age", character.quickProfile.age, characterFallback(character, project, "quickProfile.age")),
    profession: textFromBlueprint(
      quick,
      "profession",
      character.quickProfile.profession,
      characterFallback(character, project, "quickProfile.profession"),
    ),
    placeOfLiving: textFromBlueprint(
      quick,
      "placeOfLiving",
      character.quickProfile.placeOfLiving,
      characterFallback(character, project, "quickProfile.placeOfLiving"),
    ),
    accent: textFromBlueprint(quick, "accent", character.quickProfile.accent, characterFallback(character, project, "quickProfile.accent")),
    speechPattern: textFromBlueprint(
      quick,
      "speechPattern",
      character.quickProfile.speechPattern,
      characterFallback(character, project, "quickProfile.speechPattern"),
    ),
  });

  const nextDossier = normalizeCharacterDossier(
    {
      basicIdentity: {
        fullName: textFromBlueprint(identity, "fullName", character.dossier.basicIdentity.fullName, name),
        nicknames: listFromBlueprint(
          identity,
          "nicknames",
          character.dossier.basicIdentity.nicknames,
          characterFallback(character, project, "dossier.basicIdentity.nicknames"),
          "dossier.basicIdentity.nicknames",
          4,
        ),
        age: textFromBlueprint(identity, "age", character.dossier.basicIdentity.age, nextQuickProfile.age),
        dateOfBirth: textFromBlueprint(
          identity,
          "dateOfBirth",
          character.dossier.basicIdentity.dateOfBirth,
          characterFallback(character, project, "dossier.basicIdentity.dateOfBirth"),
        ),
        gender: textFromBlueprint(identity, "gender", character.dossier.basicIdentity.gender, characterFallback(character, project, "dossier.basicIdentity.gender")),
        culturalBackground: textFromBlueprint(
          identity,
          "culturalBackground",
          character.dossier.basicIdentity.culturalBackground,
          characterFallback(character, project, "dossier.basicIdentity.culturalBackground"),
        ),
        nationality: textFromBlueprint(
          identity,
          "nationality",
          character.dossier.basicIdentity.nationality,
          characterFallback(character, project, "dossier.basicIdentity.nationality"),
        ),
        currentResidence: textFromBlueprint(
          identity,
          "currentResidence",
          character.dossier.basicIdentity.currentResidence,
          nextQuickProfile.placeOfLiving || characterFallback(character, project, "dossier.basicIdentity.currentResidence"),
        ),
        placeOfOrigin: textFromBlueprint(
          identity,
          "placeOfOrigin",
          character.dossier.basicIdentity.placeOfOrigin,
          characterFallback(character, project, "dossier.basicIdentity.placeOfOrigin"),
        ),
        beliefSystem: textFromBlueprint(
          identity,
          "beliefSystem",
          character.dossier.basicIdentity.beliefSystem,
          characterFallback(character, project, "dossier.basicIdentity.beliefSystem"),
        ),
        maritalStatus: textFromBlueprint(
          identity,
          "maritalStatus",
          character.dossier.basicIdentity.maritalStatus,
          characterFallback(character, project, "dossier.basicIdentity.maritalStatus"),
        ),
        familyStatus: textFromBlueprint(
          identity,
          "familyStatus",
          character.dossier.basicIdentity.familyStatus,
          characterFallback(character, project, "dossier.basicIdentity.familyStatus"),
        ),
      },
      lifePosition: {
        profession: textFromBlueprint(life, "profession", character.dossier.lifePosition.profession, nextQuickProfile.profession),
        workplace: textFromBlueprint(life, "workplace", character.dossier.lifePosition.workplace, characterFallback(character, project, "dossier.lifePosition.workplace")),
        roleTitle: textFromBlueprint(life, "roleTitle", character.dossier.lifePosition.roleTitle, character.role || nextQuickProfile.profession),
        socialClass: textFromBlueprint(life, "socialClass", character.dossier.lifePosition.socialClass, characterFallback(character, project, "dossier.lifePosition.socialClass")),
        educationLevel: textFromBlueprint(life, "educationLevel", character.dossier.lifePosition.educationLevel, characterFallback(character, project, "dossier.lifePosition.educationLevel")),
        trainingBackground: textFromBlueprint(life, "trainingBackground", character.dossier.lifePosition.trainingBackground, characterFallback(character, project, "dossier.lifePosition.trainingBackground")),
        militaryBackground: textFromBlueprint(life, "militaryBackground", character.dossier.lifePosition.militaryBackground, characterFallback(character, project, "dossier.lifePosition.militaryBackground")),
        criminalRecord: textFromBlueprint(life, "criminalRecord", character.dossier.lifePosition.criminalRecord, characterFallback(character, project, "dossier.lifePosition.criminalRecord")),
        politicalOrientation: textFromBlueprint(life, "politicalOrientation", character.dossier.lifePosition.politicalOrientation, characterFallback(character, project, "dossier.lifePosition.politicalOrientation")),
        reputation: textFromBlueprint(life, "reputation", character.dossier.lifePosition.reputation, characterFallback(character, project, "dossier.lifePosition.reputation")),
      },
      personalityBehavior: {
        coreTraits: listFromBlueprint(personality, "coreTraits", character.dossier.personalityBehavior.coreTraits, characterFallback(character, project, "dossier.personalityBehavior.coreTraits"), "dossier.personalityBehavior.coreTraits", 5),
        virtues: listFromBlueprint(personality, "virtues", character.dossier.personalityBehavior.virtues, characterFallback(character, project, "dossier.personalityBehavior.virtues"), "dossier.personalityBehavior.virtues", 5),
        flaws: listFromBlueprint(personality, "flaws", character.dossier.personalityBehavior.flaws, characterFallback(character, project, "dossier.personalityBehavior.flaws"), "dossier.personalityBehavior.flaws", 5),
        emotionalTendencies: textFromBlueprint(personality, "emotionalTendencies", character.dossier.personalityBehavior.emotionalTendencies, characterFallback(character, project, "dossier.personalityBehavior.emotionalTendencies")),
        socialConfidence: textFromBlueprint(personality, "socialConfidence", character.dossier.personalityBehavior.socialConfidence, characterFallback(character, project, "dossier.personalityBehavior.socialConfidence")),
        introExtroStyle: textFromBlueprint(personality, "introExtroStyle", character.dossier.personalityBehavior.introExtroStyle, characterFallback(character, project, "dossier.personalityBehavior.introExtroStyle")),
        conflictStyle: textFromBlueprint(personality, "conflictStyle", character.dossier.personalityBehavior.conflictStyle, characterFallback(character, project, "dossier.personalityBehavior.conflictStyle")),
        decisionMaking: textFromBlueprint(personality, "decisionMaking", character.dossier.personalityBehavior.decisionMaking, characterFallback(character, project, "dossier.personalityBehavior.decisionMaking")),
        projectedImage: textFromBlueprint(personality, "projectedImage", character.dossier.personalityBehavior.projectedImage, characterFallback(character, project, "dossier.personalityBehavior.projectedImage")),
        trueNature: textFromBlueprint(personality, "trueNature", character.dossier.personalityBehavior.trueNature, characterFallback(character, project, "dossier.personalityBehavior.trueNature")),
        hiddenSelf: textFromBlueprint(personality, "hiddenSelf", character.dossier.personalityBehavior.hiddenSelf, characterFallback(character, project, "dossier.personalityBehavior.hiddenSelf")),
        embarrassmentTriggers: textFromBlueprint(personality, "embarrassmentTriggers", character.dossier.personalityBehavior.embarrassmentTriggers, characterFallback(character, project, "dossier.personalityBehavior.embarrassmentTriggers")),
        angerTriggers: textFromBlueprint(personality, "angerTriggers", character.dossier.personalityBehavior.angerTriggers, characterFallback(character, project, "dossier.personalityBehavior.angerTriggers")),
        comfortSources: textFromBlueprint(personality, "comfortSources", character.dossier.personalityBehavior.comfortSources, characterFallback(character, project, "dossier.personalityBehavior.comfortSources")),
        fearTriggers: textFromBlueprint(personality, "fearTriggers", character.dossier.personalityBehavior.fearTriggers, character.fear || characterFallback(character, project, "dossier.personalityBehavior.fearTriggers")),
        coreValues: textFromBlueprint(personality, "coreValues", character.dossier.personalityBehavior.coreValues, characterFallback(character, project, "dossier.personalityBehavior.coreValues")),
      },
      motivationStory: {
        shortTermGoal: textFromBlueprint(motivation, "shortTermGoal", character.dossier.motivationStory.shortTermGoal, character.goal || characterFallback(character, project, "dossier.motivationStory.shortTermGoal")),
        longTermGoal: textFromBlueprint(motivation, "longTermGoal", character.dossier.motivationStory.longTermGoal, characterFallback(character, project, "dossier.motivationStory.longTermGoal")),
        needVsWant: textFromBlueprint(motivation, "needVsWant", character.dossier.motivationStory.needVsWant, characterFallback(character, project, "dossier.motivationStory.needVsWant")),
        internalConflict: textFromBlueprint(motivation, "internalConflict", character.dossier.motivationStory.internalConflict, characterFallback(character, project, "dossier.motivationStory.internalConflict")),
        externalConflict: textFromBlueprint(motivation, "externalConflict", character.dossier.motivationStory.externalConflict, characterFallback(character, project, "dossier.motivationStory.externalConflict")),
        wound: textFromBlueprint(motivation, "wound", character.dossier.motivationStory.wound, character.wound || characterFallback(character, project, "dossier.motivationStory.wound")),
        secrets: listFromBlueprint(motivation, "secrets", character.dossier.motivationStory.secrets, character.secret || characterFallback(character, project, "dossier.motivationStory.secrets"), "dossier.motivationStory.secrets", 4),
        stakesIfFail: textFromBlueprint(motivation, "stakesIfFail", character.dossier.motivationStory.stakesIfFail, characterFallback(character, project, "dossier.motivationStory.stakesIfFail")),
        arcDirection: textFromBlueprint(motivation, "arcDirection", character.dossier.motivationStory.arcDirection, characterFallback(character, project, "dossier.motivationStory.arcDirection")),
        storyRole: textFromBlueprint(motivation, "storyRole", character.dossier.motivationStory.storyRole, character.role || characterFallback(character, project, "dossier.motivationStory.storyRole")),
        relationshipToMainConflict: textFromBlueprint(motivation, "relationshipToMainConflict", character.dossier.motivationStory.relationshipToMainConflict, characterFallback(character, project, "dossier.motivationStory.relationshipToMainConflict")),
      },
      speechLanguage: {
        accent: textFromBlueprint(speech, "accent", character.dossier.speechLanguage.accent, nextQuickProfile.accent),
        dialect: textFromBlueprint(speech, "dialect", character.dossier.speechLanguage.dialect, characterFallback(character, project, "dossier.speechLanguage.dialect")),
        nativeLanguage: textFromBlueprint(speech, "nativeLanguage", character.dossier.speechLanguage.nativeLanguage, characterFallback(character, project, "dossier.speechLanguage.nativeLanguage")),
        otherLanguages: listFromBlueprint(speech, "otherLanguages", character.dossier.speechLanguage.otherLanguages, characterFallback(character, project, "dossier.speechLanguage.otherLanguages"), "dossier.speechLanguage.otherLanguages", 4),
        fluencyLevels: textFromBlueprint(speech, "fluencyLevels", character.dossier.speechLanguage.fluencyLevels, characterFallback(character, project, "dossier.speechLanguage.fluencyLevels")),
        formalityLevel: textFromBlueprint(speech, "formalityLevel", character.dossier.speechLanguage.formalityLevel, characterFallback(character, project, "dossier.speechLanguage.formalityLevel")),
        vocabularyLevel: textFromBlueprint(speech, "vocabularyLevel", character.dossier.speechLanguage.vocabularyLevel, characterFallback(character, project, "dossier.speechLanguage.vocabularyLevel")),
        educationInSpeech: textFromBlueprint(speech, "educationInSpeech", character.dossier.speechLanguage.educationInSpeech, characterFallback(character, project, "dossier.speechLanguage.educationInSpeech")),
        sentenceLength: textFromBlueprint(speech, "sentenceLength", character.dossier.speechLanguage.sentenceLength, characterFallback(character, project, "dossier.speechLanguage.sentenceLength")),
        directness: textFromBlueprint(speech, "directness", character.dossier.speechLanguage.directness, characterFallback(character, project, "dossier.speechLanguage.directness")),
        pointStyle: textFromBlueprint(speech, "pointStyle", character.dossier.speechLanguage.pointStyle, characterFallback(character, project, "dossier.speechLanguage.pointStyle")),
        descriptors: listFromBlueprint(speech, "descriptors", character.dossier.speechLanguage.descriptors, characterFallback(character, project, "dossier.speechLanguage.descriptors"), "dossier.speechLanguage.descriptors", 5),
        repeatedPhrases: listFromBlueprint(speech, "repeatedPhrases", character.dossier.speechLanguage.repeatedPhrases, characterFallback(character, project, "dossier.speechLanguage.repeatedPhrases"), "dossier.speechLanguage.repeatedPhrases", 4),
        favoriteExpressions: listFromBlueprint(speech, "favoriteExpressions", character.dossier.speechLanguage.favoriteExpressions, characterFallback(character, project, "dossier.speechLanguage.favoriteExpressions"), "dossier.speechLanguage.favoriteExpressions", 4),
        swearingLevel: textFromBlueprint(speech, "swearingLevel", character.dossier.speechLanguage.swearingLevel, characterFallback(character, project, "dossier.speechLanguage.swearingLevel")),
        rhythm: textFromBlueprint(speech, "rhythm", character.dossier.speechLanguage.rhythm, characterFallback(character, project, "dossier.speechLanguage.rhythm")),
        emotionalShifts: textFromBlueprint(speech, "emotionalShifts", character.dossier.speechLanguage.emotionalShifts, characterFallback(character, project, "dossier.speechLanguage.emotionalShifts")),
        angrySpeech: textFromBlueprint(speech, "angrySpeech", character.dossier.speechLanguage.angrySpeech, characterFallback(character, project, "dossier.speechLanguage.angrySpeech")),
        scaredSpeech: textFromBlueprint(speech, "scaredSpeech", character.dossier.speechLanguage.scaredSpeech, characterFallback(character, project, "dossier.speechLanguage.scaredSpeech")),
        lyingSpeech: textFromBlueprint(speech, "lyingSpeech", character.dossier.speechLanguage.lyingSpeech, characterFallback(character, project, "dossier.speechLanguage.lyingSpeech")),
        persuasiveSpeech: textFromBlueprint(speech, "persuasiveSpeech", character.dossier.speechLanguage.persuasiveSpeech, characterFallback(character, project, "dossier.speechLanguage.persuasiveSpeech")),
        superiorSpeech: textFromBlueprint(speech, "superiorSpeech", character.dossier.speechLanguage.superiorSpeech, characterFallback(character, project, "dossier.speechLanguage.superiorSpeech")),
        inferiorSpeech: textFromBlueprint(speech, "inferiorSpeech", character.dossier.speechLanguage.inferiorSpeech, characterFallback(character, project, "dossier.speechLanguage.inferiorSpeech")),
        lovedOnesSpeech: textFromBlueprint(speech, "lovedOnesSpeech", character.dossier.speechLanguage.lovedOnesSpeech, characterFallback(character, project, "dossier.speechLanguage.lovedOnesSpeech")),
        avoidedTopics: textFromBlueprint(speech, "avoidedTopics", character.dossier.speechLanguage.avoidedTopics, characterFallback(character, project, "dossier.speechLanguage.avoidedTopics")),
        commonMisunderstandings: textFromBlueprint(speech, "commonMisunderstandings", character.dossier.speechLanguage.commonMisunderstandings, characterFallback(character, project, "dossier.speechLanguage.commonMisunderstandings")),
      },
      bodyPresence: {
        physicalDescription: textFromBlueprint(body, "physicalDescription", character.dossier.bodyPresence.physicalDescription, characterFallback(character, project, "dossier.bodyPresence.physicalDescription")),
        build: textFromBlueprint(body, "build", character.dossier.bodyPresence.build, characterFallback(character, project, "dossier.bodyPresence.build")),
        clothingStyle: textFromBlueprint(body, "clothingStyle", character.dossier.bodyPresence.clothingStyle, characterFallback(character, project, "dossier.bodyPresence.clothingStyle")),
        grooming: textFromBlueprint(body, "grooming", character.dossier.bodyPresence.grooming, characterFallback(character, project, "dossier.bodyPresence.grooming")),
        distinguishingFeatures: listFromBlueprint(body, "distinguishingFeatures", character.dossier.bodyPresence.distinguishingFeatures, characterFallback(character, project, "dossier.bodyPresence.distinguishingFeatures"), "dossier.bodyPresence.distinguishingFeatures", 4),
        posture: textFromBlueprint(body, "posture", character.dossier.bodyPresence.posture, characterFallback(character, project, "dossier.bodyPresence.posture")),
        movementStyle: textFromBlueprint(body, "movementStyle", character.dossier.bodyPresence.movementStyle, characterFallback(character, project, "dossier.bodyPresence.movementStyle")),
        eyeContact: textFromBlueprint(body, "eyeContact", character.dossier.bodyPresence.eyeContact, characterFallback(character, project, "dossier.bodyPresence.eyeContact")),
        habitsTics: listFromBlueprint(body, "habitsTics", character.dossier.bodyPresence.habitsTics, characterFallback(character, project, "dossier.bodyPresence.habitsTics"), "dossier.bodyPresence.habitsTics", 4),
        roomEntry: textFromBlueprint(body, "roomEntry", character.dossier.bodyPresence.roomEntry, characterFallback(character, project, "dossier.bodyPresence.roomEntry")),
        presenceFeel: textFromBlueprint(body, "presenceFeel", character.dossier.bodyPresence.presenceFeel, characterFallback(character, project, "dossier.bodyPresence.presenceFeel")),
      },
      relationshipDynamics: {
        friends: listFromBlueprint(relationships, "friends", character.dossier.relationshipDynamics.friends, characterFallback(character, project, "dossier.relationshipDynamics.friends"), "dossier.relationshipDynamics.friends", 4),
        enemies: listFromBlueprint(relationships, "enemies", character.dossier.relationshipDynamics.enemies, characterFallback(character, project, "dossier.relationshipDynamics.enemies"), "dossier.relationshipDynamics.enemies", 4),
        rivals: listFromBlueprint(relationships, "rivals", character.dossier.relationshipDynamics.rivals, characterFallback(character, project, "dossier.relationshipDynamics.rivals"), "dossier.relationshipDynamics.rivals", 4),
        loversExes: listFromBlueprint(relationships, "loversExes", character.dossier.relationshipDynamics.loversExes, characterFallback(character, project, "dossier.relationshipDynamics.loversExes"), "dossier.relationshipDynamics.loversExes", 4),
        family: listFromBlueprint(relationships, "family", character.dossier.relationshipDynamics.family, characterFallback(character, project, "dossier.relationshipDynamics.family"), "dossier.relationshipDynamics.family", 4),
        mentors: listFromBlueprint(relationships, "mentors", character.dossier.relationshipDynamics.mentors, characterFallback(character, project, "dossier.relationshipDynamics.mentors"), "dossier.relationshipDynamics.mentors", 4),
        subordinatesSuperiors: listFromBlueprint(relationships, "subordinatesSuperiors", character.dossier.relationshipDynamics.subordinatesSuperiors, characterFallback(character, project, "dossier.relationshipDynamics.subordinatesSuperiors"), "dossier.relationshipDynamics.subordinatesSuperiors", 4),
        trustLevels: textFromBlueprint(relationships, "trustLevels", character.dossier.relationshipDynamics.trustLevels, characterFallback(character, project, "dossier.relationshipDynamics.trustLevels")),
        hiddenLoyalties: textFromBlueprint(relationships, "hiddenLoyalties", character.dossier.relationshipDynamics.hiddenLoyalties, characterFallback(character, project, "dossier.relationshipDynamics.hiddenLoyalties")),
        unspokenTensions: textFromBlueprint(relationships, "unspokenTensions", character.dossier.relationshipDynamics.unspokenTensions, characterFallback(character, project, "dossier.relationshipDynamics.unspokenTensions")),
        powerDynamics: textFromBlueprint(relationships, "powerDynamics", character.dossier.relationshipDynamics.powerDynamics, characterFallback(character, project, "dossier.relationshipDynamics.powerDynamics")),
      },
      freeTextCore: textFromBlueprint(
        source,
        "freeTextCore",
        character.dossier.freeTextCore,
        `${name}: ${textFromBlueprint(source, "summary", character.summary, characterFallback(character, project, "summary"))}\nVoice: ${nextQuickProfile.speechPattern}`,
      ),
    },
    name,
  );

  const nextCurrentState = normalizeCharacterState({
    currentKnowledge: textFromBlueprint(state, "currentKnowledge", character.currentState.currentKnowledge, characterFallback(character, project, "currentState.currentKnowledge")),
    unknowns: textFromBlueprint(state, "unknowns", character.currentState.unknowns, characterFallback(character, project, "currentState.unknowns")),
    emotionalState: textFromBlueprint(state, "emotionalState", character.currentState.emotionalState, characterFallback(character, project, "currentState.emotionalState")),
    physicalCondition: textFromBlueprint(state, "physicalCondition", character.currentState.physicalCondition, characterFallback(character, project, "currentState.physicalCondition")),
    loyalties: textFromBlueprint(state, "loyalties", character.currentState.loyalties, characterFallback(character, project, "currentState.loyalties")),
    recentChanges: textFromBlueprint(state, "recentChanges", character.currentState.recentChanges, characterFallback(character, project, "currentState.recentChanges")),
    continuityRisks: textFromBlueprint(state, "continuityRisks", character.currentState.continuityRisks, characterFallback(character, project, "currentState.continuityRisks")),
    lastMeaningfulAppearance: character.currentState.lastMeaningfulAppearance,
    lastMeaningfulAppearanceChapter: character.currentState.lastMeaningfulAppearanceChapter,
  });

  return mergeCharacterAiPayload(
    character,
    {
      name,
      role: textFromBlueprint(source, "role", character.role, nextDossier.motivationStory.storyRole || nextQuickProfile.profession),
      archetype: textFromBlueprint(source, "archetype", character.archetype, characterFallback(character, project, "archetype")),
      summary: textFromBlueprint(source, "summary", character.summary, characterFallback(character, project, "summary")),
      goal: textFromBlueprint(source, "goal", character.goal, nextDossier.motivationStory.shortTermGoal),
      fear: textFromBlueprint(source, "fear", character.fear, nextDossier.personalityBehavior.fearTriggers),
      secret: textFromBlueprint(source, "secret", character.secret, nextDossier.motivationStory.secrets.join(" | ")),
      wound: textFromBlueprint(source, "wound", character.wound, nextDossier.motivationStory.wound),
      notes: textFromBlueprint(source, "notes", character.notes, characterFallback(character, project, "notes")),
      quickProfile: nextQuickProfile,
      dossier: nextDossier,
      currentState: nextCurrentState,
    },
    null,
    "",
  );
}

async function generateCharacterDossierPayload(options: {
  project: ProjectWorkspace;
  contextChapterId: string;
  character: CharacterRecord;
  instruction?: string;
}) {
  const { project, contextChapterId, character, instruction } = options;
  const prompt = [
    "You are a novelist's character architect.",
    "Create one coherent character blueprint for the app. Keep it specific, human, and usable for future dialogue and drafting.",
    "Use the already-filled character textboxes as binding source material. Preserve useful existing facts and build around them.",
    "Do not write app instructions, field names inside values, meta commentary, or generic repeated trait triplets.",
    "Do not use words like canon-safe, requested field, target area, field path, dossier, contextualize, or textualize inside field values.",
    "Return strict JSON only. No markdown. No explanation.",
    "Use this shape:",
    JSON.stringify(
      {
        name: "Full name",
        role: "Story role or job",
        archetype: "Narrative lane",
        summary: "2-3 vivid sentences",
        goal: "Concrete want",
        fear: "Specific fear",
        secret: "Hidden truth",
        wound: "Formative hurt",
        notes: "Useful drafting note",
        quickProfile: {
          age: "Age or age range",
          profession: "Profession",
          placeOfLiving: "Home or base",
          accent: "Accent/register if known",
          speechPattern: "Distinct speech pattern",
        },
        identity: {
          fullName: "Full name",
          nicknames: ["Nickname"],
          gender: "Gender if known",
          culturalBackground: "Culture/class/religious background",
          nationality: "Nationality or people",
          currentResidence: "Current residence",
          placeOfOrigin: "Origin",
          beliefSystem: "Belief system",
          familyStatus: "Family status",
        },
        life: {
          workplace: "Workplace",
          roleTitle: "Role/title",
          socialClass: "Class/status",
          educationLevel: "Education",
          reputation: "Public reputation",
        },
        personality: {
          coreTraits: ["trait"],
          virtues: ["virtue"],
          flaws: ["flaw"],
          emotionalTendencies: "Emotional baseline",
          conflictStyle: "How they fight or argue",
          projectedImage: "Public mask",
          trueNature: "Private truth",
          hiddenSelf: "What they hide",
          angerTriggers: "What angers them",
          fearTriggers: "What frightens them",
          coreValues: "Values",
        },
        motivation: {
          shortTermGoal: "Immediate goal",
          longTermGoal: "Long-term desire",
          needVsWant: "Need versus want",
          internalConflict: "Inner conflict",
          externalConflict: "External pressure",
          secrets: ["secret"],
          stakesIfFail: "Stakes",
          arcDirection: "Arc direction",
          relationshipToMainConflict: "How they connect to the main conflict",
        },
        speech: {
          accent: "Accent/register",
          dialect: "Dialect if known",
          nativeLanguage: "Native language",
          otherLanguages: ["Other language"],
          formalityLevel: "Formality",
          vocabularyLevel: "Vocabulary",
          educationInSpeech: "Education shown in speech",
          sentenceLength: "Sentence length",
          directness: "Directness",
          descriptors: ["voice descriptor"],
          repeatedPhrases: ["phrase"],
          favoriteExpressions: ["expression"],
          rhythm: "Rhythm",
          emotionalShifts: "How emotion changes speech",
          angrySpeech: "How they sound angry",
          scaredSpeech: "How they sound scared",
          lyingSpeech: "How they lie",
          persuasiveSpeech: "How they persuade",
          superiorSpeech: "How they speak upward",
          inferiorSpeech: "How they speak downward",
          lovedOnesSpeech: "How they speak privately",
          avoidedTopics: "What they avoid saying",
          commonMisunderstandings: "How others misread them",
        },
        body: {
          physicalDescription: "Physical description",
          build: "Build",
          clothingStyle: "Clothing",
          grooming: "Grooming",
          distinguishingFeatures: ["feature"],
          posture: "Posture",
          movementStyle: "Movement",
          eyeContact: "Eye contact",
          habitsTics: ["habit"],
          roomEntry: "How they enter",
          presenceFeel: "How they feel in a room",
        },
        relationships: {
          friends: ["friend/dynamic"],
          enemies: ["enemy/dynamic"],
          rivals: ["rival/dynamic"],
          loversExes: ["lover/ex dynamic"],
          family: ["family dynamic"],
          mentors: ["mentor dynamic"],
          subordinatesSuperiors: ["hierarchy dynamic"],
          trustLevels: "Who they trust",
          hiddenLoyalties: "Hidden loyalties",
          unspokenTensions: "Unspoken tensions",
          powerDynamics: "Power dynamics",
        },
        currentState: {
          currentKnowledge: "What they know now",
          unknowns: "What they do not know",
          emotionalState: "Current emotion",
          physicalCondition: "Current condition",
          loyalties: "Current loyalties",
          recentChanges: "Recent change",
          continuityRisks: "Continuity warning",
        },
        freeTextCore: "Short reusable portrait for drafting",
      },
    ),
    "Project and character context:",
    compactCharacterCanon(project, contextChapterId, character),
    "Existing character snapshot:",
    JSON.stringify(
      {
        name: looksLikePlaceholderValue(character.name) ? "" : character.name,
        role: looksLikePlaceholderValue(character.role) ? "" : character.role,
        archetype: looksLikePlaceholderValue(character.archetype) ? "" : character.archetype,
        summary: looksLikePlaceholderValue(character.summary) ? "" : character.summary,
        goal: looksLikePlaceholderValue(character.goal) ? "" : character.goal,
        fear: looksLikePlaceholderValue(character.fear) ? "" : character.fear,
        secret: looksLikePlaceholderValue(character.secret) ? "" : character.secret,
        wound: looksLikePlaceholderValue(character.wound) ? "" : character.wound,
        notes: looksLikePlaceholderValue(character.notes) ? "" : character.notes,
        quickProfile: character.quickProfile,
        currentState: character.currentState,
        usefulDossier: {
          basicIdentity: character.dossier.basicIdentity,
          lifePosition: character.dossier.lifePosition,
          personalityBehavior: character.dossier.personalityBehavior,
          motivationStory: character.dossier.motivationStory,
          speechLanguage: character.dossier.speechLanguage,
          relationshipDynamics: character.dossier.relationshipDynamics,
          freeTextCore: character.dossier.freeTextCore,
        },
      },
    ),
    instruction ? `Writer request:\n${instruction}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const raw = await generateTextOrFallback(prompt, 1800, "", 10000);
  const parsed = raw?.trim() ? extractJsonObject(raw) : null;
  return buildCharacterBlueprintPayload(character, project, parsed ?? {});
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
      fieldKey === "currentBeat"
        ? "If the request names a concrete structural event, scene, or rule, name that canon anchor in the beat sentence."
        : "",
      fieldKey === "purpose" || fieldKey === "outline"
        ? "Carry the important character, rule, place, and conflict nouns from the request into the result when they are relevant."
        : "",
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
    fieldKey === "outline" ? 1100 : 420,
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
      maxOutputTokens: fieldKey === "outline" ? 1100 : 420,
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
    fieldKey === "content" || fieldKey === "description" || fieldKey === "summary" || fieldKey === "notes" ? 620 : 320,
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
      maxOutputTokens:
        fieldKey === "content" || fieldKey === "description" || fieldKey === "summary" || fieldKey === "notes" ? 620 : 320,
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
    const mergedPayload = await generateCharacterDossierPayload({
      project,
      contextChapterId,
      character: workingCharacter,
      instruction: input.instruction,
    });
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
