export type StoryForgeTab =
  | "ideaLab"
  | "setup"
  | "skeleton"
  | "bible"
  | "chapters"
  | "memory"
  | "continuity"
  | "settings"
  | "about"
  | "help";

export type GuidanceIntensity = "LIGHT" | "STRONG" | "AGGRESSIVE";
export type AssistMode = "FREE_WRITE" | "CO_WRITE" | "FULL_AUTHOR" | "COACH";
export type ProjectChatScope = "AUTO" | "PROJECT" | "IDEA_LAB" | "SKELETON" | "CHAPTER" | "STORY_BIBLE";
export type AiAutopilotMode = "CURRENT_CHAPTER" | "BOOK";
export type AiAutopilotStatus = "IDLE" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED";
export type AiRole =
  | "GHOSTWRITER"
  | "COWRITER"
  | "STORY_DOCTOR"
  | "DEVELOPMENTAL_EDITOR"
  | "OUTLINE_ARCHITECT"
  | "BRAINSTORM_PARTNER"
  | "WRITING_COACH"
  | "BETA_READER";
export type AssistActionType =
  | "CONTINUE"
  | "EXPAND"
  | "TIGHTEN"
  | "REPHRASE"
  | "IMPROVE_PROSE"
  | "SHARPEN_VOICE"
  | "ADD_TENSION"
  | "ADD_DIALOGUE"
  | "DESCRIPTION_TO_DIALOGUE"
  | "CUSTOM_EDIT"
  | "NEXT_BEATS"
  | "COACH"
  | "OUTLINE"
  | "DRAFT"
  | "REVISE";
export type AssistFieldKey =
  | "title"
  | "purpose"
  | "currentBeat"
  | "keyBeats"
  | "requiredInclusions"
  | "forbiddenElements"
  | "desiredMood"
  | "sceneList"
  | "outline"
  | "draft"
  | "notes";

export type MemoryTier = "longTerm" | "shortTerm";
export type ProviderKind = "MOCK" | "OPENAI" | "OPENROUTER" | "CUSTOM";
export type NoteStatus = "ACTIVE" | "ARCHIVED";
export type IdeaEntryType =
  | "WHAT_IF"
  | "CONCEPT"
  | "CHARACTER_SEED"
  | "WORLD_SEED"
  | "PLOT_VARIANT"
  | "TITLE"
  | "PITCH";
export type WorkingNoteType = "SANDBOX" | "IDEA" | "ALT_PLOT" | "UNUSED_SCENE" | "QUESTION" | "RESEARCH";
export type StructureBeatType =
  | "OPENING_DISTURBANCE"
  | "FIRST_DOORWAY"
  | "MIDPOINT"
  | "SECOND_DOORWAY"
  | "CLIMAX"
  | "RESOLUTION";
export type StructureBeatStatus = "PLANNED" | "LOCKED" | "ACHIEVED";
export type SceneOutcomeType =
  | "SETBACK"
  | "PROGRESS"
  | "REVELATION"
  | "COMPLICATION"
  | "DECISION"
  | "CLIFFHANGER";
export type ContinuityCheckMode =
  | "QUICK"
  | "CHAPTER"
  | "ARC"
  | "FULL_BOOK"
  | "PRE_GENERATION"
  | "POST_GENERATION";

export interface BookSettingsRecord {
  authorName: string;
  seriesName: string;
  seriesOrder: number | null;
  genre: string;
  tone: string;
  audience: string;
  themes: string[];
  pointOfView: string;
  tense: string;
  targetChapterLength: number;
  targetBookLength: number;
  storyBrief: string;
  plotDirection: string;
  pacingNotes: string;
  romanceLevel: number;
  darknessLevel: number;
  proseStyle: string;
  comparableTitles: string[];
}

export interface StyleProfileRecord {
  guidanceIntensity: GuidanceIntensity;
  proseDensity: number;
  pacing: number;
  darkness: number;
  romanceIntensity: number;
  humorLevel: number;
  actionFrequency: number;
  mysteryDensity: number;
  dialogueDescriptionRatio: number;
  literaryCommercialBalance: number;
  aestheticGuide: string;
  styleGuide: string;
  voiceRules: string[];
}

export interface GenerationPresetRecord {
  id: string;
  name: string;
  description: string;
  genre: string;
  proseDensity: number;
  pacing: number;
  darkness: number;
  romanceIntensity: number;
  humorLevel: number;
  actionFrequency: number;
  mysteryDensity: number;
  dialogueDescriptionRatio: number;
  literaryCommercialBalance: number;
  guidanceIntensity: GuidanceIntensity;
  isBuiltIn: boolean;
}

export interface CharacterQuickProfileRecord {
  age: string;
  profession: string;
  placeOfLiving: string;
  accent: string;
  speechPattern: string;
}

export interface CharacterBasicIdentityRecord {
  fullName: string;
  nicknames: string[];
  age: string;
  dateOfBirth: string;
  gender: string;
  culturalBackground: string;
  nationality: string;
  currentResidence: string;
  placeOfOrigin: string;
  beliefSystem: string;
  maritalStatus: string;
  familyStatus: string;
}

export interface CharacterLifePositionRecord {
  profession: string;
  workplace: string;
  roleTitle: string;
  socialClass: string;
  educationLevel: string;
  trainingBackground: string;
  militaryBackground: string;
  criminalRecord: string;
  politicalOrientation: string;
  reputation: string;
}

export interface CharacterPersonalityRecord {
  coreTraits: string[];
  virtues: string[];
  flaws: string[];
  emotionalTendencies: string;
  socialConfidence: string;
  introExtroStyle: string;
  conflictStyle: string;
  decisionMaking: string;
  projectedImage: string;
  trueNature: string;
  hiddenSelf: string;
  embarrassmentTriggers: string;
  angerTriggers: string;
  comfortSources: string;
  fearTriggers: string;
  coreValues: string;
}

export interface CharacterMotivationRecord {
  shortTermGoal: string;
  longTermGoal: string;
  needVsWant: string;
  internalConflict: string;
  externalConflict: string;
  wound: string;
  secrets: string[];
  stakesIfFail: string;
  arcDirection: string;
  storyRole: string;
  relationshipToMainConflict: string;
}

export interface CharacterSpeechRecord {
  accent: string;
  dialect: string;
  nativeLanguage: string;
  otherLanguages: string[];
  fluencyLevels: string;
  formalityLevel: string;
  vocabularyLevel: string;
  educationInSpeech: string;
  sentenceLength: string;
  directness: string;
  pointStyle: string;
  descriptors: string[];
  repeatedPhrases: string[];
  favoriteExpressions: string[];
  swearingLevel: string;
  rhythm: string;
  emotionalShifts: string;
  angrySpeech: string;
  scaredSpeech: string;
  lyingSpeech: string;
  persuasiveSpeech: string;
  superiorSpeech: string;
  inferiorSpeech: string;
  lovedOnesSpeech: string;
  avoidedTopics: string;
  commonMisunderstandings: string;
}

export interface CharacterBodyRecord {
  physicalDescription: string;
  build: string;
  clothingStyle: string;
  grooming: string;
  distinguishingFeatures: string[];
  posture: string;
  movementStyle: string;
  eyeContact: string;
  habitsTics: string[];
  roomEntry: string;
  presenceFeel: string;
}

export interface CharacterRelationshipDynamicsRecord {
  friends: string[];
  enemies: string[];
  rivals: string[];
  loversExes: string[];
  family: string[];
  mentors: string[];
  subordinatesSuperiors: string[];
  trustLevels: string;
  hiddenLoyalties: string;
  unspokenTensions: string;
  powerDynamics: string;
}

export interface CharacterDossierRecord {
  basicIdentity: CharacterBasicIdentityRecord;
  lifePosition: CharacterLifePositionRecord;
  personalityBehavior: CharacterPersonalityRecord;
  motivationStory: CharacterMotivationRecord;
  speechLanguage: CharacterSpeechRecord;
  bodyPresence: CharacterBodyRecord;
  relationshipDynamics: CharacterRelationshipDynamicsRecord;
  freeTextCore: string;
}

export interface CharacterStateRecord {
  currentKnowledge: string;
  unknowns: string;
  emotionalState: string;
  physicalCondition: string;
  loyalties: string;
  recentChanges: string;
  continuityRisks: string;
  lastMeaningfulAppearance: string;
  lastMeaningfulAppearanceChapter: number | null;
}

export interface CharacterCustomFieldRecord {
  id: string;
  label: string;
  value: string;
  pinned: boolean;
}

export interface CharacterRecord {
  id: string;
  name: string;
  role: string;
  archetype: string;
  summary: string;
  goal: string;
  fear: string;
  secret: string;
  wound: string;
  quirks: string[];
  notes: string;
  tags: string[];
  povEligible: boolean;
  quickProfile: CharacterQuickProfileRecord;
  dossier: CharacterDossierRecord;
  currentState: CharacterStateRecord;
  customFields: CharacterCustomFieldRecord[];
  pinnedFields: string[];
}

export interface RelationshipRecord {
  id: string;
  sourceCharacterId: string;
  sourceCharacterName: string;
  targetCharacterId: string;
  targetCharacterName: string;
  kind: string;
  description: string;
  tension: string;
  status: string;
}

export interface LocationRecord {
  id: string;
  name: string;
  summary: string;
  atmosphere: string;
  rules: string;
  notes: string;
  tags: string[];
}

export interface FactionRecord {
  id: string;
  name: string;
  summary: string;
  agenda: string;
  resources: string;
  notes: string;
  tags: string[];
}

export interface TimelineEventRecord {
  id: string;
  label: string;
  description: string;
  orderIndex: number;
  occursAtChapter: number | null;
}

export interface PlotThreadRecord {
  id: string;
  title: string;
  summary: string;
  status: string;
  heat: number;
  promisedPayoff: string;
  lastTouchedChapter: number | null;
  progressMarkers: Array<{
    chapterNumber: number;
    label: string;
    strength: "INTRODUCED" | "DEVELOPED" | "ESCALATED" | "STALLED" | "RESOLVED";
    notes: string;
  }>;
}

export interface IdeaEntryRecord {
  id: string;
  title: string;
  content: string;
  type: IdeaEntryType;
  status: NoteStatus;
  source: string;
  tags: string[];
  isFavorite: boolean;
}

export interface WorkingNoteRecord {
  id: string;
  linkedChapterId: string | null;
  title: string;
  content: string;
  type: WorkingNoteType;
  status: NoteStatus;
  tags: string[];
}

export interface StructureBeatRecord {
  id: string;
  chapterId: string | null;
  type: StructureBeatType;
  label: string;
  description: string;
  notes: string;
  status: StructureBeatStatus;
  orderIndex: number;
}

export interface SceneCardRecord {
  id: string;
  chapterId: string | null;
  povCharacterId: string | null;
  title: string;
  summary: string;
  goal: string;
  conflict: string;
  outcome: string;
  outcomeType: SceneOutcomeType | null;
  locationHint: string;
  orderIndex: number;
  frozen: boolean;
}

export interface ChapterSummaryRecord {
  id: string;
  kind: string;
  summary: string;
  bridgeText: string;
  emotionalTone: string;
  unresolvedQuestions: string[];
}

export interface ChapterRecord {
  id: string;
  number: number;
  title: string;
  purpose: string;
  povCharacterId: string | null;
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
  status: string;
  wordCount: number;
  summaries: ChapterSummaryRecord[];
}

export interface MemoryItemRecord {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  relevanceScore: number;
  durabilityScore: number;
  status: string;
  promotionReason: string;
  relatedChapterId: string | null;
  relatedCharacterIds: string[];
  relatedLocationIds: string[];
  relatedPlotThreadIds: string[];
}

export interface ContinuityIssueRecord {
  id: string;
  chapterId: string | null;
  severity: "LOW" | "MEDIUM" | "HIGH";
  confidence: number;
  checkMode: ContinuityCheckMode;
  issueType: string;
  title: string;
  description: string;
  explanation: string;
  suggestedContext: string;
  relatedEntity: string;
  affectedElements: string[];
  status: string;
}

export interface AiAssistRunRecord {
  id: string;
  chapterId: string;
  mode: AssistMode;
  role: AiRole;
  actionType: AssistActionType;
  selectionText: string;
  instruction: string;
  contextNote: string;
  suggestion: string;
  status: "PREVIEW" | "APPLIED" | "DISCARDED";
}

export interface ContextPackage {
  projectBrief: string;
  chapterGoal: string;
  previousChapterSummary: string;
  chapterBlueprint: string[];
  seriesContext: string[];
  storyBibleContext: string[];
  dialogueVoiceContext: string[];
  storySkeletonContext: string[];
  relevantLongTermMemory: MemoryItemRecord[];
  recentShortTermMemory: MemoryItemRecord[];
  activePlotThreads: PlotThreadRecord[];
  stylisticInstructions: string[];
  continuityConstraints: ContinuityIssueRecord[];
  localExcerpt?: string;
  tokenEstimate: number;
}

export interface SeriesBookRecord {
  projectId: string;
  title: string;
  slug: string;
  premise: string;
  oneLineHook: string;
  seriesOrder: number | null;
  chapterCount: number;
}

export interface SeriesRecord {
  id: string;
  name: string;
  slug: string;
  description: string;
  books: SeriesBookRecord[];
  sharedCharacterNames: string[];
  sharedLocationNames: string[];
  sharedPlotThreadTitles: string[];
}

export interface ProjectWorkspace {
  id: string;
  title: string;
  slug: string;
  premise: string;
  oneLineHook: string;
  availableSeriesNames: string[];
  series: SeriesRecord | null;
  seriesCanonicalAnchors: string[];
  bookSettings: BookSettingsRecord;
  styleProfile: StyleProfileRecord;
  generationPresets: GenerationPresetRecord[];
  characters: CharacterRecord[];
  relationships: RelationshipRecord[];
  locations: LocationRecord[];
  factions: FactionRecord[];
  timelineEvents: TimelineEventRecord[];
  plotThreads: PlotThreadRecord[];
  ideaEntries: IdeaEntryRecord[];
  workingNotes: WorkingNoteRecord[];
  structureBeats: StructureBeatRecord[];
  sceneCards: SceneCardRecord[];
  chapters: ChapterRecord[];
  longTermMemoryItems: MemoryItemRecord[];
  shortTermMemoryItems: MemoryItemRecord[];
  continuityIssues: ContinuityIssueRecord[];
  assistRuns: AiAssistRunRecord[];
}

export interface AssistSuggestion {
  run: AiAssistRunRecord;
  contextPackage: ContextPackage;
}

export interface CharacterInterpretationSuggestion {
  key: string;
  label: string;
  value: string;
  reason: string;
}

export interface StorySyncSuggestionRecord {
  id: string;
  entityType: "character" | "plotThread" | "chapterSummary";
  targetId: string;
  targetLabel: string;
  fieldPath: string;
  currentValue: string;
  proposedValue: string;
  reason: string;
}

export interface ProjectChatActionRecord {
  id: string;
  kind:
    | "CREATE_IDEA_ENTRY"
    | "CREATE_WORKING_NOTE"
    | "CREATE_STRUCTURE_BEAT"
    | "CREATE_SCENE_CARD"
    | "APPEND_CHAPTER_NOTES"
    | "APPEND_CHAPTER_DRAFT"
    | "UPDATE_CHAPTER_FIELD"
    | "APPEND_CHAPTER_FIELD"
    | "UPDATE_CHAPTER_PURPOSE"
    | "UPDATE_PLOT_DIRECTION"
    | "UPDATE_STORY_BRIEF";
  targetLabel: string;
  summary: string;
  status: "APPLIED" | "SKIPPED";
}

export interface ProjectChatTurnRecord {
  id: string;
  role: "user" | "assistant";
  text: string;
  scope: ProjectChatScope;
  createdAt: string;
  actions?: ProjectChatActionRecord[];
}

export interface PitchPackage {
  logline: string;
  elevatorPitch: string[];
}

export interface CraftSignal {
  id: string;
  area: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  confidence: number;
  title: string;
  explanation: string;
  suggestion: string;
  affectedElements: string[];
}

export interface CraftPillarScore {
  id: "plot" | "characters" | "structure" | "scenes" | "dialogue" | "styleVoice" | "theme";
  label: string;
  score: number;
  summary: string;
}

export interface LockAssessment {
  lead: string;
  objective: string;
  confrontation: string;
  knockoutEnding: string;
  warnings: CraftSignal[];
}

export interface StakesAssessment {
  physical: number;
  professional: number;
  psychological: number;
  warnings: CraftSignal[];
}

export interface StructureAssessment {
  beatProgress: Array<{
    type: StructureBeatType;
    label: string;
    present: boolean;
    summary: string;
  }>;
  warnings: CraftSignal[];
}

export interface SceneAssessment {
  totalScenes: number;
  completeScenes: number;
  fillerSceneIds: string[];
  warnings: CraftSignal[];
}

export interface CharacterBondAssessment {
  empathy: number;
  sympathy: number;
  vulnerability: number;
  innerConflict: number;
  warnings: CraftSignal[];
}

export interface PageTurnerAssessment {
  tension: number;
  pacing: number;
  unresolvedQuestions: number;
  chapterEndings: number;
  warnings: CraftSignal[];
}

export interface CraftReport {
  pillars: CraftPillarScore[];
  lock: LockAssessment;
  stakes: StakesAssessment;
  structure: StructureAssessment;
  scenes: SceneAssessment;
  characterBond: CharacterBondAssessment;
  pageTurner: PageTurnerAssessment;
  pitch: PitchPackage;
  warnings: CraftSignal[];
  sourceFramework: string[];
}

export interface ProviderSettingsRecord {
  activeProvider: ProviderKind;
  useMockFallback: boolean;
  requiresPersonalKey: boolean;
  providerReady: boolean;
  setupMessage: string;
  openRouterSetupUrl: string;
  openai: {
    configured: boolean;
    maskedKey: string;
    model: string;
  };
  openrouter: {
    configured: boolean;
    maskedKey: string;
    model: string;
    baseUrl: string;
    siteUrl: string;
    appName: string;
  };
  custom: {
    configured: boolean;
    maskedKey: string;
    label: string;
    baseUrl: string;
    model: string;
  };
}

export interface PublishingSettingsRecord {
  authorName: string;
  copyrightHolder: string;
  copyrightYear: number;
  rightsStatement: string;
  storyforgeCredit: boolean;
}

export interface OpenRouterModelRecord {
  id: string;
  name: string;
  description: string;
  contextLength: number;
  promptPricePerMillion: number;
  completionPricePerMillion: number;
  inputModalities: string[];
  outputModalities: string[];
  supportedParameters: string[];
  isFree: boolean;
  fictionRecommended: boolean;
  fictionReason: string;
  expensive: boolean;
}

export interface AutopilotRunRecord {
  id: string;
  projectId: string;
  mode: AiAutopilotMode;
  status: AiAutopilotStatus;
  generalPrompt: string;
  chapterIds: string[];
  nextChapterIndex: number;
  processedChapterIds: string[];
  activeChapterId: string | null;
  lastMessage: string;
  lastError: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryExtractionCandidate {
  title: string;
  content: string;
  category: string;
  tags: string[];
  relatedCharacterIds?: string[];
  relatedLocationIds?: string[];
  relatedPlotThreadIds?: string[];
  classification:
    | "long-term durable fact"
    | "short-term temporary fact"
    | "discard/noise"
    | "contradiction warning"
    | "possible foreshadowing"
    | "unresolved thread";
  relevanceScore: number;
  durabilityScore: number;
  promotionReason: string;
}

export interface MemoryExtractionResult {
  summary: string;
  emotionalTone: string;
  candidates: MemoryExtractionCandidate[];
}

export interface ContinuityReport {
  issues: ContinuityIssueRecord[];
  suggestedContext: string[];
  verdict: string;
}

export type BestsellerGuideScope = "CHAPTER" | "BOOK";

export interface BestsellerGuideRecommendation {
  id: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  title: string;
  explanation: string;
  whatToAdd: string;
  whyItMatters: string;
  fixInstruction: string;
  targetChapterNumber: number | null;
  targetChapterTitle: string;
  targetChapterId: string | null;
}

export interface BestsellerGuideReport {
  scope: BestsellerGuideScope;
  analyzedChapterId: string | null;
  analyzedChapterTitle: string;
  alignmentScore: number;
  verdict: string;
  guideSummary: string;
  strengths: string[];
  recommendations: BestsellerGuideRecommendation[];
  sourceFramework: string[];
}

export interface ExportDocument {
  title: string;
  authorName: string;
  copyrightNotice: string;
  backCoverSummary: string;
  chapters: {
    number: number;
    title: string;
    content: string;
  }[];
}

export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}
