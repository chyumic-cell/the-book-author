import type { AiRole, AssistActionType, StoryForgeTab } from "@/types/storyforge";

export const storyForgeTabs: { id: StoryForgeTab; label: string }[] = [
  { id: "ideaLab", label: "Idea Lab" },
  { id: "setup", label: "Book Setup" },
  { id: "skeleton", label: "Story Skeleton" },
  { id: "bible", label: "Story Bible" },
  { id: "chapters", label: "Chapters" },
  { id: "memory", label: "Memory" },
  { id: "continuity", label: "Continuity" },
  { id: "settings", label: "Settings" },
];

export const aiRoleOptions: {
  id: AiRole;
  label: string;
  description: string;
}[] = [
  {
    id: "GHOSTWRITER",
    label: "Ghostwriter",
    description: "Writes clean prose while preserving structure, continuity, and tone.",
  },
  {
    id: "COWRITER",
    label: "Cowriter",
    description: "Suggests options and scene moves without taking over the page.",
  },
  {
    id: "STORY_DOCTOR",
    label: "Story Doctor",
    description: "Diagnoses weak structure, passive turns, and story drift.",
  },
  {
    id: "DEVELOPMENTAL_EDITOR",
    label: "Developmental Editor",
    description: "Offers candid editorial critique and revision guidance.",
  },
  {
    id: "OUTLINE_ARCHITECT",
    label: "Outline Architect",
    description: "Builds plot skeletons, act structure, and chapter progression.",
  },
  {
    id: "BRAINSTORM_PARTNER",
    label: "Brainstorm Partner",
    description: "Generates variants, what-ifs, and combinations from rough ideas.",
  },
  {
    id: "WRITING_COACH",
    label: "Writing Coach",
    description: "Guides the writer without drafting prose unless explicitly asked.",
  },
  {
    id: "BETA_READER",
    label: "Beta Reader",
    description: "Reacts like an engaged audience and flags confusion or flat sections.",
  },
];

export const builtInHeuristics = {
  LIGHT: [
    "Give the chapter a clear emotional shift.",
    "Favor specific imagery over generic exposition.",
  ],
  STRONG: [
    "Every chapter should contain tension, change, or revelation.",
    "Scenes should have a goal, obstacle, and consequence.",
    "End chapters with momentum into the next decision.",
    "Embed exposition inside conflict, desire, or argument.",
  ],
  AGGRESSIVE: [
    "Every chapter should contain tension, change, or revelation.",
    "Raise or complicate a problem by the end of the chapter.",
    "Keep scene turns visible and pressure rising.",
    "Treat quiet scenes as emotionally consequential, not static.",
    "Endings should create forward pull and sharpen the next question.",
  ],
} as const;

export const assistActions: { id: AssistActionType; label: string; prompt: string }[] = [
  { id: "CONTINUE", label: "Continue", prompt: "Continue from the cursor with momentum and continuity." },
  { id: "EXPAND", label: "Expand", prompt: "Expand this passage with richer texture, subtext, and scene movement." },
  { id: "TIGHTEN", label: "Tighten", prompt: "Tighten this passage for pace and clarity without flattening voice." },
  { id: "REPHRASE", label: "Rephrase", prompt: "Rephrase this passage while preserving intent." },
  { id: "IMPROVE_PROSE", label: "Improve prose", prompt: "Improve the prose with specificity and rhythm." },
  { id: "SHARPEN_VOICE", label: "Sharpen voice", prompt: "Sharpen character voice and subtext." },
  { id: "ADD_TENSION", label: "Add tension", prompt: "Heighten tension, stakes, and underlying pressure." },
  { id: "ADD_DIALOGUE", label: "Add dialogue", prompt: "Add strong, in-character dialogue that fits this exact moment." },
  {
    id: "DESCRIPTION_TO_DIALOGUE",
    label: "Description to dialogue",
    prompt: "Convert descriptive exposition into vivid dialogue while preserving the scene's meaning.",
  },
  { id: "CUSTOM_EDIT", label: "Custom edit", prompt: "Follow the writer's exact instruction for the selected text." },
  { id: "NEXT_BEATS", label: "Next beats", prompt: "Suggest the next beats that should happen in this chapter." },
];

export const builtInPresets = [
  "thriller",
  "fantasy epic",
  "literary drama",
  "romance",
  "grimdark",
  "ya adventure",
  "political intrigue",
  "sci-fi mystery",
];
