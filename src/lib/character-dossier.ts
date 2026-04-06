import type {
  CharacterCustomFieldRecord,
  CharacterDossierRecord,
  CharacterQuickProfileRecord,
  CharacterRecord,
  CharacterStateRecord,
} from "@/types/storyforge";

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstNonEmpty(...values: unknown[]) {
  return values.map(stringValue).find((value) => value.trim().length > 0) ?? "";
}

function inferVoiceHints(character: CharacterRecord) {
  const sourceText = [
    character.role,
    character.summary,
    character.quickProfile.profession,
    character.quickProfile.placeOfLiving,
    character.dossier.basicIdentity.culturalBackground,
    character.dossier.basicIdentity.nationality,
    character.dossier.lifePosition.profession,
    character.dossier.lifePosition.roleTitle,
    character.dossier.lifePosition.socialClass,
    character.dossier.lifePosition.educationLevel,
    character.dossier.lifePosition.trainingBackground,
    character.dossier.lifePosition.militaryBackground,
    character.dossier.lifePosition.reputation,
    character.dossier.personalityBehavior.coreTraits.join(" "),
    character.dossier.personalityBehavior.conflictStyle,
    character.dossier.personalityBehavior.socialConfidence,
    character.dossier.personalityBehavior.emotionalTendencies,
    character.dossier.motivationStory.storyRole,
    character.dossier.freeTextCore,
    character.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hints: string[] = [];

  const eliteKeywords =
    /\b(king|queen|prince|princess|duke|duchess|earl|count|countess|lord|lady|noble|aristocrat|royal|court|minister|ambassador|bishop|abbot|rabbi|cleric|imam|judge|magistrate)\b/;
  const martialKeywords =
    /\b(soldier|sergeant|captain|colonel|commander|general|guard|marine|operator|infantry|cavalry|legion|veteran|officer)\b/;
  const scholarKeywords =
    /\b(scholar|scribe|professor|doctor|physician|surgeon|researcher|archivist|translator|lawyer|advocate|engineer)\b/;
  const streetKeywords =
    /\b(thief|smuggler|dock|street|urchin|beggar|bandit|gang|black market|poacher|mercenary)\b/;
  const ruralKeywords =
    /\b(farmer|shepherd|villager|fisher|woodsman|laborer|miner)\b/;

  if (eliteKeywords.test(sourceText)) {
    hints.push("Social register inference: elite or high-office background; speech should usually sound more controlled, formal, and status-aware than common street speech.");
  }

  if (martialKeywords.test(sourceText)) {
    hints.push("Role inference: trained military or security background; default toward direct, concise, practical speech under pressure.");
  }

  if (scholarKeywords.test(sourceText)) {
    hints.push("Education inference: highly educated or clerical speaker; allow more precise wording, conceptual framing, or careful qualification.");
  }

  if (streetKeywords.test(sourceText)) {
    hints.push("Class inference: rougher social environment; speech can be looser, more reactive, more idiomatic, or more defensive, but should still fit the specific person.");
  }

  if (ruralKeywords.test(sourceText)) {
    hints.push("Background inference: rural or laboring life; keep speech grounded, concrete, and unpretentious unless the dossier says otherwise.");
  }

  if (!firstNonEmpty(character.quickProfile.accent, character.dossier.speechLanguage.accent, character.dossier.speechLanguage.dialect)) {
    hints.push("Accent inference rule: if accent or dialect is unknown, do not invent a random regional accent or phonetic gimmick. Keep the wording natural and distinct through register, rhythm, and directness instead.");
  }

  if (!firstNonEmpty(character.quickProfile.speechPattern, character.dossier.speechLanguage.directness, character.dossier.speechLanguage.pointStyle)) {
    hints.push("Speech-pattern inference rule: infer directness and rhythm from rank, class, profession, education, age, and current emotional pressure.");
  }

  return hints;
}

export function createEmptyCharacterQuickProfile(): CharacterQuickProfileRecord {
  return {
    age: "",
    profession: "",
    placeOfLiving: "",
    accent: "",
    speechPattern: "",
  };
}

export function createEmptyCharacterDossier(fullName = ""): CharacterDossierRecord {
  return {
    basicIdentity: {
      fullName,
      nicknames: [],
      age: "",
      dateOfBirth: "",
      gender: "",
      culturalBackground: "",
      nationality: "",
      currentResidence: "",
      placeOfOrigin: "",
      beliefSystem: "",
      maritalStatus: "",
      familyStatus: "",
    },
    lifePosition: {
      profession: "",
      workplace: "",
      roleTitle: "",
      socialClass: "",
      educationLevel: "",
      trainingBackground: "",
      militaryBackground: "",
      criminalRecord: "",
      politicalOrientation: "",
      reputation: "",
    },
    personalityBehavior: {
      coreTraits: [],
      virtues: [],
      flaws: [],
      emotionalTendencies: "",
      socialConfidence: "",
      introExtroStyle: "",
      conflictStyle: "",
      decisionMaking: "",
      projectedImage: "",
      trueNature: "",
      hiddenSelf: "",
      embarrassmentTriggers: "",
      angerTriggers: "",
      comfortSources: "",
      fearTriggers: "",
      coreValues: "",
    },
    motivationStory: {
      shortTermGoal: "",
      longTermGoal: "",
      needVsWant: "",
      internalConflict: "",
      externalConflict: "",
      wound: "",
      secrets: [],
      stakesIfFail: "",
      arcDirection: "",
      storyRole: "",
      relationshipToMainConflict: "",
    },
    speechLanguage: {
      accent: "",
      dialect: "",
      nativeLanguage: "",
      otherLanguages: [],
      fluencyLevels: "",
      formalityLevel: "",
      vocabularyLevel: "",
      educationInSpeech: "",
      sentenceLength: "",
      directness: "",
      pointStyle: "",
      descriptors: [],
      repeatedPhrases: [],
      favoriteExpressions: [],
      swearingLevel: "",
      rhythm: "",
      emotionalShifts: "",
      angrySpeech: "",
      scaredSpeech: "",
      lyingSpeech: "",
      persuasiveSpeech: "",
      superiorSpeech: "",
      inferiorSpeech: "",
      lovedOnesSpeech: "",
      avoidedTopics: "",
      commonMisunderstandings: "",
    },
    bodyPresence: {
      physicalDescription: "",
      build: "",
      clothingStyle: "",
      grooming: "",
      distinguishingFeatures: [],
      posture: "",
      movementStyle: "",
      eyeContact: "",
      habitsTics: [],
      roomEntry: "",
      presenceFeel: "",
    },
    relationshipDynamics: {
      friends: [],
      enemies: [],
      rivals: [],
      loversExes: [],
      family: [],
      mentors: [],
      subordinatesSuperiors: [],
      trustLevels: "",
      hiddenLoyalties: "",
      unspokenTensions: "",
      powerDynamics: "",
    },
    freeTextCore: "",
  };
}

export function createEmptyCharacterState(): CharacterStateRecord {
  return {
    currentKnowledge: "",
    unknowns: "",
    emotionalState: "",
    physicalCondition: "",
    loyalties: "",
    recentChanges: "",
    continuityRisks: "",
    lastMeaningfulAppearance: "",
    lastMeaningfulAppearanceChapter: null,
  };
}

export function normalizeCharacterQuickProfile(value: unknown): CharacterQuickProfileRecord {
  const source = (value as Record<string, unknown> | null) ?? {};
  return {
    age: stringValue(source.age),
    profession: stringValue(source.profession),
    placeOfLiving: stringValue(source.placeOfLiving),
    accent: stringValue(source.accent),
    speechPattern: stringValue(source.speechPattern),
  };
}

export function normalizeCharacterDossier(value: unknown, fullName = ""): CharacterDossierRecord {
  const source = (value as Record<string, unknown> | null) ?? {};
  const basicIdentity = (source.basicIdentity as Record<string, unknown> | null) ?? {};
  const lifePosition = (source.lifePosition as Record<string, unknown> | null) ?? {};
  const personalityBehavior = (source.personalityBehavior as Record<string, unknown> | null) ?? {};
  const motivationStory = (source.motivationStory as Record<string, unknown> | null) ?? {};
  const speechLanguage = (source.speechLanguage as Record<string, unknown> | null) ?? {};
  const bodyPresence = (source.bodyPresence as Record<string, unknown> | null) ?? {};
  const relationshipDynamics = (source.relationshipDynamics as Record<string, unknown> | null) ?? {};

  return {
    basicIdentity: {
      fullName: stringValue(basicIdentity.fullName) || fullName,
      nicknames: stringArray(basicIdentity.nicknames),
      age: stringValue(basicIdentity.age),
      dateOfBirth: stringValue(basicIdentity.dateOfBirth),
      gender: stringValue(basicIdentity.gender),
      culturalBackground: stringValue(basicIdentity.culturalBackground),
      nationality: stringValue(basicIdentity.nationality),
      currentResidence: stringValue(basicIdentity.currentResidence),
      placeOfOrigin: stringValue(basicIdentity.placeOfOrigin),
      beliefSystem: stringValue(basicIdentity.beliefSystem),
      maritalStatus: stringValue(basicIdentity.maritalStatus),
      familyStatus: stringValue(basicIdentity.familyStatus),
    },
    lifePosition: {
      profession: stringValue(lifePosition.profession),
      workplace: stringValue(lifePosition.workplace),
      roleTitle: stringValue(lifePosition.roleTitle),
      socialClass: stringValue(lifePosition.socialClass),
      educationLevel: stringValue(lifePosition.educationLevel),
      trainingBackground: stringValue(lifePosition.trainingBackground),
      militaryBackground: stringValue(lifePosition.militaryBackground),
      criminalRecord: stringValue(lifePosition.criminalRecord),
      politicalOrientation: stringValue(lifePosition.politicalOrientation),
      reputation: stringValue(lifePosition.reputation),
    },
    personalityBehavior: {
      coreTraits: stringArray(personalityBehavior.coreTraits),
      virtues: stringArray(personalityBehavior.virtues),
      flaws: stringArray(personalityBehavior.flaws),
      emotionalTendencies: stringValue(personalityBehavior.emotionalTendencies),
      socialConfidence: stringValue(personalityBehavior.socialConfidence),
      introExtroStyle: stringValue(personalityBehavior.introExtroStyle),
      conflictStyle: stringValue(personalityBehavior.conflictStyle),
      decisionMaking: stringValue(personalityBehavior.decisionMaking),
      projectedImage: stringValue(personalityBehavior.projectedImage),
      trueNature: stringValue(personalityBehavior.trueNature),
      hiddenSelf: stringValue(personalityBehavior.hiddenSelf),
      embarrassmentTriggers: stringValue(personalityBehavior.embarrassmentTriggers),
      angerTriggers: stringValue(personalityBehavior.angerTriggers),
      comfortSources: stringValue(personalityBehavior.comfortSources),
      fearTriggers: stringValue(personalityBehavior.fearTriggers),
      coreValues: stringValue(personalityBehavior.coreValues),
    },
    motivationStory: {
      shortTermGoal: stringValue(motivationStory.shortTermGoal),
      longTermGoal: stringValue(motivationStory.longTermGoal),
      needVsWant: stringValue(motivationStory.needVsWant),
      internalConflict: stringValue(motivationStory.internalConflict),
      externalConflict: stringValue(motivationStory.externalConflict),
      wound: stringValue(motivationStory.wound),
      secrets: stringArray(motivationStory.secrets),
      stakesIfFail: stringValue(motivationStory.stakesIfFail),
      arcDirection: stringValue(motivationStory.arcDirection),
      storyRole: stringValue(motivationStory.storyRole),
      relationshipToMainConflict: stringValue(motivationStory.relationshipToMainConflict),
    },
    speechLanguage: {
      accent: stringValue(speechLanguage.accent),
      dialect: stringValue(speechLanguage.dialect),
      nativeLanguage: stringValue(speechLanguage.nativeLanguage),
      otherLanguages: stringArray(speechLanguage.otherLanguages),
      fluencyLevels: stringValue(speechLanguage.fluencyLevels),
      formalityLevel: stringValue(speechLanguage.formalityLevel),
      vocabularyLevel: stringValue(speechLanguage.vocabularyLevel),
      educationInSpeech: stringValue(speechLanguage.educationInSpeech),
      sentenceLength: stringValue(speechLanguage.sentenceLength),
      directness: stringValue(speechLanguage.directness),
      pointStyle: stringValue(speechLanguage.pointStyle),
      descriptors: stringArray(speechLanguage.descriptors),
      repeatedPhrases: stringArray(speechLanguage.repeatedPhrases),
      favoriteExpressions: stringArray(speechLanguage.favoriteExpressions),
      swearingLevel: stringValue(speechLanguage.swearingLevel),
      rhythm: stringValue(speechLanguage.rhythm),
      emotionalShifts: stringValue(speechLanguage.emotionalShifts),
      angrySpeech: stringValue(speechLanguage.angrySpeech),
      scaredSpeech: stringValue(speechLanguage.scaredSpeech),
      lyingSpeech: stringValue(speechLanguage.lyingSpeech),
      persuasiveSpeech: stringValue(speechLanguage.persuasiveSpeech),
      superiorSpeech: stringValue(speechLanguage.superiorSpeech),
      inferiorSpeech: stringValue(speechLanguage.inferiorSpeech),
      lovedOnesSpeech: stringValue(speechLanguage.lovedOnesSpeech),
      avoidedTopics: stringValue(speechLanguage.avoidedTopics),
      commonMisunderstandings: stringValue(speechLanguage.commonMisunderstandings),
    },
    bodyPresence: {
      physicalDescription: stringValue(bodyPresence.physicalDescription),
      build: stringValue(bodyPresence.build),
      clothingStyle: stringValue(bodyPresence.clothingStyle),
      grooming: stringValue(bodyPresence.grooming),
      distinguishingFeatures: stringArray(bodyPresence.distinguishingFeatures),
      posture: stringValue(bodyPresence.posture),
      movementStyle: stringValue(bodyPresence.movementStyle),
      eyeContact: stringValue(bodyPresence.eyeContact),
      habitsTics: stringArray(bodyPresence.habitsTics),
      roomEntry: stringValue(bodyPresence.roomEntry),
      presenceFeel: stringValue(bodyPresence.presenceFeel),
    },
    relationshipDynamics: {
      friends: stringArray(relationshipDynamics.friends),
      enemies: stringArray(relationshipDynamics.enemies),
      rivals: stringArray(relationshipDynamics.rivals),
      loversExes: stringArray(relationshipDynamics.loversExes),
      family: stringArray(relationshipDynamics.family),
      mentors: stringArray(relationshipDynamics.mentors),
      subordinatesSuperiors: stringArray(relationshipDynamics.subordinatesSuperiors),
      trustLevels: stringValue(relationshipDynamics.trustLevels),
      hiddenLoyalties: stringValue(relationshipDynamics.hiddenLoyalties),
      unspokenTensions: stringValue(relationshipDynamics.unspokenTensions),
      powerDynamics: stringValue(relationshipDynamics.powerDynamics),
    },
    freeTextCore: stringValue(source.freeTextCore),
  };
}

export function normalizeCharacterState(value: unknown): CharacterStateRecord {
  const source = (value as Record<string, unknown> | null) ?? {};
  return {
    currentKnowledge: stringValue(source.currentKnowledge),
    unknowns: stringValue(source.unknowns),
    emotionalState: stringValue(source.emotionalState),
    physicalCondition: stringValue(source.physicalCondition),
    loyalties: stringValue(source.loyalties),
    recentChanges: stringValue(source.recentChanges),
    continuityRisks: stringValue(source.continuityRisks),
    lastMeaningfulAppearance: stringValue(source.lastMeaningfulAppearance),
    lastMeaningfulAppearanceChapter: numberOrNull(source.lastMeaningfulAppearanceChapter),
  };
}

export function normalizeCharacterCustomFields(value: unknown): CharacterCustomFieldRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((field, index) => {
    const source = (field as Record<string, unknown> | null) ?? {};
    return {
      id: stringValue(source.id) || `custom-${index}`,
      label: stringValue(source.label),
      value: stringValue(source.value),
      pinned: Boolean(source.pinned),
    };
  });
}

export function buildCharacterPromptCard(character: CharacterRecord) {
  const speech = [
    character.quickProfile.accent && `Accent: ${character.quickProfile.accent}`,
    character.quickProfile.speechPattern && `Speech pattern: ${character.quickProfile.speechPattern}`,
    character.dossier.speechLanguage.directness &&
      `Directness: ${character.dossier.speechLanguage.directness}`,
    character.dossier.speechLanguage.descriptors.length
      ? `Descriptors: ${character.dossier.speechLanguage.descriptors.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const state = [
    character.currentState.emotionalState && `Emotion: ${character.currentState.emotionalState}`,
    character.currentState.physicalCondition && `Condition: ${character.currentState.physicalCondition}`,
    character.currentState.loyalties && `Loyalties: ${character.currentState.loyalties}`,
  ]
    .filter(Boolean)
    .join(" | ");

  return [
    `${character.name} - ${character.role || character.dossier.motivationStory.storyRole || "character"}`,
    character.summary,
    speech,
    state,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildCharacterVoicePromptCard(character: CharacterRecord) {
  const speech = character.dossier.speechLanguage;
  const personality = character.dossier.personalityBehavior;
  const motivation = character.dossier.motivationStory;
  const quick = character.quickProfile;
  const state = character.currentState;

  const lines = [
    `${character.name}${character.role ? ` - ${character.role}` : ""}`,
    [
      quick.accent || speech.accent ? `Accent: ${quick.accent || speech.accent}` : "",
      speech.dialect ? `Dialect: ${speech.dialect}` : "",
      quick.speechPattern ? `Quick speech tag: ${quick.speechPattern}` : "",
    ]
      .filter(Boolean)
      .join(" | "),
    [
      speech.formalityLevel ? `Formality: ${speech.formalityLevel}` : "",
      speech.vocabularyLevel ? `Vocabulary: ${speech.vocabularyLevel}` : "",
      speech.educationInSpeech ? `Education in speech: ${speech.educationInSpeech}` : "",
      speech.sentenceLength ? `Sentence length: ${speech.sentenceLength}` : "",
    ]
      .filter(Boolean)
      .join(" | "),
    [
      speech.directness ? `Directness: ${speech.directness}` : "",
      speech.pointStyle ? `Gets to the point: ${speech.pointStyle}` : "",
      speech.rhythm ? `Rhythm: ${speech.rhythm}` : "",
      speech.swearingLevel ? `Swearing: ${speech.swearingLevel}` : "",
    ]
      .filter(Boolean)
      .join(" | "),
    speech.descriptors.length ? `Voice descriptors: ${speech.descriptors.join(", ")}` : "",
    speech.repeatedPhrases.length ? `Verbal habits: ${speech.repeatedPhrases.join(", ")}` : "",
    speech.favoriteExpressions.length ? `Favorite expressions: ${speech.favoriteExpressions.join(", ")}` : "",
    state.emotionalState ? `Current emotional state: ${state.emotionalState}` : "",
    personality.emotionalTendencies ? `Baseline emotional tendency: ${personality.emotionalTendencies}` : "",
    personality.conflictStyle ? `Conflict style: ${personality.conflictStyle}` : "",
    personality.hiddenSelf ? `What they hide: ${personality.hiddenSelf}` : "",
    personality.embarrassmentTriggers ? `Embarrassed by: ${personality.embarrassmentTriggers}` : "",
    personality.angerTriggers ? `Angered by: ${personality.angerTriggers}` : "",
    personality.fearTriggers ? `Fears: ${personality.fearTriggers}` : "",
    motivation.internalConflict ? `Internal conflict: ${motivation.internalConflict}` : "",
    speech.emotionalShifts ? `Emotional speech shifts: ${speech.emotionalShifts}` : "",
    speech.angrySpeech ? `When angry: ${speech.angrySpeech}` : "",
    speech.scaredSpeech ? `When scared: ${speech.scaredSpeech}` : "",
    speech.lyingSpeech ? `When lying: ${speech.lyingSpeech}` : "",
    speech.persuasiveSpeech ? `When persuading: ${speech.persuasiveSpeech}` : "",
    speech.superiorSpeech ? `To superiors: ${speech.superiorSpeech}` : "",
    speech.inferiorSpeech ? `To inferiors: ${speech.inferiorSpeech}` : "",
    speech.lovedOnesSpeech ? `To loved ones: ${speech.lovedOnesSpeech}` : "",
    speech.avoidedTopics ? `Avoids saying directly: ${speech.avoidedTopics}` : "",
    speech.commonMisunderstandings ? `Often misunderstood as: ${speech.commonMisunderstandings}` : "",
    ...inferVoiceHints(character),
  ];

  return lines.filter(Boolean).join("\n");
}
