import { z } from "zod";

export const projectCreateSchema = z.object({
  title: z.string().min(2),
  premise: z.string().min(20),
  oneLineHook: z.string().optional().default(""),
  seriesName: z.string().optional().default(""),
  seriesOrder: z.number().int().positive().nullable().optional().default(null),
  genre: z.string().min(2),
  tone: z.string().min(2),
  audience: z.string().min(2),
  pointOfView: z.string().min(2),
  tense: z.string().min(2),
  storyBrief: z.string().min(20),
  plotDirection: z.string().min(20),
});

export const projectPatchSchema = z.object({
  title: z.string().min(2).optional(),
  premise: z.string().min(20).optional(),
  oneLineHook: z.string().optional(),
  bookSettings: z
    .object({
      authorName: z.string().optional().default(""),
      seriesName: z.string().optional().default(""),
      seriesOrder: z.number().int().positive().nullable().optional().default(null),
      genre: z.string(),
      tone: z.string(),
      audience: z.string(),
      themes: z.array(z.string()),
      pointOfView: z.string(),
      tense: z.string(),
      targetChapterLength: z.number().int(),
      targetBookLength: z.number().int(),
      storyBrief: z.string(),
      plotDirection: z.string(),
      pacingNotes: z.string(),
      romanceLevel: z.number().int().min(0).max(5),
      darknessLevel: z.number().int().min(0).max(5),
      proseStyle: z.string(),
      comparableTitles: z.array(z.string()),
    })
    .optional(),
  styleProfile: z
    .object({
      guidanceIntensity: z.enum(["LIGHT", "STRONG", "AGGRESSIVE"]),
      proseDensity: z.number().int().min(0).max(10),
      pacing: z.number().int().min(0).max(10),
      darkness: z.number().int().min(0).max(10),
      romanceIntensity: z.number().int().min(0).max(10),
      humorLevel: z.number().int().min(0).max(10),
      actionFrequency: z.number().int().min(0).max(10),
      mysteryDensity: z.number().int().min(0).max(10),
      dialogueDescriptionRatio: z.number().int().min(0).max(10),
      literaryCommercialBalance: z.number().int().min(0).max(10),
      aestheticGuide: z.string(),
      styleGuide: z.string(),
      voiceRules: z.array(z.string()),
    })
    .optional(),
});

export const chapterPatchSchema = z.object({
  title: z.string().optional(),
  purpose: z.string().optional(),
  currentBeat: z.string().optional(),
  targetWordCount: z.number().int().optional(),
  keyBeats: z.array(z.string()).optional(),
  requiredInclusions: z.array(z.string()).optional(),
  forbiddenElements: z.array(z.string()).optional(),
  desiredMood: z.string().optional(),
  sceneList: z.array(z.string()).optional(),
  outline: z.string().optional(),
  draft: z.string().optional(),
  notes: z.string().optional(),
  povCharacterId: z.string().nullable().optional(),
  status: z.string().optional(),
});

export const storyBibleMutationSchema = z.object({
  entityType: z.enum(["character", "relationship", "plotThread", "location", "faction", "timelineEvent"]),
  id: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
});

export const ideaLabMutationSchema = z.object({
  entityType: z.enum(["ideaEntry", "workingNote"]),
  id: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
});

export const skeletonMutationSchema = z.object({
  entityType: z.enum(["structureBeat", "sceneCard"]),
  id: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
});

export const assistRequestSchema = z.object({
  mode: z.enum(["FREE_WRITE", "CO_WRITE", "FULL_AUTHOR", "COACH"]),
  role: z
    .enum([
      "GHOSTWRITER",
      "COWRITER",
      "STORY_DOCTOR",
      "DEVELOPMENTAL_EDITOR",
      "OUTLINE_ARCHITECT",
      "BRAINSTORM_PARTNER",
      "WRITING_COACH",
      "BETA_READER",
    ])
    .optional()
    .default("COWRITER"),
  actionType: z.enum([
    "CONTINUE",
    "EXPAND",
    "TIGHTEN",
    "REPHRASE",
    "IMPROVE_PROSE",
    "SHARPEN_VOICE",
    "ADD_TENSION",
    "ADD_DIALOGUE",
    "DESCRIPTION_TO_DIALOGUE",
    "CUSTOM_EDIT",
    "NEXT_BEATS",
    "COACH",
    "OUTLINE",
    "DRAFT",
    "REVISE",
  ]),
  selectionText: z.string().optional().default(""),
  instruction: z.string().optional().default(""),
  contextNote: z.string().optional().default(""),
  beforeSelection: z.string().optional().default(""),
  afterSelection: z.string().optional().default(""),
});

export const applyAssistSchema = z.object({
  applyMode: z.enum(["replace-selection", "replace-draft", "append", "insert-at-cursor"]),
  selectionStart: z.number().int().nonnegative().optional(),
  selectionEnd: z.number().int().nonnegative().optional(),
  fieldKey: z.enum([
    "title",
    "purpose",
    "currentBeat",
    "keyBeats",
    "requiredInclusions",
    "forbiddenElements",
    "desiredMood",
    "sceneList",
    "outline",
    "draft",
    "notes",
  ]).optional(),
  draft: z.string().optional(),
  content: z.string().optional(),
});

export const continuityCheckRequestSchema = z.object({
  draft: z.string().optional().default(""),
  mode: z
    .enum(["QUICK", "CHAPTER", "ARC", "FULL_BOOK", "PRE_GENERATION", "POST_GENERATION"])
    .optional()
    .default("CHAPTER"),
});

export const projectChatSchema = z.object({
  message: z.string().min(1),
  role: z.enum([
    "GHOSTWRITER",
    "COWRITER",
    "STORY_DOCTOR",
    "DEVELOPMENTAL_EDITOR",
    "OUTLINE_ARCHITECT",
    "BRAINSTORM_PARTNER",
    "WRITING_COACH",
    "BETA_READER",
  ]),
  scope: z.enum(["AUTO", "PROJECT", "IDEA_LAB", "SKELETON", "CHAPTER", "STORY_BIBLE"]).default("AUTO"),
  chapterId: z.string().nullable().optional(),
  applyChanges: z.boolean().default(true),
});

export const autopilotRequestSchema = z.object({
  action: z.enum(["start", "resume", "status"]).default("start"),
  mode: z.enum(["CURRENT_CHAPTER", "BOOK"]).default("CURRENT_CHAPTER"),
  chapterId: z.string().nullable().optional(),
  generalPrompt: z.string().optional().default(""),
  jobId: z.string().optional(),
  maxChapters: z.number().int().min(1).max(6).optional().default(2),
});

export const providerSettingsSchema = z.object({
  activeProvider: z.enum(["MOCK", "OPENAI", "OPENROUTER", "CUSTOM"]),
  useMockFallback: z.boolean().default(true),
  openai: z.object({
    apiKey: z.string().optional(),
    clearKey: z.boolean().optional(),
    model: z.string().default("gpt-4.1-mini"),
  }),
  openrouter: z.object({
    apiKey: z.string().optional(),
    clearKey: z.boolean().optional(),
    model: z.string().default("openai/gpt-4.1-mini"),
    baseUrl: z.string().default("https://openrouter.ai/api/v1"),
    siteUrl: z.string().default("http://localhost:3000"),
    appName: z.string().default("The Book Author"),
  }),
  custom: z.object({
    apiKey: z.string().optional(),
    clearKey: z.boolean().optional(),
    label: z.string().default("Custom compatible API"),
    baseUrl: z.string().default(""),
    model: z.string().default(""),
  }),
});

export const providerModelSwitchSchema = z.object({
  provider: z.enum(["OPENAI", "OPENROUTER", "CUSTOM"]),
  model: z.string().min(1),
  activate: z.boolean().optional().default(true),
});
