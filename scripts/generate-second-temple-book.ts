import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import OpenAI from "openai";
import { z } from "zod";

const base = process.env.STORYFORGE_BASE_URL ?? "http://localhost:3000";
const targetOpenRouterModel =
  process.env.STORYFORGE_MODEL ?? "arcee-ai/trinity-large-preview:free";
const resumeProjectId = process.env.STORYFORGE_RESUME_PROJECT_ID?.trim() ?? "";
const exportsDir = path.join(process.cwd(), "exports");
const providerConfigPath = path.join(process.cwd(), ".the-book-author.providers.json");

const blueprintCharacterSchema = z.object({
  name: z.string(),
  role: z.string(),
  archetype: z.string(),
  summary: z.string(),
  goal: z.string(),
  fear: z.string(),
  secret: z.string(),
  wound: z.string(),
  quirks: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  povEligible: z.boolean().default(false),
  quickProfile: z.object({
    age: z.string().default(""),
    profession: z.string().default(""),
    placeOfLiving: z.string().default(""),
    accent: z.string().default(""),
    speechPattern: z.string().default(""),
  }),
  freeTextCore: z.string(),
  personalityTraits: z.array(z.string()).default([]),
  virtues: z.array(z.string()).default([]),
  flaws: z.array(z.string()).default([]),
  conflictStyle: z.string().default(""),
  decisionMaking: z.string().default(""),
  directness: z.string().default(""),
  pointStyle: z.string().default(""),
  descriptors: z.array(z.string()).default([]),
  physicalDescription: z.string().default(""),
  clothingStyle: z.string().default(""),
  presenceFeel: z.string().default(""),
  shortTermGoal: z.string().default(""),
  longTermGoal: z.string().default(""),
  arcDirection: z.string().default(""),
  relationshipToMainConflict: z.string().default(""),
  customFields: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        pinned: z.boolean().default(false),
      }),
    )
    .default([]),
});

const blueprintSchema = z.object({
  title: z.string().min(5),
  oneLineHook: z.string().min(30),
  premise: z.string().min(80),
  genre: z.string(),
  tone: z.string(),
  audience: z.string(),
  pointOfView: z.string(),
  tense: z.string(),
  storyBrief: z.string().min(250),
  plotDirection: z.string().min(20),
  themes: z.array(z.string()).min(5).default([]),
  comparableTitles: z.array(z.string()).default([]),
  proseStyle: z.string().default(""),
  aestheticGuide: z.string().default(""),
  styleGuide: z.string().default(""),
  voiceRules: z.array(z.string()).min(3).default([]),
  characters: z.array(blueprintCharacterSchema).min(6),
  relationships: z.array(
    z.object({
      source: z.string(),
      target: z.string(),
      kind: z.enum(["ALLY", "ROMANTIC", "RIVAL", "FAMILY", "MENTOR", "ENEMY", "POLITICAL", "MYSTERY"]),
      description: z.string(),
      tension: z.string().default(""),
      status: z.string().default("ACTIVE"),
    }),
    ).min(6),
  locations: z.array(
    z.object({
      name: z.string(),
      summary: z.string(),
      atmosphere: z.string().default(""),
      rules: z.string().default(""),
      notes: z.string().default(""),
      tags: z.array(z.string()).default([]),
    }),
    ).min(5),
  factions: z.array(
    z.object({
      name: z.string(),
      summary: z.string(),
      agenda: z.string().default(""),
      resources: z.string().default(""),
      notes: z.string().default(""),
      tags: z.array(z.string()).default([]),
    }),
    ).min(4),
  plotThreads: z.array(
    z.object({
      title: z.string(),
      summary: z.string(),
      heat: z.number().int().min(1).max(5),
      promisedPayoff: z.string(),
    }),
    ).min(8),
  timelineEvents: z.array(
    z.object({
      label: z.string(),
      description: z.string(),
      occursAtChapter: z.number().int().min(1).max(23).nullable().default(null),
    }),
    ).min(12),
});

const chapterPlanSchema = z.object({
  chapters: z.array(
    z.object({
      number: z.number().int().min(1).max(23),
      title: z.string(),
      pov: z.string(),
      purpose: z.string(),
      currentBeat: z.string(),
      targetWordCount: z.number().int().min(3400).max(4200),
      keyBeats: z.array(z.string()).default([]),
      requiredInclusions: z.array(z.string()).default([]),
      forbiddenElements: z.array(z.string()).default([]),
      desiredMood: z.string(),
      sceneList: z.array(z.string()).default([]),
      notes: z.string().default(""),
      manualAssist: z.boolean().default(false),
      assistFocus: z.string().default(""),
    }),
  ),
});

type Blueprint = z.infer<typeof blueprintSchema>;
type ChapterPlan = z.infer<typeof chapterPlanSchema>;

type ApiResult<T> = {
  ok: boolean;
  data: T;
  error?: string;
};

type ProjectWorkspace = {
  id: string;
  slug: string;
  title: string;
  plotThreads: Array<{ id: string; title: string; summary: string; progressMarkers: Array<{ chapterNumber: number }> }>;
  characters: Array<{
    id: string;
    name: string;
    notes: string;
    quickProfile: { age: string; profession: string; placeOfLiving: string; accent: string; speechPattern: string };
    dossier: Record<string, unknown>;
    currentState: Record<string, unknown>;
    customFields: Array<{ id: string; label: string; value: string; pinned: boolean }>;
    pinnedFields: string[];
  }>;
  chapters: Array<{
    id: string;
    number: number;
    title: string;
    purpose: string;
    currentBeat: string;
    targetWordCount: number;
    keyBeats: string[];
    requiredInclusions: string[];
    forbiddenElements: string[];
    desiredMood: string;
    sceneList: string[];
    outline: string;
    draft: string;
    notes: string;
    wordCount: number;
    status: string;
    povCharacterId: string | null;
    summaries: Array<{ id: string; kind: string; summary: string }>;
  }>;
  continuityIssues: Array<{
    chapterId: string | null;
    title: string;
    description: string;
    suggestedContext: string;
    severity: string;
    status: string;
  }>;
  shortTermMemoryItems: Array<{ id: string; title: string; status: string }>;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function stripCodeFences(value: string) {
  return value.replace(/```json|```/gi, "").trim();
}

function extractJsonCandidate(value: string) {
  const cleaned = stripCodeFences(value);
  const objectStart = cleaned.indexOf("{");
  const objectEnd = cleaned.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    return cleaned.slice(objectStart, objectEnd + 1);
  }

  return cleaned;
}

function setByPath(target: Record<string, unknown>, pathKey: string, value: unknown) {
  const segments = pathKey.split(".");
  let cursor: Record<string, unknown> = target;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const next = cursor[segment];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }

  cursor[segments.at(-1) ?? pathKey] = value;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getLocalProviderClient() {
  const raw = await readFile(providerConfigPath, "utf8");
  const parsed = JSON.parse(raw) as {
    activeProvider?: string;
    openrouter?: {
      apiKey?: string;
      model?: string;
      baseUrl?: string;
      siteUrl?: string;
      appName?: string;
    };
  };

  if (parsed.activeProvider !== "OPENROUTER" || !parsed.openrouter?.apiKey) {
    throw new Error("The book harness expects an active OpenRouter configuration in .the-book-author.providers.json.");
  }

  return {
    model: parsed.openrouter.model || targetOpenRouterModel,
    client: new OpenAI({
      apiKey: parsed.openrouter.apiKey,
      baseURL: parsed.openrouter.baseUrl || "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": parsed.openrouter.siteUrl || "http://localhost:3000",
        "X-Title": parsed.openrouter.appName || "StoryForge",
      },
    }),
  };
}

async function generateText(prompt: string) {
  const provider = await getLocalProviderClient();
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
          max_output_tokens: 16000,
        });

      return (
        (response as { output_text?: string }).output_text ||
        ((response as { output?: { content?: { text?: string }[] }[] }).output ?? [])
          .flatMap((item) => item.content ?? [])
          .map((item) => item.text ?? "")
          .join("\n")
      );
    } catch (error) {
      lastError = error;
      const status =
        typeof error === "object" && error && "status" in error ? Number((error as { status?: unknown }).status) : null;
      const retryable = Boolean(status && (status === 408 || status === 409 || status === 429 || status >= 500));
      if (!retryable || index === retryDelaysMs.length - 1) {
        break;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("The live provider did not return a response.");
}

async function requestJson<T>(requestPath: string, options: RequestInit = {}) {
  const response = await fetch(`${base}${requestPath}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });

  const payload = (await response.json().catch(() => null)) as ApiResult<T> | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(`${options.method ?? "GET"} ${requestPath} failed: ${payload?.error ?? response.statusText}`);
  }

  return payload.data;
}

async function downloadFile(requestPath: string, outputPath: string) {
  const response = await fetch(`${base}${requestPath}`);
  if (!response.ok) {
    throw new Error(`Download failed for ${requestPath}: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, buffer);
}

async function aiJson<T>(label: string, prompt: string, schema: z.ZodSchema<T>) {
  let lastRaw = "";

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const raw = await generateText(prompt);
    lastRaw = raw;

    try {
      const parsed = schema.safeParse(JSON.parse(extractJsonCandidate(raw)));
      if (parsed.success) {
        return parsed.data;
      }

      if (attempt < 4) {
        const repairPrompt = [
          `Your previous ${label} output failed schema validation.`,
          "Return corrected strict JSON only. Keep the same story, but fix the structure.",
          "Validation issues:",
          JSON.stringify(parsed.error.flatten(), null, 2),
          "Previous output:",
          raw,
        ].join("\n\n");
        const repaired = await generateText(repairPrompt);
        lastRaw = repaired;
        const repairedParsed = schema.safeParse(JSON.parse(extractJsonCandidate(repaired)));
        if (repairedParsed.success) {
          return repairedParsed.data;
        }
      }
    } catch {
      if (attempt === 4) {
        break;
      }
    }
  }

  throw new Error(`Could not parse ${label} JSON from the live provider.\n\n${lastRaw.slice(0, 2000)}`);
}

async function ensureProvider() {
  const settings = await requestJson<{ settings: { activeProvider: string } }>("/api/settings/providers");
  if (settings.settings.activeProvider !== "OPENROUTER") {
    throw new Error("StoryForge is not currently configured to use OpenRouter.");
  }

  await requestJson<{ settings: unknown }>("/api/settings/providers/model", {
    method: "PATCH",
    body: JSON.stringify({
      provider: "OPENROUTER",
      model: targetOpenRouterModel,
      activate: true,
    }),
  });
}

function buildBlueprintPrompt() {
  return [
    "You are StoryForge's historical novel architect.",
    "Return strict JSON only. No markdown. No commentary.",
    "Design a historically textured commercial tragedy guided by James Scott Bell style craft: clear LOCK goals, scene pressure, escalating stakes, active plot threads, distinct character voices, and chapter endings that create momentum.",
    "Anchor the story in Jerusalem during the destruction of the Second Temple in 70 CE.",
    "Story requirements:",
    "- The lead is a Roman spy operating inside Jerusalem during the final catastrophe.",
    "- At first he hates the Jews and treats them with contempt.",
    "- Over time he comes to pity them as he watches them tear themselves apart from within, even though he still believes Rome should win.",
    "- In the end he is the one who sets fire to the Temple and destroys it, saying the Jews do not deserve it.",
    "- The book is a Greek tragedy: severe, fated, morally corrosive, and fully resolved.",
    "- The story should show the city fracturing under siege, factional violence, hunger, fanaticism, fear, and doomed grandeur.",
    "- Build a cast with strong motives, wounds, speech patterns, and social contradictions.",
    "- Return at least 6 meaningful characters, 6 relationships, 5 locations, 4 factions, 8 plot threads, and 12 timeline events.",
    "- The timeline must cover the full 23-chapter architecture. Do not collapse the Temple burning into the middle of the book.",
    "- The Temple burning must happen near the end, in chapter 22 or 23.",
    "- Keep the scale intimate enough for a novel, not a history textbook.",
    "- Preserve historical seriousness and emotional realism. Avoid cartoon villains and avoid modern slang.",
    "- Do not write chapters yet.",
    "Return this exact JSON shape:",
    JSON.stringify(
      {
        title: "string",
        oneLineHook: "string",
        premise: "string",
        genre: "string",
        tone: "string",
        audience: "string",
        pointOfView: "string",
        tense: "string",
        storyBrief: "string",
        plotDirection: "string",
        themes: ["string"],
        comparableTitles: ["string"],
        proseStyle: "string",
        aestheticGuide: "string",
        styleGuide: "string",
        voiceRules: ["string"],
        characters: [
          {
            name: "string",
            role: "string",
            archetype: "string",
            summary: "string",
            goal: "string",
            fear: "string",
            secret: "string",
            wound: "string",
            quirks: ["string"],
            tags: ["string"],
            povEligible: true,
            quickProfile: {
              age: "string",
              profession: "string",
              placeOfLiving: "string",
              accent: "string",
              speechPattern: "string",
            },
            freeTextCore: "string",
            personalityTraits: ["string"],
            virtues: ["string"],
            flaws: ["string"],
            conflictStyle: "string",
            decisionMaking: "string",
            directness: "string",
            pointStyle: "string",
            descriptors: ["string"],
            physicalDescription: "string",
            clothingStyle: "string",
            presenceFeel: "string",
            shortTermGoal: "string",
            longTermGoal: "string",
            arcDirection: "string",
            relationshipToMainConflict: "string",
            customFields: [{ label: "string", value: "string", pinned: true }],
          },
        ],
        relationships: [{ source: "string", target: "string", kind: "ALLY", description: "string", tension: "string", status: "string" }],
        locations: [{ name: "string", summary: "string", atmosphere: "string", rules: "string", notes: "string", tags: ["string"] }],
        factions: [{ name: "string", summary: "string", agenda: "string", resources: "string", notes: "string", tags: ["string"] }],
        plotThreads: [{ title: "string", summary: "string", heat: 3, promisedPayoff: "string" }],
        timelineEvents: [{ label: "string", description: "string", occursAtChapter: 1 }],
      },
      null,
      2,
    ),
  ].join("\n\n");
}

function buildChapterPlanPrompt(
  blueprint: Blueprint,
  startChapter: number,
  endChapter: number,
  previousChapters: Array<{
    number: number;
    title: string;
    pov: string;
    purpose: string;
    currentBeat: string;
  }>,
) {
  const protagonist = blueprint.characters.find((character) => character.povEligible) ?? blueprint.characters[0];
  const jester = blueprint.characters.find(
    (character) =>
      character.role.toLowerCase().includes("jester") ||
      character.summary.toLowerCase().includes("jester") ||
      character.summary.toLowerCase().includes("drunk"),
  );
  const blueprintSummary = {
    title: blueprint.title,
    premise: blueprint.premise,
    storyBrief: blueprint.storyBrief,
    plotDirection: blueprint.plotDirection,
    themes: blueprint.themes,
    cast: blueprint.characters.map((character) => ({
      name: character.name,
      role: character.role,
      summary: character.summary,
      arcDirection: character.arcDirection,
      speechPattern: character.quickProfile.speechPattern,
    })),
    plotThreads: blueprint.plotThreads,
    timelineEvents: blueprint.timelineEvents,
  };

  return [
    "You are StoryForge's chapter architect.",
    "Return strict JSON only. No markdown. No commentary.",
    `Build only chapters ${startChapter} through ${endChapter} for the supplied historical tragedy.`,
    `The protagonist must remain ${protagonist.name}, the Roman spy lead.`,
    jester
      ? `${jester.name} is a morally compromised secondary figure and must remain supporting rather than taking over the book.`
      : "",
    "Make chapter 1 begin with the Roman spy inside Jerusalem as the catastrophe gathers and the factions are already poisoning each other.",
    "Mark chapters 4, 9, 15, and 20 as manualAssist: true because they will be drafted through co-writing tools instead of one-click full-author draft.",
    "Target 3600 to 4100 words per chapter. The whole book target is roughly 90000 words.",
    "Every chapter must have a clear purpose, current beat, key beats, required inclusions, and a strong final motion.",
    "Respect Bell craft: objective, opposition, escalation, distinct scene turns, and a chapter-end question or pressure carry-forward.",
    "Do not repeat the same chapter premise in different words. Every chapter must materially advance the siege, the moral corrosion, or the lead's tragic arc.",
    "Make sure internal Jewish factional violence, Roman pressure, hunger, divided loyalties, Temple politics, and the lead's shifting contempt-into-pity arc all progress across the book.",
    "Make sure the Temple burning is prepared across the whole architecture and lands in the end as a tragic culmination rather than a random shock.",
    "Use this story bible summary:",
    JSON.stringify(blueprintSummary, null, 2),
    previousChapters.length
      ? `Already planned earlier chapters that must remain consistent:\n${JSON.stringify(previousChapters, null, 2)}`
      : "",
    "Return this exact JSON shape:",
    JSON.stringify(
      {
        chapters: [
          {
            number: startChapter,
            title: "string",
            pov: "Character Name",
            purpose: "string",
            currentBeat: "string",
            targetWordCount: 3910,
            keyBeats: ["string"],
            requiredInclusions: ["string"],
            forbiddenElements: ["string"],
            desiredMood: "string",
            sceneList: ["string"],
            notes: "string",
            manualAssist: false,
            assistFocus: "string",
          },
        ],
      },
      null,
      2,
    ),
    `Return exactly ${endChapter - startChapter + 1} chapter objects, with numbers in the inclusive range ${startChapter}-${endChapter}.`,
  ].join("\n\n");
}

function buildCharacterPayload(character: Blueprint["characters"][number]) {
  return {
    name: character.name,
    role: character.role,
    archetype: character.archetype,
    summary: character.summary,
    goal: character.goal,
    fear: character.fear,
    secret: character.secret,
    wound: character.wound,
    quirks: character.quirks,
    notes: character.summary,
    tags: character.tags,
    povEligible: character.povEligible,
    quickProfile: character.quickProfile,
    dossier: {
      basicIdentity: {
        fullName: character.name,
        age: character.quickProfile.age,
        currentResidence: character.quickProfile.placeOfLiving,
      },
      lifePosition: {
        profession: character.quickProfile.profession,
        roleTitle: character.role,
      },
      personalityBehavior: {
        coreTraits: character.personalityTraits,
        virtues: character.virtues,
        flaws: character.flaws,
        conflictStyle: character.conflictStyle,
        decisionMaking: character.decisionMaking,
      },
      motivationStory: {
        shortTermGoal: character.shortTermGoal,
        longTermGoal: character.longTermGoal,
        wound: character.wound,
        arcDirection: character.arcDirection,
        relationshipToMainConflict: character.relationshipToMainConflict,
      },
      speechLanguage: {
        accent: character.quickProfile.accent,
        directness: character.directness,
        pointStyle: character.pointStyle,
        descriptors: character.descriptors,
      },
      bodyPresence: {
        physicalDescription: character.physicalDescription,
        clothingStyle: character.clothingStyle,
        presenceFeel: character.presenceFeel,
      },
      freeTextCore: character.freeTextCore,
    },
    currentState: {
      currentKnowledge: "",
      unknowns: "",
      emotionalState: "",
      physicalCondition: "",
      loyalties: "",
      recentChanges: "",
      continuityRisks: "",
      lastMeaningfulAppearance: "",
      lastMeaningfulAppearanceChapter: null,
    },
    customFields: character.customFields.map((field, index) => ({
      id: `${slugify(character.name)}-custom-${index + 1}`,
      label: field.label,
      value: field.value,
      pinned: field.pinned,
    })),
    pinnedFields: character.customFields.filter((field) => field.pinned).map((field) => field.label),
  };
}

function deriveStructureBeats(chapters: ChapterPlan["chapters"]) {
  const beatMap: Array<{
    chapterNumber: number;
    type: "OPENING_DISTURBANCE" | "FIRST_DOORWAY" | "MIDPOINT" | "SECOND_DOORWAY" | "CLIMAX" | "RESOLUTION";
    orderIndex: number;
  }> = [
    { chapterNumber: 1, type: "OPENING_DISTURBANCE", orderIndex: 1 },
    { chapterNumber: 6, type: "FIRST_DOORWAY", orderIndex: 2 },
    { chapterNumber: 12, type: "MIDPOINT", orderIndex: 3 },
    { chapterNumber: 17, type: "SECOND_DOORWAY", orderIndex: 4 },
    { chapterNumber: 22, type: "CLIMAX", orderIndex: 5 },
    { chapterNumber: 23, type: "RESOLUTION", orderIndex: 6 },
  ];

  return beatMap
    .map((beat) => {
      const chapter = chapters.find((entry) => entry.number === beat.chapterNumber);
      if (!chapter) {
        return null;
      }

      return {
        chapterNumber: beat.chapterNumber,
        type: beat.type,
        label: chapter.title,
        description: chapter.purpose,
        notes: chapter.currentBeat,
        status: beat.type === "OPENING_DISTURBANCE" ? "ACHIEVED" : "PLANNED",
        orderIndex: beat.orderIndex,
      };
    })
    .filter(Boolean) as Array<{
      chapterNumber: number;
      type: "OPENING_DISTURBANCE" | "FIRST_DOORWAY" | "MIDPOINT" | "SECOND_DOORWAY" | "CLIMAX" | "RESOLUTION";
      label: string;
      description: string;
      notes: string;
      status: "PLANNED" | "LOCKED" | "ACHIEVED";
      orderIndex: number;
    }>;
}

async function generateChapterPlanInBatches(blueprint: Blueprint) {
  const batches = [
    [1, 6],
    [7, 12],
    [13, 18],
    [19, 23],
  ] as const;
  const chapters: ChapterPlan["chapters"] = [];

  for (const [startChapter, endChapter] of batches) {
    const batchPlan = await aiJson(
      `chapter plan batch ${startChapter}-${endChapter}`,
      buildChapterPlanPrompt(
        blueprint,
        startChapter,
        endChapter,
        chapters.map((chapter) => ({
          number: chapter.number,
          title: chapter.title,
          pov: chapter.pov,
          purpose: chapter.purpose,
          currentBeat: chapter.currentBeat,
        })),
      ),
      chapterPlanSchema,
    );

    const batchChapters = batchPlan.chapters
      .filter((chapter) => chapter.number >= startChapter && chapter.number <= endChapter)
      .sort((a, b) => a.number - b.number);

    if (batchChapters.length !== endChapter - startChapter + 1) {
      throw new Error(`Chapter batch ${startChapter}-${endChapter} returned ${batchChapters.length} chapters instead of ${endChapter - startChapter + 1}.`);
    }

    chapters.push(...batchChapters);
  }

  return { chapters };
}

async function createProject(blueprint: Blueprint) {
  const normalizedStoryBrief =
    blueprint.storyBrief.trim().length >= 250
      ? blueprint.storyBrief.trim()
      : `${blueprint.storyBrief.trim()} Lucius's mission, the siege, the city's internal collapse, and the final burning of the Temple must all unfold as a sustained tragic descent across the whole book.`;
  const normalizedPlotDirection =
    blueprint.plotDirection.trim().length >= 20
      ? blueprint.plotDirection.trim()
      : `${blueprint.plotDirection.trim()} across the full siege until the Temple burns in the end.`;
  const created = await requestJson<{ projectId: string; project: ProjectWorkspace }>("/api/projects", {
    method: "POST",
    body: JSON.stringify({
      title: blueprint.title,
      premise: blueprint.premise,
      oneLineHook: blueprint.oneLineHook,
      genre: blueprint.genre,
      tone: blueprint.tone,
      audience: blueprint.audience,
      pointOfView: blueprint.pointOfView,
      tense: blueprint.tense,
      storyBrief: normalizedStoryBrief,
      plotDirection: normalizedPlotDirection,
    }),
  });

  await requestJson<{ project: ProjectWorkspace }>(`/api/projects/${created.projectId}`, {
    method: "PATCH",
    body: JSON.stringify({
      title: blueprint.title,
      premise: blueprint.premise,
      oneLineHook: blueprint.oneLineHook,
      bookSettings: {
        genre: blueprint.genre,
          tone: blueprint.tone,
          audience: blueprint.audience,
          themes: blueprint.themes,
          pointOfView: blueprint.pointOfView,
          tense: blueprint.tense,
          targetChapterLength: 3910,
          targetBookLength: 90000,
          storyBrief: normalizedStoryBrief,
          plotDirection: normalizedPlotDirection,
        pacingNotes: "Keep chapters moving with siege pressure, factional rupture, spiritual dread, and emotionally costly choices.",
        romanceLevel: 1,
        darknessLevel: 5,
        proseStyle: blueprint.proseStyle,
        comparableTitles: blueprint.comparableTitles,
      },
      styleProfile: {
        guidanceIntensity: "STRONG",
        proseDensity: 4,
        pacing: 4,
        darkness: 5,
        romanceIntensity: 1,
        humorLevel: 1,
        actionFrequency: 3,
        mysteryDensity: 3,
        dialogueDescriptionRatio: 4,
        literaryCommercialBalance: 6,
        aestheticGuide: blueprint.aestheticGuide,
        styleGuide: blueprint.styleGuide,
        voiceRules: blueprint.voiceRules,
      },
    }),
  });

  return created.projectId;
}

async function refreshProject(projectId: string) {
  return requestJson<{ project: ProjectWorkspace }>(`/api/projects/${projectId}`);
}

async function applyRun(
  runId: string,
  fieldKey: "outline" | "draft" | "notes",
  currentContent: string,
  applyMode: "replace-selection" | "replace-draft" | "append" | "insert-at-cursor",
  selectionStart?: number,
  selectionEnd?: number,
) {
  return requestJson<{ content: string }>(`/api/assist-runs/${runId}/apply`, {
    method: "POST",
    body: JSON.stringify({
      applyMode,
      fieldKey,
      content: currentContent,
      selectionStart,
      selectionEnd,
    }),
  });
}

async function addStoryBibleEntity(projectId: string, entityType: string, payload: Record<string, unknown>) {
  return requestJson<{ project: ProjectWorkspace }>(`/api/projects/${projectId}/story-bible`, {
    method: "POST",
    body: JSON.stringify({
      entityType,
      payload,
    }),
  });
}

async function addSkeletonEntity(projectId: string, entityType: string, payload: Record<string, unknown>) {
  return requestJson<{ project: ProjectWorkspace }>(`/api/projects/${projectId}/skeleton`, {
    method: "POST",
    body: JSON.stringify({
      entityType,
      payload,
    }),
  });
}

function middleSlice(text: string, preferredLength = 420) {
  if (text.length <= preferredLength) {
    return { selectionText: text, selectionStart: 0, selectionEnd: text.length };
  }

  const start = Math.max(0, Math.floor(text.length / 2) - Math.floor(preferredLength / 2));
  const end = Math.min(text.length, start + preferredLength);
  return {
    selectionText: text.slice(start, end),
    selectionStart: start,
    selectionEnd: end,
  };
}

function normalizeForSimilarity(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordOverlapScore(left: string, right: string) {
  const leftWords = new Set(normalizeForSimilarity(left).split(" ").filter((word) => word.length > 3));
  const rightWords = new Set(normalizeForSimilarity(right).split(" ").filter((word) => word.length > 3));
  if (leftWords.size === 0 || rightWords.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const word of leftWords) {
    if (rightWords.has(word)) {
      overlap += 1;
    }
  }

  return overlap / Math.min(leftWords.size, rightWords.size);
}

async function reviseAndReplaceDraft(chapterId: string, instruction: string, actionType: "REVISE" | "IMPROVE_PROSE" | "SHARPEN_VOICE") {
  const revision = await requestJson<{ run: { id: string } }>(`/api/chapters/${chapterId}/revise`, {
    method: "POST",
    body: JSON.stringify({
      actionType,
      instruction,
    }),
  });

  await applyRun(revision.run.id, "draft", "", "replace-draft", 0, 0);
}

async function runAssistOnField(
  chapterId: string,
  currentContent: string,
  fieldKey: "outline" | "draft" | "notes",
  actionType:
    | "CONTINUE"
    | "EXPAND"
    | "TIGHTEN"
    | "REPHRASE"
    | "ADD_TENSION"
    | "ADD_DIALOGUE"
    | "DESCRIPTION_TO_DIALOGUE"
    | "CUSTOM_EDIT"
    | "NEXT_BEATS"
    | "COACH",
  instruction: string,
  applyMode: "replace-selection" | "replace-draft" | "append",
) {
  const slice =
    actionType === "CONTINUE" || actionType === "NEXT_BEATS" || actionType === "COACH"
      ? {
          selectionText: currentContent.slice(Math.max(0, currentContent.length - 500)),
          selectionStart: Math.max(0, currentContent.length - 500),
          selectionEnd: currentContent.length,
        }
      : middleSlice(currentContent);

  const assist = await requestJson<{ run: { id: string } }>(`/api/chapters/${chapterId}/assist`, {
    method: "POST",
    body: JSON.stringify({
      mode: actionType === "COACH" ? "COACH" : "CO_WRITE",
      role: actionType === "COACH" ? "WRITING_COACH" : "COWRITER",
      actionType,
      selectionText: slice.selectionText,
      instruction,
      contextNote: "Book generation harness",
      beforeSelection: currentContent.slice(0, slice.selectionStart),
      afterSelection: currentContent.slice(slice.selectionEnd),
    }),
  });

  if (actionType === "COACH") {
    return;
  }

  await applyRun(assist.run.id, fieldKey, currentContent, applyMode, slice.selectionStart, slice.selectionEnd);
}

async function runAssistOnDraft(
  chapterId: string,
  currentDraft: string,
  actionType:
    | "CONTINUE"
    | "EXPAND"
    | "TIGHTEN"
    | "REPHRASE"
    | "ADD_TENSION"
    | "ADD_DIALOGUE"
    | "DESCRIPTION_TO_DIALOGUE"
    | "CUSTOM_EDIT"
    | "NEXT_BEATS"
    | "COACH",
  instruction: string,
  applyMode: "replace-selection" | "replace-draft" | "append",
) {
  return runAssistOnField(chapterId, currentDraft, "draft", actionType, instruction, applyMode);
}

async function runAssistOnOutline(
  chapterId: string,
  currentOutline: string,
  actionType: "EXPAND" | "TIGHTEN" | "NEXT_BEATS" | "CUSTOM_EDIT",
  instruction: string,
  applyMode: "replace-selection" | "replace-draft" | "append",
) {
  return runAssistOnField(chapterId, currentOutline, "outline", actionType, instruction, applyMode);
}

async function generateAndApplyOutline(chapterId: string) {
  const outline = await requestJson<{ run: { id: string } }>(`/api/chapters/${chapterId}/generate/outline`, {
    method: "POST",
  });
  await applyRun(outline.run.id, "outline", "", "replace-draft", 0, 0);
}

async function generateAndApplyDraft(chapterId: string) {
  const draft = await requestJson<{ run: { id: string } }>(`/api/chapters/${chapterId}/generate/draft`, {
    method: "POST",
  });
  await applyRun(draft.run.id, "draft", "", "replace-draft", 0, 0);
}

async function reviewChapterGuide(chapterId: string) {
  return requestJson<{
    report: {
      alignmentScore: number;
      recommendations: Array<{ fixInstruction: string; title: string; explanation: string }>;
    };
  }>(`/api/chapters/${chapterId}/bestseller-guide`, {
    method: "POST",
  });
}

async function reviewBookGuide(projectId: string) {
  return requestJson<{
    report: {
      alignmentScore: number;
      recommendations: Array<{
        fixInstruction: string;
        targetChapterId: string | null;
        targetChapterNumber: number | null;
        title: string;
      }>;
    };
  }>(`/api/projects/${projectId}/bestseller-guide`, {
    method: "POST",
  });
}

function firstParagraph(text: string) {
  return text.split(/\n\s*\n/).map((part) => part.trim()).find(Boolean) ?? text.trim();
}

function firstSentence(text: string) {
  return (text.match(/[^.!?]+(?:[.!?]+|$)/)?.[0] ?? text).trim();
}

function chapterLooksRepetitive(
  project: ProjectWorkspace,
  chapter: ProjectWorkspace["chapters"][number],
) {
  const current = chapter.draft?.trim() ?? "";
  if (!current) {
    return false;
  }

  const currentOpening = firstParagraph(current);
  const recentChapters = project.chapters
    .filter((entry) => entry.number < chapter.number)
    .sort((left, right) => right.number - left.number)
    .slice(0, 6);

  return recentChapters.some((previous) => {
    const previousDraft = previous.draft?.trim() ?? "";
    if (!previousDraft) {
      return false;
    }

      const previousOpening = firstParagraph(previousDraft);
      const openingSimilarity = wordOverlapScore(currentOpening, previousOpening);
      const firstSentenceSimilarity = wordOverlapScore(firstSentence(currentOpening), firstSentence(previousOpening));
      const bodySimilarity = wordOverlapScore(current.slice(0, 1800), previousDraft.slice(0, 1800));
      return openingSimilarity >= 0.5 || firstSentenceSimilarity >= 0.7 || bodySimilarity >= 0.72;
  });
}

function chapterHasMetaPrefix(draft: string) {
  const opening = draft.trim().slice(0, 240).toLowerCase();
  return (
    opening.startsWith("okay, i will") ||
    opening.startsWith("here is") ||
    opening.includes("[seed for co-writing]") ||
    opening.includes("i will revise the chapter") ||
    opening.includes("i will rewrite")
  );
}

function chapterHasEmbeddedChapterHeading(draft: string) {
  return /\n\s*(?:#{1,6}\s*|\*\*)chapter\s+\d+(?:\s*[-:]\s*.+)?/i.test(draft.trim().slice(120));
}

async function updateChapter(chapterId: string, patch: Record<string, unknown>) {
  return requestJson<{ chapter: unknown }>(`/api/chapters/${chapterId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

async function applyCharacterInterpretations(projectId: string, project: ProjectWorkspace, targetNames: string[]) {
  for (const name of targetNames) {
    const character = project.characters.find((entry) => entry.name === name);
    if (!character) {
      continue;
    }

    const result = await requestJson<{ suggestions: Array<{ key: string; value: string }> }>(
      `/api/projects/${projectId}/characters/${character.id}/interpret`,
      {
        method: "POST",
      },
    );

    if (!result.suggestions.length) {
      continue;
    }

    const payload: Record<string, unknown> = {
      ...character,
      quickProfile: structuredClone(character.quickProfile),
      dossier: structuredClone(character.dossier),
      currentState: structuredClone(character.currentState),
      customFields: structuredClone(character.customFields),
      pinnedFields: structuredClone(character.pinnedFields),
      tags: [],
      quirks: [],
    };

    for (const suggestion of result.suggestions.slice(0, 5)) {
      setByPath(payload, suggestion.key, suggestion.value);
    }

    await requestJson<{ project: ProjectWorkspace }>(`/api/projects/${projectId}/story-bible`, {
      method: "PATCH",
      body: JSON.stringify({
        entityType: "character",
        id: character.id,
        payload,
      }),
    });
  }
}

async function syncChapter(projectId: string, chapterId: string, report: Array<Record<string, unknown>>) {
  const sync = await requestJson<{
    extraction: { summary: string };
    report: { issues: Array<{ title: string; description: string; suggestedContext: string }> };
    project: ProjectWorkspace;
  }>(`/api/chapters/${chapterId}/sync`, {
    method: "POST",
  });

  const summary = await requestJson<{ summary: { summary: string } }>(`/api/chapters/${chapterId}/summary`, {
    method: "POST",
  });
  const extraction = await requestJson<{ extraction: { summary: string } }>(`/api/chapters/${chapterId}/extract-memory`, {
    method: "POST",
  });
  const continuity = await requestJson<{ report: { issues: Array<{ title: string; description: string; suggestedContext: string }> } }>(
    `/api/chapters/${chapterId}/continuity`,
    {
      method: "POST",
      body: JSON.stringify({
        mode: "POST_GENERATION",
      }),
    },
    );

  if (continuity.report.issues.length > 0) {
    const dedupedIssues = Array.from(
      new Map(
        continuity.report.issues.map((issue) => [
          `${issue.title}::${issue.suggestedContext}`.toLowerCase(),
          issue,
        ]),
      ).values(),
    ).slice(0, 5);
    const instruction = [
      "Fix the flagged continuity issues without flattening the scene.",
      "Only repair the issues listed below. Do not rewrite the chapter from scratch.",
      ...dedupedIssues.map((issue) => `- ${issue.title}: ${issue.description} Fix: ${issue.suggestedContext}`),
    ].join("\n");
      await reviseAndReplaceDraft(chapterId, instruction, "REVISE");
      await requestJson<{ summary: { summary: string } }>(`/api/chapters/${chapterId}/summary`, { method: "POST" });
    await requestJson<{ extraction: { summary: string } }>(`/api/chapters/${chapterId}/extract-memory`, { method: "POST" });
    await requestJson<{ report: { issues: Array<unknown> } }>(`/api/chapters/${chapterId}/continuity`, {
      method: "POST",
      body: JSON.stringify({
        mode: "POST_GENERATION",
      }),
    });
  }

  report.push({
    chapterId,
    summary: summary.summary.summary,
    extraction: extraction.extraction.summary,
    syncIssues: sync.report.issues.length,
    continuityIssues: continuity.report.issues.length,
  });

  const refreshed = await refreshProject(projectId);
  const promoteCandidate = refreshed.project.shortTermMemoryItems.find((item) => item.status === "CANDIDATE");
  if (promoteCandidate) {
    await requestJson<{ project: ProjectWorkspace }>(`/api/projects/${projectId}/memory/promote`, {
      method: "POST",
      body: JSON.stringify({ memoryItemId: promoteCandidate.id }),
    });
  }
}

async function buildManualChapter(
  projectId: string,
  chapterId: string,
  chapterPlan: ChapterPlan["chapters"][number],
  chapter: ProjectWorkspace["chapters"][number],
) {
  const seedDraft = [
    `[Seed for co-writing] ${chapterPlan.title}`,
    `${chapterPlan.purpose}`,
    `POV: ${chapterPlan.pov}. Focus: ${chapterPlan.assistFocus || chapterPlan.currentBeat}.`,
    `Include: ${chapterPlan.requiredInclusions.join(", ")}.`,
  ].join("\n");

  await updateChapter(chapterId, {
    draft: seedDraft,
    status: "DRAFTING",
  });

  await requestJson<{ run: { id: string } }>(`/api/chapters/${chapterId}/assist`, {
    method: "POST",
    body: JSON.stringify({
      mode: "COACH",
      role: "WRITING_COACH",
      actionType: "COACH",
      selectionText: "",
      instruction: `Coach this chapter plainly. Help me land ${chapterPlan.assistFocus || chapterPlan.currentBeat} with tragedy, history, and emotional movement.`,
      contextNote: "Manual chapter coaching",
      beforeSelection: "",
      afterSelection: "",
    }),
  });

  await runAssistOnDraft(
    chapterId,
    seedDraft,
    "CONTINUE",
    `Continue from this seed into finished historical-fiction prose for chapter ${chapterPlan.number}. No meta commentary.`,
    "append",
  );

  let refreshed = (await refreshProject(projectId)).project.chapters.find((entry) => entry.id === chapterId) ?? chapter;

  await runAssistOnDraft(
    chapterId,
    refreshed.draft,
    "EXPAND",
    `Expand the strongest emotional beat in this chapter with sensory detail, pressure, and historical texture while still staying inside the chapter's planned event.`,
    "replace-selection",
  );

  refreshed = (await refreshProject(projectId)).project.chapters.find((entry) => entry.id === chapterId) ?? refreshed;

  await runAssistOnDraft(
    chapterId,
    refreshed.draft,
    "ADD_DIALOGUE",
    `Add dialogue that fits ${chapterPlan.pov}'s dossier, the chapter outline, and the story bible. Use proper quotation marks and distinct class-aware voice.`,
    "replace-selection",
  );

  refreshed = (await refreshProject(projectId)).project.chapters.find((entry) => entry.id === chapterId) ?? refreshed;

  await runAssistOnDraft(
    chapterId,
    refreshed.draft,
    "DESCRIPTION_TO_DIALOGUE",
    "Turn some descriptive exposition in the selected passage into dialogue without losing the underlying facts.",
    "replace-selection",
  );

  refreshed = (await refreshProject(projectId)).project.chapters.find((entry) => entry.id === chapterId) ?? refreshed;

  await runAssistOnDraft(
    chapterId,
    refreshed.draft,
    "ADD_TENSION",
    "Add tension, sharper consequence, and a stronger chapter-end hook without changing the historical logic.",
    "replace-selection",
  );

  refreshed = (await refreshProject(projectId)).project.chapters.find((entry) => entry.id === chapterId) ?? refreshed;

  await runAssistOnDraft(
    chapterId,
    refreshed.draft,
    "CUSTOM_EDIT",
    "Make the selected passage more tragic, severe, and historically grounded. No screenplay formatting. Keep all spoken dialogue inside quotation marks.",
    "replace-selection",
  );

  refreshed = (await refreshProject(projectId)).project.chapters.find((entry) => entry.id === chapterId) ?? refreshed;

  await runAssistOnDraft(
    chapterId,
    refreshed.draft,
    "TIGHTEN",
    "Tighten repetition, cut slackness, and keep the prose tragic, readable, and historically textured.",
    "replace-draft",
  );

  refreshed = (await refreshProject(projectId)).project.chapters.find((entry) => entry.id === chapterId) ?? refreshed;
  if (refreshed.outline.trim()) {
    await runAssistOnOutline(
      chapterId,
      refreshed.outline,
      "NEXT_BEATS",
      "Suggest the next outline beats that should carry the chapter toward its tragic end movement.",
      "append",
    );
  }

  await reviseAndReplaceDraft(
    chapterId,
    `Sharpen voice and period texture for ${chapterPlan.pov}, keeping the prose emotionally legible and specific.`,
    "SHARPEN_VOICE",
  );
}

async function finalContinuityAudit(project: ProjectWorkspace) {
  const auditSchema = z.array(
    z.object({
      chapterNumber: z.number().int().min(1).max(23),
      issue: z.string(),
      fixInstruction: z.string(),
    }),
  );

  const summaries = project.chapters.map((chapter) => ({
    number: chapter.number,
    title: chapter.title,
    summary: chapter.summaries[0]?.summary || chapter.outline || chapter.purpose,
  }));

  try {
    return await aiJson(
      "final continuity audit",
      [
        "You are StoryForge's final continuity auditor.",
        "Review the book summary package and find up to 3 continuity or arc-resolution issues that the simple rule checks might miss.",
        "Return strict JSON only as an array.",
        "If the book is clean, return [].",
        "Project title:",
        project.title,
        "Plot threads:",
        JSON.stringify(project.plotThreads, null, 2),
        "Character notes and latest states:",
        JSON.stringify(
          project.characters.map((character) => ({
            name: character.name,
            notes: character.notes.slice(-600),
            currentState: character.currentState,
          })),
          null,
          2,
        ),
        "Chapter summaries:",
        JSON.stringify(summaries, null, 2),
        'Array item shape: {"chapterNumber":9,"issue":"string","fixInstruction":"string"}',
      ].join("\n\n"),
      auditSchema,
    );
  } catch {
    return [];
  }
}

async function main() {
  await mkdir(exportsDir, { recursive: true });
  await ensureProvider();
  let projectId = resumeProjectId;
  let project: ProjectWorkspace;
  let chapterPlan: ChapterPlan;
  let characterIdByName = new Map<string, string>();

  if (resumeProjectId) {
    project = (await refreshProject(projectId)).project;
    characterIdByName = new Map(project.characters.map((character) => [character.name, character.id]));
    chapterPlan = {
      chapters: project.chapters
        .slice()
        .sort((left, right) => left.number - right.number)
        .map((chapter) => ({
          number: chapter.number,
          title: chapter.title,
          pov:
            project.characters.find((character) => character.id === chapter.povCharacterId)?.name ??
            project.characters[0]?.name ??
            "Lucius Vitellius",
          purpose: chapter.purpose,
          currentBeat: chapter.currentBeat,
          targetWordCount: Math.max(3900, chapter.targetWordCount || 3910),
          keyBeats: chapter.keyBeats,
          requiredInclusions: chapter.requiredInclusions,
          forbiddenElements: chapter.forbiddenElements,
          desiredMood: chapter.desiredMood,
          sceneList: chapter.sceneList,
          notes: chapter.notes,
          manualAssist: [4, 9, 15, 20].includes(chapter.number),
          assistFocus: chapter.currentBeat || chapter.purpose,
        })),
    };
  } else {
    const blueprint = await aiJson("story blueprint", buildBlueprintPrompt(), blueprintSchema);
    await writeFile(path.join(exportsDir, "second-temple-blueprint.json"), JSON.stringify(blueprint, null, 2));
    const rawChapterPlan = await generateChapterPlanInBatches(blueprint);
    chapterPlan = {
      chapters: rawChapterPlan.chapters.map((chapter) => ({
        ...chapter,
        targetWordCount: Math.max(3700, Math.min(4000, chapter.targetWordCount || 3910)),
        manualAssist: [4, 9, 15, 20].includes(chapter.number),
      })),
    };
    await writeFile(path.join(exportsDir, "second-temple-chapter-plan.json"), JSON.stringify(chapterPlan, null, 2));
    const structureBeats = deriveStructureBeats(chapterPlan.chapters);

    if (chapterPlan.chapters.length !== 23) {
      throw new Error(`Expected 23 chapters but received ${chapterPlan.chapters.length}.`);
    }

    projectId = await createProject(blueprint);
    for (let count = 1; count < 23; count += 1) {
      await requestJson<{ chapterId: string }>(`/api/projects/${projectId}/chapters`, {
        method: "POST",
      });
    }

    project = (await refreshProject(projectId)).project;

    for (const character of blueprint.characters) {
      await addStoryBibleEntity(projectId, "character", buildCharacterPayload(character));
    }

    project = (await refreshProject(projectId)).project;
    characterIdByName = new Map(project.characters.map((character) => [character.name, character.id]));

    for (const relationship of blueprint.relationships) {
      const sourceCharacterId = characterIdByName.get(relationship.source);
      const targetCharacterId = characterIdByName.get(relationship.target);
      if (!sourceCharacterId || !targetCharacterId) {
        continue;
      }

      await addStoryBibleEntity(projectId, "relationship", {
        sourceCharacterId,
        targetCharacterId,
        kind: relationship.kind,
        description: relationship.description,
        tension: relationship.tension,
        status: relationship.status,
      });
    }

    for (const location of blueprint.locations) {
      await addStoryBibleEntity(projectId, "location", location);
    }

    for (const faction of blueprint.factions) {
      await addStoryBibleEntity(projectId, "faction", faction);
    }

    for (const thread of blueprint.plotThreads) {
      await addStoryBibleEntity(projectId, "plotThread", {
        ...thread,
        status: "ACTIVE",
      });
    }

    for (const event of blueprint.timelineEvents) {
      await addStoryBibleEntity(projectId, "timelineEvent", {
        ...event,
        orderIndex: blueprint.timelineEvents.indexOf(event) + 1,
      });
    }

    project = (await refreshProject(projectId)).project;

    for (const beat of structureBeats) {
      const chapter = project.chapters.find((entry) => entry.number === beat.chapterNumber);
      await addSkeletonEntity(projectId, "structureBeat", {
        chapterId: chapter?.id ?? null,
        type: beat.type,
        label: beat.label,
        description: beat.description,
        notes: beat.notes,
        status: beat.status,
        orderIndex: beat.orderIndex,
      });
    }

    await requestJson<{ reply: string; actions: unknown[] }>(`/api/projects/${projectId}/assistant`, {
      method: "POST",
      body: JSON.stringify({
        message:
          "Add this as an idea vault note: the hero's fatal blindness is that he mistakes ceremony for moral order, and every later loss grows from that error.",
        role: "BRAINSTORM_PARTNER",
        scope: "IDEA_LAB",
        chapterId: null,
        applyChanges: true,
      }),
    });

    await requestJson<{ reply: string; actions: unknown[] }>(`/api/projects/${projectId}/assistant`, {
      method: "POST",
      body: JSON.stringify({
        message:
          "Turn this into a midpoint beat: the spy realizes Roman victory is certain, but the city's self-inflicted ruin has made triumph feel like witnessing a people execute itself.",
        role: "OUTLINE_ARCHITECT",
        scope: "SKELETON",
        chapterId: null,
        applyChanges: true,
      }),
    });

    await requestJson<{ reply: string; actions: unknown[] }>(`/api/projects/${projectId}/assistant`, {
      method: "POST",
      body: JSON.stringify({
        message:
          "Advise plainly on how to keep the Roman spy morally readable while still making his final act monstrous and unforgivable.",
        role: "WRITING_COACH",
        scope: "PROJECT",
        chapterId: null,
        applyChanges: false,
      }),
    });

    project = (await refreshProject(projectId)).project;
    await applyCharacterInterpretations(projectId, project, blueprint.characters.slice(0, 4).map((character) => character.name));

    project = (await refreshProject(projectId)).project;

    for (const planChapter of chapterPlan.chapters) {
      const chapter = project.chapters.find((entry) => entry.number === planChapter.number);
      if (!chapter) {
        throw new Error(`Missing chapter ${planChapter.number} in the created project.`);
      }

      await updateChapter(chapter.id, {
        title: planChapter.title,
        purpose: planChapter.purpose,
        currentBeat: planChapter.currentBeat,
        targetWordCount: planChapter.targetWordCount,
        keyBeats: planChapter.keyBeats,
        requiredInclusions: planChapter.requiredInclusions,
        forbiddenElements: planChapter.forbiddenElements,
        desiredMood: planChapter.desiredMood,
        sceneList: planChapter.sceneList,
        notes: planChapter.notes,
        povCharacterId: characterIdByName.get(planChapter.pov) ?? null,
        status: "PLANNED",
      });
    }

    await requestJson<{ content: string; contextPackage: unknown }>(`/api/projects/${projectId}/generate/plan`, {
      method: "POST",
    });

    const firstChapter = project.chapters.find((entry) => entry.number === 1);
    if (firstChapter) {
      await requestJson<{ reply: string; actions: unknown[] }>(`/api/projects/${projectId}/assistant`, {
        method: "POST",
        body: JSON.stringify({
          message:
            "Update the selected chapter outline so it clearly shows the Roman spy moving through Jerusalem's factions, gathering intelligence, and ending on a stronger note of dread.",
          role: "OUTLINE_ARCHITECT",
          scope: "CHAPTER",
          chapterId: firstChapter.id,
          applyChanges: true,
        }),
      });
    }
  }

  const chapterReport: Array<Record<string, unknown>> = [];

    for (const planChapter of chapterPlan.chapters) {
      project = (await refreshProject(projectId)).project;
      const chapter = project.chapters.find((entry) => entry.number === planChapter.number);
      if (!chapter) {
        throw new Error(`Could not reload chapter ${planChapter.number}.`);
      }

      const needsRepair =
        !resumeProjectId ||
        chapter.wordCount < planChapter.targetWordCount - 100 ||
        chapterHasMetaPrefix(chapter.draft) ||
        chapterHasEmbeddedChapterHeading(chapter.draft) ||
        chapterLooksRepetitive(project, chapter) ||
        [1, 12, 23].includes(planChapter.number);
      if (resumeProjectId && !needsRepair) {
        continue;
      }

      await requestJson<{ report: { issues: unknown[] } }>(`/api/chapters/${chapter.id}/continuity`, {
        method: "POST",
        body: JSON.stringify({
          mode: "PRE_GENERATION",
        }),
      });

      if (!resumeProjectId || !chapter.outline.trim()) {
        await generateAndApplyOutline(chapter.id);
      }

      if (!resumeProjectId || !chapter.draft.trim()) {
        if (planChapter.manualAssist) {
          await buildManualChapter(projectId, chapter.id, planChapter, chapter);
        } else {
          await generateAndApplyDraft(chapter.id);
        }
      }

      project = (await refreshProject(projectId)).project;
      let draftedChapter = project.chapters.find((entry) => entry.id === chapter.id);
      if (!draftedChapter) {
        throw new Error(`Could not reload drafted chapter ${planChapter.number}.`);
      }

      if (chapterHasMetaPrefix(draftedChapter.draft) || chapterHasEmbeddedChapterHeading(draftedChapter.draft)) {
        await reviseAndReplaceDraft(
          chapter.id,
          "Rewrite this full chapter as clean novel prose only. Remove every trace of meta commentary, planning language, editor framing, in-chapter headings, appended 'extended' sections, and AI wrapper text while preserving the actual chapter events, canon, outline, and chapter purpose.",
          "REVISE",
        );
        project = (await refreshProject(projectId)).project;
        draftedChapter = project.chapters.find((entry) => entry.id === chapter.id);
        if (!draftedChapter) {
          throw new Error(`Could not reload chapter ${planChapter.number} after metadata cleanup.`);
        }
      }

      const wordPasses = resumeProjectId ? 5 : 3;
      for (let pass = 0; pass < wordPasses; pass += 1) {
        if (draftedChapter.wordCount >= planChapter.targetWordCount - 200 && draftedChapter.wordCount <= planChapter.targetWordCount + 100) {
          break;
        }

        if (draftedChapter.wordCount < planChapter.targetWordCount - 200) {
          await reviseAndReplaceDraft(
            chapter.id,
            `Expand this full chapter to land between ${planChapter.targetWordCount - 50} and ${planChapter.targetWordCount + 100} words. Add concrete scene development, dialogue, setting detail, and tragic consequence without repeating earlier chapters or recycling the same opening image.`,
            "REVISE",
          );
        } else if (draftedChapter.wordCount > planChapter.targetWordCount + 100) {
        await runAssistOnDraft(
          chapter.id,
          draftedChapter.draft,
          "TIGHTEN",
          `Tighten the selected chapter so the whole manuscript lands near ${planChapter.targetWordCount} words without losing plot logic or emotional force.`,
          "replace-draft",
        );
      }

      project = (await refreshProject(projectId)).project;
      draftedChapter = project.chapters.find((entry) => entry.id === chapter.id);
      if (!draftedChapter) {
        throw new Error(`Could not reload chapter ${planChapter.number} after word-count revision.`);
      }
    }

    if ([2, 6, 10, 14, 18, 22].includes(planChapter.number)) {
      await reviseAndReplaceDraft(
        chapter.id,
        "Improve the prose while keeping the chapter clear, tragic, and commercially readable.",
        "IMPROVE_PROSE",
      );
    }

    if ([3, 7, 11, 16, 20].includes(planChapter.number)) {
      await reviseAndReplaceDraft(
        chapter.id,
        `Sharpen the dialogue and narrative voice so ${planChapter.pov} sounds unmistakably like himself in this chapter.`,
        "SHARPEN_VOICE",
      );
    }

    project = (await refreshProject(projectId)).project;
    const activeDraft = project.chapters.find((entry) => entry.id === chapter.id)?.draft ?? "";
    if (activeDraft.length > 300) {
      await runAssistOnDraft(
        chapter.id,
        activeDraft,
        "REPHRASE",
        "Rephrase the selected passage for cleaner rhythm without changing the meaning.",
        "replace-selection",
      );
    }

    project = (await refreshProject(projectId)).project;
    draftedChapter = project.chapters.find((entry) => entry.id === chapter.id);
    if (!draftedChapter) {
      throw new Error(`Could not reload chapter ${planChapter.number} before repetition check.`);
    }

      if (chapterLooksRepetitive(project, draftedChapter)) {
        await reviseAndReplaceDraft(
          chapter.id,
          `This chapter is overlapping too much with nearby chapters. Rewrite it so it stays faithful to the outline, story bible, and chapter purpose but becomes materially distinct in opening image, setting movement, event sequence, and emotional turn.`,
          "REVISE",
        );
      }

    if ([1, 12, 23].includes(planChapter.number)) {
      const guide = await reviewChapterGuide(chapter.id);
      const firstRecommendation = guide.report.recommendations[0];
      if (firstRecommendation?.fixInstruction) {
        await reviseAndReplaceDraft(chapter.id, firstRecommendation.fixInstruction, "REVISE");
      }
    }

    if (planChapter.number === 5) {
      await requestJson<{ reply: string; actions: unknown[] }>(`/api/projects/${projectId}/assistant`, {
        method: "POST",
        body: JSON.stringify({
          message:
            "Add two short manuscript paragraphs to the selected chapter showing the spy noticing that Jewish factional hatred is becoming more horrifying to him than Roman violence.",
          role: "COWRITER",
          scope: "CHAPTER",
          chapterId: chapter.id,
          applyChanges: true,
        }),
      });
    }

    await syncChapter(projectId, chapter.id, chapterReport);
    await updateChapter(chapter.id, { status: "COMPLETE" });
  }

  project = (await refreshProject(projectId)).project;
  const wholeBookGuide = await reviewBookGuide(projectId);
  for (const recommendation of wholeBookGuide.report.recommendations.slice(0, 3)) {
    const targetChapter =
      (recommendation.targetChapterId
        ? project.chapters.find((entry) => entry.id === recommendation.targetChapterId)
        : null) ??
      (recommendation.targetChapterNumber
        ? project.chapters.find((entry) => entry.number === recommendation.targetChapterNumber)
        : null);
    if (!targetChapter) {
      continue;
    }

    await reviseAndReplaceDraft(targetChapter.id, recommendation.fixInstruction, "REVISE");
    await syncChapter(projectId, targetChapter.id, chapterReport);
  }

  project = (await refreshProject(projectId)).project;
  const auditFixes = await finalContinuityAudit(project);

  for (const issue of auditFixes.slice(0, 3)) {
    const chapter = project.chapters.find((entry) => entry.number === issue.chapterNumber);
    if (!chapter) {
      continue;
    }

    await reviseAndReplaceDraft(chapter.id, issue.fixInstruction, "REVISE");
    await requestJson<{ summary: { summary: string } }>(`/api/chapters/${chapter.id}/summary`, { method: "POST" });
    await requestJson<{ extraction: { summary: string } }>(`/api/chapters/${chapter.id}/extract-memory`, { method: "POST" });
    await requestJson<{ report: { issues: Array<unknown> } }>(`/api/chapters/${chapter.id}/continuity`, {
      method: "POST",
      body: JSON.stringify({ mode: "POST_GENERATION" }),
    });
  }

  project = (await refreshProject(projectId)).project;

  const exportSlug = slugify(project.title);
  const pdfPath = path.join(exportsDir, `${exportSlug}.pdf`);
  const mdPath = path.join(exportsDir, `${exportSlug}.md`);
  const jsonPath = path.join(exportsDir, `${exportSlug}.json`);
  const reportPath = path.join(exportsDir, `${exportSlug}-run-report.json`);

  await downloadFile(`/api/projects/${projectId}/export?format=pdf`, pdfPath);
  await downloadFile(`/api/projects/${projectId}/export?format=md`, mdPath);
  await downloadFile(`/api/projects/${projectId}/export?format=json`, jsonPath);

  await writeFile(
    reportPath,
    JSON.stringify(
      {
        projectId,
        title: project.title,
        slug: project.slug,
        model: targetOpenRouterModel,
        totalWords: project.chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
        auditFixes,
        chapterReport,
        exports: {
          pdfPath,
          mdPath,
          jsonPath,
        },
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        projectId,
        title: project.title,
        slug: project.slug,
        totalWords: project.chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
        pdfPath,
        mdPath,
        jsonPath,
        reportPath,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("BOOK_GENERATION_FAIL");
  console.error(error);
  process.exit(1);
});
