import type { ProjectWorkspace } from "@/types/storyforge";

type FieldSpec = {
  key: string;
  label: string;
  description: string;
  example: string;
};

type EntitySpec = {
  entityType: "character" | "relationship" | "plotThread" | "location" | "faction" | "timelineEvent" | "workingNote";
  label: string;
  matchHint: string;
  fields: FieldSpec[];
};

export const BOOK_SETUP_FIELD_SPECS: FieldSpec[] = [
  { key: "authorName", label: "Author name", description: "The credited writer name that appears in exports.", example: "Michael William Polevoy" },
  { key: "seriesName", label: "Series name", description: "Shared series label for books that belong together.", example: "The Gray Harbor Files" },
  { key: "seriesOrder", label: "Book number in series", description: "Numeric placement of this book inside the series.", example: "2" },
  { key: "genre", label: "Genre", description: "Primary commercial shelf and storytelling lane.", example: "Epic fantasy war novel" },
  { key: "tone", label: "Tone", description: "Overall emotional and atmospheric tone of the book.", example: "Dark, urgent, tragic" },
  { key: "audience", label: "Audience", description: "Who the book is for.", example: "Adult commercial fantasy readers" },
  { key: "themes", label: "Themes", description: "Recurring thematic ideas that shape the book.", example: "Loyalty, inheritance, ruin" },
  { key: "pointOfView", label: "Point of view", description: "Narrative POV approach for the book.", example: "Multiple close third-person POVs" },
  { key: "tense", label: "Tense", description: "Primary tense used in the manuscript.", example: "Past tense" },
  { key: "targetChapterLength", label: "Target chapter length", description: "Average intended chapter word count.", example: "4000" },
  { key: "targetBookLength", label: "Target book length", description: "Whole-book word target.", example: "90000" },
  { key: "storyBrief", label: "Story brief", description: "Compact overview of what the story is and what drives it.", example: "A Roman spy in Jerusalem watches a doomed city tear itself apart." },
  { key: "plotDirection", label: "Plot direction", description: "Where the story is headed and what kind of ending pressure it wants.", example: "Escalate toward betrayal, siege, and a morally devastating end." },
  { key: "pacingNotes", label: "Pacing notes", description: "High-level pacing guidance for the novel.", example: "Fast openings, slower aftermath chapters, sharp chapter endings." },
  { key: "romanceLevel", label: "Romance level", description: "How central romance should be to the book.", example: "2" },
  { key: "darknessLevel", label: "Darkness level", description: "How dark or harsh the overall content should feel.", example: "4" },
  { key: "proseStyle", label: "Prose style", description: "Plain-language description of the prose approach.", example: "Elegant but sharp, image-rich without purple prose" },
  { key: "comparableTitles", label: "Comparable titles", description: "Books or authors this project should sit near on the shelf.", example: "Hilary Mantel, Guy Gavriel Kay" },
];

export const STYLE_PROFILE_FIELD_SPECS: FieldSpec[] = [
  { key: "guidanceIntensity", label: "Guidance intensity", description: "How strongly the app pushes its craft heuristics.", example: "AGGRESSIVE" },
  { key: "proseDensity", label: "Prose density", description: "How lean or rich the prose should feel on the page.", example: "7" },
  { key: "pacing", label: "Pacing", description: "How fast the scene motion and overall story movement should feel.", example: "8" },
  { key: "darkness", label: "Darkness", description: "How grim or shadowed the material should feel.", example: "6" },
  { key: "romanceIntensity", label: "Romance intensity", description: "How much romance should show up in scenes and arcs.", example: "3" },
  { key: "humorLevel", label: "Humor level", description: "How much wit or levity should appear.", example: "2" },
  { key: "actionFrequency", label: "Action frequency", description: "How often action-heavy beats should appear.", example: "7" },
  { key: "mysteryDensity", label: "Mystery density", description: "How many questions, clues, and withheld answers should stay active.", example: "8" },
  { key: "dialogueDescriptionRatio", label: "Dialogue vs description", description: "How dialogue-forward or description-forward the prose should be.", example: "6" },
  { key: "literaryCommercialBalance", label: "Literary vs commercial", description: "How literary or page-turning the book should feel.", example: "7" },
  { key: "aestheticGuide", label: "Aesthetic guide", description: "Short description of the project's atmosphere or visual feel.", example: "Rain-soaked alleys, old brass light, velvet decay" },
  { key: "styleGuide", label: "Style guide", description: "Direct style instructions the AI should obey.", example: "Avoid filler exposition. Keep every scene physically grounded." },
  { key: "voiceRules", label: "Voice rules", description: "Reusable rules for voice and delivery across the book.", example: "Use restrained emotional language\nLet tension sit under the surface" },
];

export const CHAPTER_FIELD_SPECS: FieldSpec[] = [
  { key: "title", label: "Chapter title", description: "The name of the chapter shown in the skeleton and chapter list.", example: "The Ash Gate" },
  { key: "purpose", label: "Chapter purpose", description: "What the chapter must accomplish in the book.", example: "Force the hero to choose between duty and family." },
  { key: "currentBeat", label: "Current beat", description: "The immediate dramatic movement or pressure inside the chapter.", example: "The fragile alliance starts to crack." },
  { key: "keyBeats", label: "Key beats", description: "Major turning beats the chapter should hit.", example: "Ambush at the bridge\nHidden wound revealed\nPyrrhic escape" },
  { key: "requiredInclusions", label: "Required inclusions", description: "Facts, moments, objects, or reveals that must appear in the chapter.", example: "Show the broken seal\nMention the emperor's letter" },
  { key: "forbiddenElements", label: "Forbidden elements", description: "Things that should not happen or be introduced in the chapter.", example: "Do not kill the mentor yet" },
  { key: "desiredMood", label: "Desired mood", description: "Short mood phrase for the chapter.", example: "Claustrophobic, bitter, exhausted" },
  { key: "sceneList", label: "Scene list", description: "Ordered list of scenes or lanes for the chapter.", example: "Harbor arrival\nInterrogation\nNight pursuit" },
  { key: "outline", label: "Chapter outline", description: "Concrete scene-by-scene or beat-by-beat outline for the chapter.", example: "1. Arrival at the harbor under curfew...\n2. The customs clerk recognizes the seal..." },
  { key: "draft", label: "Manuscript draft", description: "Finished prose for the chapter manuscript.", example: "The rain had teeth in it..." },
  { key: "notes", label: "Chapter notes", description: "Loose notes, reminders, or attached writing guidance for the chapter.", example: "Possibly move the confession later if the tension collapses too early." },
];

export const STORY_BIBLE_ENTITY_SPECS: EntitySpec[] = [
  {
    entityType: "character",
    label: "Character",
    matchHint: "Match by character name.",
    fields: [
      { key: "name", label: "Name", description: "Character name.", example: "Lucius Valens" },
      { key: "role", label: "Role", description: "Story function or job in the book.", example: "Roman intelligence officer" },
      { key: "archetype", label: "Archetype", description: "Narrative archetype or lane.", example: "Compromised witness" },
      { key: "summary", label: "Summary", description: "Compact summary of who the character is.", example: "A disciplined spy whose certainty rots into pity." },
      { key: "goal", label: "Goal", description: "What the character wants.", example: "Survive the siege and keep control of the mission." },
      { key: "fear", label: "Fear", description: "Core fear or dread.", example: "That he has become what he was sent to judge." },
      { key: "secret", label: "Secret", description: "Important hidden truth.", example: "He burned the archive before the war began." },
      { key: "wound", label: "Wound", description: "Formative hurt shaping the character.", example: "Failed to save his younger brother during a riot." },
      { key: "notes", label: "Notes", description: "Free notes about the character.", example: "Never jokes when frightened." },
      { key: "quickProfile", label: "Quick profile", description: "Age, profession, home, accent, speech pattern.", example: "{\"profession\":\"Spy\",\"speechPattern\":\"clipped, observant\"}" },
      { key: "dossier", label: "Dossier", description: "Deep structured character dossier.", example: "{\"speechLanguage\":{\"directness\":\"blunt but careful\"}}" },
      { key: "currentState", label: "Current state", description: "What the character currently knows, feels, and carries.", example: "{\"emotionalState\":\"ashamed and vigilant\"}" },
    ],
  },
  {
    entityType: "relationship",
    label: "Relationship",
    matchHint: "Match by source character + target character + kind.",
    fields: [
      { key: "sourceCharacterId", label: "From", description: "Source character id or matched character name.", example: "Lucius Valens" },
      { key: "targetCharacterId", label: "To", description: "Target character id or matched character name.", example: "Baruch" },
      { key: "kind", label: "Relationship type", description: "Relationship category.", example: "RIVAL" },
      { key: "description", label: "Description", description: "What the dynamic actually is.", example: "Mutual contempt wrapped around reluctant need." },
      { key: "tension", label: "Tension", description: "What currently strains the relationship.", example: "Each man knows the other is capable of betrayal." },
      { key: "status", label: "Status", description: "Current state of the relationship.", example: "ACTIVE" },
    ],
  },
  {
    entityType: "plotThread",
    label: "Plot thread",
    matchHint: "Match by plot thread title.",
    fields: [
      { key: "title", label: "Title", description: "Thread or mystery name.", example: "The hidden signal network" },
      { key: "summary", label: "Summary", description: "What this thread is about.", example: "Someone inside the city is feeding troop positions to Rome." },
      { key: "status", label: "Status", description: "Thread state.", example: "ACTIVE" },
      { key: "heat", label: "Heat", description: "Urgency or pressure level.", example: "4" },
      { key: "promisedPayoff", label: "Promised payoff", description: "What resolution or reveal the thread owes the reader.", example: "The source is exposed during the temple fire." },
      { key: "lastTouchedChapter", label: "Last touched chapter", description: "Most recent chapter number that advanced the thread.", example: "7" },
      { key: "progressMarkers", label: "Progress markers", description: "Per-chapter marker objects showing where the thread is introduced, developed, escalated, stalled, or resolved.", example: '[{"chapterNumber":3,"label":"The hidden ledger appears","strength":"INTRODUCED","notes":"The mystery first becomes visible on the page."}]' },
    ],
  },
  {
    entityType: "location",
    label: "Location",
    matchHint: "Match by location name.",
    fields: [
      { key: "name", label: "Name", description: "Location name.", example: "Gray Harbor" },
      { key: "summary", label: "Summary", description: "What the place is.", example: "A salt-choked fishing town under permanent fog." },
      { key: "atmosphere", label: "Atmosphere", description: "How the location feels.", example: "Wind-bitten, suspicious, damp" },
      { key: "rules", label: "Rules", description: "What rules or constraints define the place.", example: "No one speaks above a murmur after dusk." },
      { key: "notes", label: "Notes", description: "Extra canon or detail notes.", example: "The bell tower is always manned." },
      { key: "tags", label: "Tags", description: "Useful retrieval tags.", example: "coastal\nsmuggling\nfog" },
    ],
  },
  {
    entityType: "faction",
    label: "Faction",
    matchHint: "Match by faction name.",
    fields: [
      { key: "name", label: "Name", description: "Faction name.", example: "The Shrine Guard" },
      { key: "summary", label: "Summary", description: "What the faction is.", example: "Militant custodians of the old ward routes." },
      { key: "agenda", label: "Agenda", description: "What the faction wants.", example: "Keep the relic routes out of state control." },
      { key: "resources", label: "Resources", description: "What leverage or assets the faction has.", example: "Smuggler contacts, shrine keys, burial crews" },
      { key: "notes", label: "Notes", description: "Extra canon notes about the faction.", example: "They recruit from widows and war orphans first." },
      { key: "tags", label: "Tags", description: "Useful retrieval tags.", example: "religious\nmilitia\nshrine" },
    ],
  },
  {
    entityType: "workingNote",
    label: "Book rule",
    matchHint: "Match by rule name/title.",
    fields: [
      { key: "title", label: "Rule name", description: "Short name for the rule, system, or institutional logic.", example: "Saltbinding requires a witness" },
      { key: "content", label: "Rule / internal logic", description: "Explain how the rule works off-page so the AI can obey it in canon.", example: "Magic can only bind a bargain if both parties speak the same closing phrase in full." },
      { key: "tags", label: "Tags", description: "Helpful retrieval tags for the rule.", example: "magic\nritual\nlaw" },
      { key: "status", label: "Status", description: "Whether this rule is active canon.", example: "ACTIVE" },
    ],
  },
  {
    entityType: "timelineEvent",
    label: "Timeline event",
    matchHint: "Match by event label.",
    fields: [
      { key: "label", label: "Label", description: "Short event label.", example: "Siege breaches the north gate" },
      { key: "description", label: "Description", description: "What happened and why it matters.", example: "The city loses its last stable supply corridor." },
      { key: "orderIndex", label: "Order", description: "Sequence order in the timeline.", example: "5" },
      { key: "occursAtChapter", label: "Occurs at chapter", description: "Chapter number where this event lands, if known.", example: "9" },
    ],
  },
];

export function buildAssistantRoutingGuide() {
  return [
    "Routing guide:",
    "- Use UPDATE_CHAPTER_FIELD or APPEND_CHAPTER_FIELD for chapter title, purpose, current beat, scene list, outline, manuscript, or chapter notes.",
    "- Use UPDATE_BOOK_SETUP when the request changes global book setup such as genre, audience, POV, tense, target lengths, story brief, plot direction, pacing notes, prose style, themes, comparable titles, series data, or author name.",
    "- Use UPDATE_STYLE_PROFILE when the request changes style sliders or written style rules such as prose density, pacing, darkness, dialogue ratio, commercial balance, aesthetic guide, style guide, or voice rules.",
    "- Use UPSERT_STORY_BIBLE_ENTITY when the request belongs in Characters, Relationships, Plot Threads, Locations, Factions, Timeline, or Book Rules.",
    "- Use CREATE_STRUCTURE_BEAT and CREATE_SCENE_CARD only for actual structure beats or scene cards.",
    "- Do not dump planning requests into notes if a real field exists for them.",
    "- When the user asks to plan all chapters, create one chapter-field action per chapter that needs a title, purpose, beat, outline, or scene list update.",
  ].join("\n");
}

export function buildAssistantSiteMap(project: ProjectWorkspace) {
  return JSON.stringify(
    {
      writableAreas: [
        {
          scope: "BOOK_SETUP",
          label: "Book Setup",
          fields: BOOK_SETUP_FIELD_SPECS,
        },
        {
          scope: "STYLE_PROFILE",
          label: "Style & export settings",
          fields: STYLE_PROFILE_FIELD_SPECS,
        },
        {
          scope: "STORY_SKELETON",
          label: "Story Skeleton chapter planner",
          fields: CHAPTER_FIELD_SPECS.filter((field) => field.key !== "draft" && field.key !== "notes"),
        },
        {
          scope: "CHAPTERS",
          label: "Chapter workspace",
          fields: CHAPTER_FIELD_SPECS,
        },
        {
          scope: "STORY_BIBLE",
          label: "Story Bible",
          entities: STORY_BIBLE_ENTITY_SPECS,
        },
      ],
      currentProjectState: {
        title: project.title,
        currentBookSetup: {
          authorName: project.bookSettings.authorName,
          genre: project.bookSettings.genre,
          tone: project.bookSettings.tone,
          audience: project.bookSettings.audience,
          pointOfView: project.bookSettings.pointOfView,
          tense: project.bookSettings.tense,
          storyBrief: project.bookSettings.storyBrief,
          plotDirection: project.bookSettings.plotDirection,
          targetChapterLength: project.bookSettings.targetChapterLength,
          targetBookLength: project.bookSettings.targetBookLength,
          themes: project.bookSettings.themes,
        },
        currentStyleProfile: {
          guidanceIntensity: project.styleProfile.guidanceIntensity,
          proseDensity: project.styleProfile.proseDensity,
          pacing: project.styleProfile.pacing,
          darkness: project.styleProfile.darkness,
          dialogueDescriptionRatio: project.styleProfile.dialogueDescriptionRatio,
          literaryCommercialBalance: project.styleProfile.literaryCommercialBalance,
          aestheticGuide: project.styleProfile.aestheticGuide,
          styleGuide: project.styleProfile.styleGuide,
          voiceRules: project.styleProfile.voiceRules,
        },
        chapters: project.chapters.map((chapter) => ({
          id: chapter.id,
          number: chapter.number,
          title: chapter.title,
          purpose: chapter.purpose,
          currentBeat: chapter.currentBeat,
          targetWordCount: chapter.targetWordCount,
          desiredMood: chapter.desiredMood,
        })),
        storyBibleEntities: {
          characters: project.characters.map((character) => ({
            id: character.id,
            name: character.name,
            role: character.role,
          })),
          relationships: project.relationships.map((relationship) => ({
            id: relationship.id,
            sourceCharacterName: relationship.sourceCharacterName,
            targetCharacterName: relationship.targetCharacterName,
            kind: relationship.kind,
          })),
          plotThreads: project.plotThreads.map((thread) => ({
            id: thread.id,
            title: thread.title,
          })),
          locations: project.locations.map((location) => ({
            id: location.id,
            name: location.name,
          })),
          factions: project.factions.map((faction) => ({
            id: faction.id,
            name: faction.name,
          })),
          timelineEvents: project.timelineEvents.map((event) => ({
            id: event.id,
            label: event.label,
          })),
          bookRules: project.workingNotes
            .filter((note) => note.tags.some((tag) => String(tag).trim().toLowerCase() === "book-rule"))
            .map((note) => ({
              id: note.id,
              title: note.title,
            })),
        },
      },
    },
    null,
    2,
  );
}
