import {
  AssistActionType,
  AssistMode,
  AiRole,
  ChapterStatus,
  ContinuityCheckMode,
  ContinuityIssueStatus,
  ContinuitySeverity,
  GuidanceIntensity,
  IdeaEntryType,
  MemoryCategory,
  MemorySourceType,
  MemoryStatus,
  NoteStatus,
  PlotThreadStatus,
  PrismaClient,
  ProjectStatus,
  RelationshipKind,
  SceneOutcomeType,
  StructureBeatStatus,
  StructureBeatType,
  SummaryKind,
  WorkingNoteType,
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.aiAssistRun.deleteMany();
  await prisma.continuityIssue.deleteMany();
  await prisma.shortTermMemoryCharacter.deleteMany();
  await prisma.shortTermMemoryLocation.deleteMany();
  await prisma.shortTermMemoryPlotThread.deleteMany();
  await prisma.longTermMemoryCharacter.deleteMany();
  await prisma.longTermMemoryLocation.deleteMany();
  await prisma.longTermMemoryPlotThread.deleteMany();
  await prisma.shortTermMemoryItem.deleteMany();
  await prisma.longTermMemoryItem.deleteMany();
  await prisma.chapterSummary.deleteMany();
  await prisma.sceneCard.deleteMany();
  await prisma.structureBeat.deleteMany();
  await prisma.workingNote.deleteMany();
  await prisma.ideaEntry.deleteMany();
  await prisma.chapter.deleteMany();
  await prisma.relationship.deleteMany();
  await prisma.character.deleteMany();
  await prisma.location.deleteMany();
  await prisma.faction.deleteMany();
  await prisma.timelineEvent.deleteMany();
  await prisma.plotThread.deleteMany();
  await prisma.generationPreset.deleteMany();
  await prisma.styleProfile.deleteMany();
  await prisma.bookSettings.deleteMany();
  await prisma.project.deleteMany();

  const project = await prisma.project.create({
    data: {
      title: "The Glass Meridian",
      slug: "the-glass-meridian",
      premise:
        "A city-sized observatory predicts disasters one day too late, and a mapmaker discovers the machine is editing history to protect its own blind spot.",
      oneLineHook:
        "A cartographer races a self-censoring oracle before the next erasure becomes permanent.",
      status: ProjectStatus.ACTIVE,
      bookSettings: {
        create: {
          genre: "Sci-fi mystery",
          tone: "Luminous, tense, intimate",
          audience: "Adult crossover",
          themes: ["memory", "power", "chosen ignorance", "mercy vs truth"],
          pointOfView: "Alternating limited POV",
          tense: "Past tense",
          targetChapterLength: 2600,
          targetBookLength: 98000,
          storyBrief:
            "Sil Sarin, a civic mapmaker, discovers that districts missing from official charts only disappear after the observatory predicts them too late. She and exile archivist Orin Vale trace the gap to a buried chamber beneath the signal lenses.",
          plotDirection:
            "Escalate from local disappearances into a city-wide coverup, force Sil to choose between saving her brother and revealing the observatory's lie, and land on a costly truth that changes how prophecy works.",
          pacingNotes:
            "Fast chapter hooks, emotional pauses after revelations, frequent collision between romance tension and political danger.",
          romanceLevel: 2,
          darknessLevel: 3,
          proseStyle: "Elegant but commercially readable, sensory, image-rich",
          comparableTitles: ["Annihilation", "The City & the City", "Ninth House"],
        },
      },
      styleProfile: {
        create: {
          guidanceIntensity: GuidanceIntensity.STRONG,
          proseDensity: 4,
          pacing: 4,
          darkness: 3,
          romanceIntensity: 2,
          humorLevel: 1,
          actionFrequency: 3,
          mysteryDensity: 5,
          dialogueDescriptionRatio: 5,
          literaryCommercialBalance: 6,
          aestheticGuide:
            "Glass, saltlight, old brass, rain on stone, constellations reflected in puddles.",
          styleGuide:
            "Favor precise verbs, emotionally loaded imagery, and chapter endings that pivot from answer to sharper question.",
          voiceRules: [
            "Embed exposition inside desire or argument.",
            "Give each chapter a turn in power or knowledge.",
            "Keep emotional movement visible, even in quiet scenes.",
          ],
        },
      },
      generationPresets: {
        create: [
          {
            name: "Sci-fi mystery",
            description: "Taut investigation with eerie revelations and forward momentum.",
            genre: "Sci-fi mystery",
            proseDensity: 4,
            pacing: 4,
            darkness: 3,
            romanceIntensity: 2,
            humorLevel: 1,
            actionFrequency: 3,
            mysteryDensity: 5,
            dialogueDescriptionRatio: 5,
            literaryCommercialBalance: 6,
            guidanceIntensity: GuidanceIntensity.STRONG,
            isBuiltIn: true,
          },
          {
            name: "Thriller pulse",
            description: "Sharper turns, shorter beats, stronger cliffhangers.",
            genre: "Thriller",
            proseDensity: 3,
            pacing: 5,
            darkness: 3,
            romanceIntensity: 1,
            humorLevel: 1,
            actionFrequency: 4,
            mysteryDensity: 4,
            dialogueDescriptionRatio: 6,
            literaryCommercialBalance: 8,
            guidanceIntensity: GuidanceIntensity.AGGRESSIVE,
            isBuiltIn: true,
          },
        ],
      },
    },
  });

  const [sil, orin, tav, lena] = await Promise.all([
    prisma.character.create({
      data: {
        projectId: project.id,
        name: "Sil Sarin",
        role: "Lead cartographer",
        archetype: "Control-seeking truth teller",
        summary:
          "Brilliant civic mapmaker who trusts measured systems until she discovers the maps are being domesticated.",
        goal: "Expose the observatory's blind spot before another district is erased.",
        fear: "Losing her brother to the city's sanctioned forgetting.",
        secret: "She once adjusted a district boundary to protect her family from conscription.",
        wound: "Her mother disappeared into a clerical correction years earlier.",
        quirks: ["Counts stair landings under stress", "Keeps obsolete maps stitched into coat lining"],
        notes: "Primary POV",
        tags: ["analytical", "protective", "obsessive"],
        povEligible: true,
      },
    }),
    prisma.character.create({
      data: {
        projectId: project.id,
        name: "Orin Vale",
        role: "Exiled archivist",
        archetype: "Disgraced witness",
        summary:
          "Former observatory historian who knows the machine edits records and suspects it edits memory too.",
        goal: "Force the city to face the original purpose of the Meridian Engine.",
        fear: "Becoming useful to power again.",
        secret: "He helped design the official forgetting protocols.",
        wound: "Exiled after warning the council about altered star charts.",
        quirks: ["Talks to books when thinking", "Never sits with his back to glass"],
        notes: "Secondary POV, slow-burn romantic tension with Sil",
        tags: ["haunted", "wry", "dangerous"],
        povEligible: true,
      },
    }),
    prisma.character.create({
      data: {
        projectId: project.id,
        name: "Tav Sarin",
        role: "Signal runner",
        archetype: "Loved one at risk",
        summary:
          "Sil's younger brother, charming and impulsive, recruited by the observatory as a courier.",
        goal: "Prove he is not another person to be protected and sidelined.",
        fear: "Being forgotten as collateral damage.",
        secret: "He is smuggling fragments from restricted observatory levels.",
        wound: "He grew up under the shadow of their mother's disappearance.",
        quirks: ["Collects broken lens shards", "Whistles when lying"],
        tags: ["reckless", "affectionate"],
        povEligible: false,
      },
    }),
    prisma.character.create({
      data: {
        projectId: project.id,
        name: "Magister Lena Voss",
        role: "Observatory marshal",
        archetype: "Idealist enforcer",
        summary:
          "Public-facing defender of the Meridian Engine who genuinely believes selective ignorance prevents mass panic.",
        goal: "Contain the map anomalies before the city fractures.",
        fear: "That truth without sequence becomes a weapon.",
        secret: "She knows the engine has begun forecasting her own death incorrectly.",
        wound: "Lost a district to a prediction that arrived too late.",
        quirks: ["Rebuttons cuffs before making threats"],
        tags: ["controlled", "persuasive", "dangerous"],
        povEligible: false,
      },
    }),
  ]);

  await prisma.relationship.createMany({
    data: [
      {
        projectId: project.id,
        sourceCharacterId: sil.id,
        targetCharacterId: orin.id,
        kind: RelationshipKind.ROMANTIC,
        description: "Suspicious alliance with intellectual and romantic friction.",
        tension: "Sil wants proof; Orin wants confession.",
        status: "Unresolved attraction",
      },
      {
        projectId: project.id,
        sourceCharacterId: sil.id,
        targetCharacterId: tav.id,
        kind: RelationshipKind.FAMILY,
        description: "Protective older sister and stubborn younger brother.",
        tension: "Sil's protectiveness makes Tav hide more.",
        status: "Strained but loyal",
      },
      {
        projectId: project.id,
        sourceCharacterId: orin.id,
        targetCharacterId: lena.id,
        kind: RelationshipKind.RIVAL,
        description: "Former colleagues turned public enemies.",
        tension: "Both believe they are preventing catastrophe.",
        status: "Actively hostile",
      },
    ],
  });

  const [spire, underglass, saltQuarter] = await Promise.all([
    prisma.location.create({
      data: {
        projectId: project.id,
        name: "Aurora Spire",
        summary: "The observatory tower whose glass lenses predict civic catastrophe with suspicious omissions.",
        atmosphere: "Sacred, echoing, surveilled",
        rules: "Access is stratified by color-coded sigils and watched by lens-keepers.",
        notes: "Seat of institutional power",
        tags: ["observatory", "power"],
      },
    }),
    prisma.location.create({
      data: {
        projectId: project.id,
        name: "Underglass Archive",
        summary: "A flooded library under the city where outdated maps and censored records survive.",
        atmosphere: "Submerged, intimate, forbidden",
        rules: "Paper must be heated dry before handling; mirrors distort catalog markings.",
        notes: "Safehouse and revelation site",
        tags: ["archive", "secret"],
      },
    }),
    prisma.location.create({
      data: {
        projectId: project.id,
        name: "Salt Quarter",
        summary: "Rain-bright district where erased streets first begin to slip from public maps.",
        atmosphere: "Crowded, mercantile, anxious",
        rules: "Street names change after dusk to confuse debt collectors and patrols.",
        notes: "Early disappearance zone",
        tags: ["district", "volatile"],
      },
    }),
  ]);

  await prisma.faction.createMany({
    data: [
      {
        projectId: project.id,
        name: "Meridian Observatory",
        summary: "Official keepers of the city's predictive machine and historical record.",
        agenda: "Maintain social stability through curated truth.",
        resources: "Access to the engine, censors, marshals, and civic trust.",
        notes: "Not monolithic; internal dissent exists.",
        tags: ["institution", "control"],
      },
      {
        projectId: project.id,
        name: "Glass Divers",
        summary: "Smugglers and salvage crews who move through abandoned water channels below the city.",
        agenda: "Profit first, but some protect erased communities.",
        resources: "Hidden routes, salvage gear, rumor networks.",
        notes: "Potential allies with their own price.",
        tags: ["underworld", "mobility"],
      },
    ],
  });

  await prisma.timelineEvent.createMany({
    data: [
      {
        projectId: project.id,
        label: "The First Late Prediction",
        description: "A market collapse is forecast only after it happens, but the report is buried.",
        orderIndex: 1,
        occursAtChapter: 0,
      },
      {
        projectId: project.id,
        label: "Sil Finds the Split Map",
        description: "Sil discovers two official maps with contradictory district boundaries.",
        orderIndex: 2,
        occursAtChapter: 1,
      },
      {
        projectId: project.id,
        label: "Orin Returns from Exile",
        description: "Orin contacts Sil with proof that missing districts correspond to missing ledger entries.",
        orderIndex: 3,
        occursAtChapter: 2,
      },
    ],
  });

  const [mainThread, romanceThread, tavThread] = await Promise.all([
    prisma.plotThread.create({
      data: {
        projectId: project.id,
        title: "What is the Meridian Engine hiding?",
        summary: "Sil and Orin uncover evidence that the observatory is editing history to preserve public order.",
        status: PlotThreadStatus.ACTIVE,
        heat: 5,
        promisedPayoff: "Reveal the engine's original purpose and the cost of truthful prediction.",
        lastTouchedChapter: 2,
      },
    }),
    prisma.plotThread.create({
      data: {
        projectId: project.id,
        title: "Sil and Orin's volatile trust",
        summary: "Mutual attraction grows through reluctant collaboration and withheld truths.",
        status: PlotThreadStatus.ACTIVE,
        heat: 3,
        promisedPayoff: "A choice between emotional trust and strategic secrecy.",
        lastTouchedChapter: 2,
      },
    }),
    prisma.plotThread.create({
      data: {
        projectId: project.id,
        title: "Tav's smuggled lens fragments",
        summary: "Tav hides observatory contraband that may prove the engine is rewriting star data.",
        status: PlotThreadStatus.ACTIVE,
        heat: 4,
        promisedPayoff: "Lens fragments become the key to proving deliberate tampering.",
        lastTouchedChapter: 1,
      },
    }),
  ]);

  const chapterOne = await prisma.chapter.create({
    data: {
      projectId: project.id,
      number: 1,
      title: "The City With Missing Corners",
      purpose: "Establish the city's late prophecy system and hook Sil with the first undeniable anomaly.",
      povCharacterId: sil.id,
      currentBeat: "Sil realizes the official map disagrees with yesterday's street survey.",
      targetWordCount: 2600,
      keyBeats: [
        "Sil performs routine mapping in the Salt Quarter.",
        "She notices a missing alley that locals still use.",
        "A public prediction arrives after a collapse has already happened.",
        "Sil steals the contradictory map sheet.",
      ],
      requiredInclusions: ["Late prediction", "Map anomaly", "Salt Quarter atmosphere"],
      forbiddenElements: ["Full observatory explanation", "Direct confrontation with Lena"],
      desiredMood: "Wet, uncanny, escalating distrust",
      sceneList: ["Survey route", "Archive desk", "Collapsed market square"],
      outline:
        "Sil maps the Salt Quarter, witnesses a prediction posted too late, then discovers two official maps that cannot both be true.",
      draft:
        "Rain lacquered the Salt Quarter until every lantern doubled itself in the gutter. Sil had already crossed Mourning Lane twice before she understood the problem was not the weather, but the map. According to the sheet in her hand, the alley beside the glassmonger's kiln ended in brick. According to the fishmonger swearing at a delivery cart, it ran three doors farther and bent toward the cistern.\n\nBy the time the observatory bell announced a structural warning for the eastern market roof, the roof had already come down. People stood in the runoff staring up at the copper speaker with the kind of outrage that curdled too fast to become a riot. Sil felt the first true fracture then: not fear of disaster, but fear of sequence. Something that was supposed to arrive before had started arriving after.\n\nAt her desk that night she found a second chart filed beneath the first, its border seal fresh enough to gleam. On this version, the alley existed. On the first, it never had.",
      status: ChapterStatus.COMPLETE,
      notes: "Use this as the tonal benchmark.",
    },
  });

  const chapterTwo = await prisma.chapter.create({
    data: {
      projectId: project.id,
      number: 2,
      title: "An Archivist in Exile",
      purpose: "Bring Orin into the story and reveal that the anomaly is systemic rather than clerical.",
      povCharacterId: orin.id,
      currentBeat: "Orin offers proof but withholds his own guilt.",
      targetWordCount: 2700,
      keyBeats: [
        "Sil tracks the duplicate seal to the Underglass Archive.",
        "Orin reveals erased ledgers.",
        "Tav interrupts with stolen lens fragments.",
        "Someone from the observatory is already watching.",
      ],
      requiredInclusions: ["Underglass Archive", "Orin's authority", "Tav's fragments"],
      forbiddenElements: ["Romantic payoff", "Public exposure"],
      desiredMood: "Secretive, intimate, dangerous",
      sceneList: ["Underglass entry", "Ledger room", "Flooded vault"],
      outline:
        "Sil meets Orin in the Underglass Archive, where he shows her missing civic ledgers and warns that the observatory has started editing memory with its records.",
      draft:
        "Orin waited among shelves that leaned like tired jurors, their lower halves darkened by old floodwater. He did not greet Sil as if she had come for help; he greeted her as if she had finally arrived where the evidence had been waiting.\n\n'You think the map is wrong,' he said, touching the duplicate seal with two fingers. 'It isn't wrong. It's obedient.'\n\nHe laid out ledger pages whose numbering skipped entire neighborhoods without leaving a tear. When Tav burst in with a satchel of stolen lens shards, each piece catching the archive lamps with a cold inner weather, Sil understood the lie was not a single clerical correction. The city was being taught, line by line, what not to remember.",
      status: ChapterStatus.COMPLETE,
      notes: "Ends with an outside watcher crossing the flooded threshold.",
    },
  });

  await prisma.chapterSummary.createMany({
    data: [
      {
        projectId: project.id,
        chapterId: chapterOne.id,
        kind: SummaryKind.CORE,
        summary:
          "Sil discovers that an official prediction arrives after a disaster and uncovers duplicate maps that disagree about a Salt Quarter alley.",
        bridgeText: "Sil carries the stolen sheet toward the only disgraced archivist who ever warned about false charts.",
        emotionalTone: "Uneasy curiosity hardening into suspicion",
        unresolvedQuestions: ["Why are official maps contradicting each other?", "Was the late prediction an accident?"],
      },
      {
        projectId: project.id,
        chapterId: chapterTwo.id,
        kind: SummaryKind.CORE,
        summary:
          "Orin shows Sil erased ledgers in the Underglass Archive, while Tav brings lens fragments suggesting observatory tampering is physical as well as bureaucratic.",
        bridgeText: "Now that Sil has proof of deliberate edits, she must decide whether to trust Orin enough to act before Lena closes in.",
        emotionalTone: "Electric mistrust with a thread of attraction",
        unresolvedQuestions: ["What do the lens fragments record?", "How far up the observatory chain does the lie go?"],
      },
    ],
  });

  await prisma.ideaEntry.createMany({
    data: [
      {
        projectId: project.id,
        title: "What if the engine edits memory before it edits the map?",
        content:
          "Variant: the missing districts vanish from people's recollection hours before the civic record is corrected, which would make eyewitness testimony unstable.",
        type: IdeaEntryType.WHAT_IF,
        status: NoteStatus.ACTIVE,
        source: "Seeded demo",
        tags: ["memory", "variant", "mystery"],
        isFavorite: true,
      },
      {
        projectId: project.id,
        title: "Pitch angle",
        content:
          "A polished mystery with the atmosphere of a rain-soaked library and the forward pull of a conspiracy thriller.",
        type: IdeaEntryType.PITCH,
        status: NoteStatus.ACTIVE,
        source: "Seeded demo",
        tags: ["pitch", "market"],
        isFavorite: false,
      },
    ],
  });

  await prisma.workingNote.createMany({
    data: [
      {
        projectId: project.id,
        linkedChapterId: chapterTwo.id,
        title: "Alternate chapter 3 opening",
        content:
          "Start with Tav nearly dropping the lens fragments into a flood channel while Sil argues with Orin about whether proof matters more than sequence.",
        type: WorkingNoteType.UNUSED_SCENE,
        status: NoteStatus.ACTIVE,
        tags: ["chapter-3", "opening", "sandbox"],
      },
      {
        projectId: project.id,
        linkedChapterId: null,
        title: "Research question",
        content: "How much civic ritual can the observatory borrow from cathedral processions without slowing the thriller pulse?",
        type: WorkingNoteType.RESEARCH,
        status: NoteStatus.ACTIVE,
        tags: ["worldbuilding", "tone"],
      },
    ],
  });

  await prisma.structureBeat.createMany({
    data: [
      {
        projectId: project.id,
        chapterId: chapterOne.id,
        type: StructureBeatType.OPENING_DISTURBANCE,
        label: "The city predicts too late",
        description: "A public warning arrives after the damage is already done, exposing the first crack in civic trust.",
        notes: "This is the disturbance that makes the whole premise feel active instead of historical.",
        status: StructureBeatStatus.ACHIEVED,
        orderIndex: 1,
      },
      {
        projectId: project.id,
        chapterId: chapterTwo.id,
        type: StructureBeatType.FIRST_DOORWAY,
        label: "Sil crosses into the Underglass Archive",
        description: "Sil stops treating the anomaly as clerical and steps into deliberate conspiracy territory.",
        notes: "This is the doorway into the larger story.",
        status: StructureBeatStatus.LOCKED,
        orderIndex: 2,
      },
      {
        projectId: project.id,
        chapterId: null,
        type: StructureBeatType.MIDPOINT,
        label: "The engine edits memory, not just records",
        description: "The mystery flips from bureaucratic corruption into a direct assault on identity and witness.",
        notes: "Seeded as a target beat for later chapters.",
        status: StructureBeatStatus.PLANNED,
        orderIndex: 3,
      },
    ],
  });

  await prisma.sceneCard.createMany({
    data: [
      {
        projectId: project.id,
        chapterId: chapterOne.id,
        povCharacterId: sil.id,
        title: "Market collapse warning",
        summary: "Sil witnesses a prediction arrive too late and feels sequence itself go wrong.",
        goal: "Finish the district survey cleanly.",
        conflict: "Reality contradicts the official map and the official warning.",
        outcome: "Sil steals the duplicate chart and commits to investigating.",
        outcomeType: SceneOutcomeType.REVELATION,
        locationHint: "Salt Quarter",
        orderIndex: 1,
        frozen: false,
      },
      {
        projectId: project.id,
        chapterId: chapterTwo.id,
        povCharacterId: orin.id,
        title: "Underglass ledger reveal",
        summary: "Orin shows Sil missing ledgers and forces her to see systemic alteration.",
        goal: "Convince Sil the anomaly is deliberate.",
        conflict: "Sil needs proof, while Orin withholds part of his own guilt.",
        outcome: "Tav's fragments deepen the threat and someone starts watching them.",
        outcomeType: SceneOutcomeType.COMPLICATION,
        locationHint: "Underglass Archive",
        orderIndex: 2,
        frozen: false,
      },
    ],
  });

  const ltTruth = await prisma.longTermMemoryItem.create({
    data: {
      projectId: project.id,
      relatedChapterId: chapterTwo.id,
      title: "The Observatory edits civic records",
      content:
        "Official maps and ledgers are being deliberately altered, not merely misfiled, which means future retrieval must treat observatory records as politically compromised.",
      category: MemoryCategory.WORLD_RULE,
      tags: ["observatory", "records", "truth"],
      relevanceScore: 0.95,
      durabilityScore: 0.98,
      status: MemoryStatus.ACTIVE,
      sourceType: MemorySourceType.EXTRACTED,
      promotionReason: "Central to the entire mystery and future causality.",
      timesReinforced: 2,
      isPinned: true,
    },
  });

  const ltPromise = await prisma.longTermMemoryItem.create({
    data: {
      projectId: project.id,
      relatedChapterId: chapterOne.id,
      title: "Late predictions are a reader promise",
      content:
        "The book promises that the city's predictive system is failing in a meaningful pattern and that the story will explain why predictions now arrive one step too late.",
      category: MemoryCategory.READER_PROMISE,
      tags: ["promise", "hook", "prophecy"],
      relevanceScore: 0.92,
      durabilityScore: 0.9,
      status: MemoryStatus.ACTIVE,
      sourceType: MemorySourceType.SYSTEM,
      promotionReason: "Core book-level mystery contract.",
      isPinned: true,
    },
  });

  await prisma.longTermMemoryCharacter.createMany({
    data: [
      { memoryItemId: ltTruth.id, characterId: sil.id },
      { memoryItemId: ltTruth.id, characterId: orin.id },
      { memoryItemId: ltPromise.id, characterId: sil.id },
    ],
  });

  await prisma.longTermMemoryLocation.createMany({
    data: [
      { memoryItemId: ltTruth.id, locationId: spire.id },
      { memoryItemId: ltPromise.id, locationId: saltQuarter.id },
    ],
  });

  await prisma.longTermMemoryPlotThread.createMany({
    data: [
      { memoryItemId: ltTruth.id, plotThreadId: mainThread.id },
      { memoryItemId: ltPromise.id, plotThreadId: mainThread.id },
    ],
  });

  const stTone = await prisma.shortTermMemoryItem.create({
    data: {
      projectId: project.id,
      relatedChapterId: chapterTwo.id,
      title: "Recent emotional tone",
      content:
        "Intimacy sharpened by distrust; scenes should feel rain-cooled, secretive, and one confession away from danger.",
      category: MemoryCategory.EMOTION,
      tags: ["tone", "mood", "recent"],
      relevanceScore: 0.82,
      durabilityScore: 0.4,
      status: MemoryStatus.CANDIDATE,
      sourceType: MemorySourceType.EXTRACTED,
      promotionReason: "Recent chapter atmosphere only.",
    },
  });

  const stObject = await prisma.shortTermMemoryItem.create({
    data: {
      projectId: project.id,
      relatedChapterId: chapterTwo.id,
      title: "Tav's lens fragments",
      content:
        "Tav currently possesses stolen lens fragments from restricted observatory levels; they matter immediately and may become durable evidence later.",
      category: MemoryCategory.OBJECT,
      tags: ["lens", "evidence", "Tav"],
      relevanceScore: 0.88,
      durabilityScore: 0.66,
      status: MemoryStatus.CANDIDATE,
      sourceType: MemorySourceType.EXTRACTED,
      promotionReason: "Temporary until reinforced.",
      timesReinforced: 1,
    },
  });

  await prisma.shortTermMemoryCharacter.createMany({
    data: [
      { memoryItemId: stTone.id, characterId: sil.id },
      { memoryItemId: stTone.id, characterId: orin.id },
      { memoryItemId: stObject.id, characterId: tav.id },
    ],
  });

  await prisma.shortTermMemoryLocation.create({
    data: { memoryItemId: stTone.id, locationId: underglass.id },
  });

  await prisma.shortTermMemoryPlotThread.createMany({
    data: [
      { memoryItemId: stTone.id, plotThreadId: romanceThread.id },
      { memoryItemId: stObject.id, plotThreadId: tavThread.id },
    ],
  });

  await prisma.continuityIssue.createMany({
    data: [
      {
        projectId: project.id,
        chapterId: chapterTwo.id,
        severity: ContinuitySeverity.MEDIUM,
        confidence: 0.8,
        checkMode: ContinuityCheckMode.CHAPTER,
        issueType: "Dropped object",
        title: "Lens fragments need follow-through",
        description:
          "Tav introduces stolen lens fragments in chapter 2. The next chapter should either examine them, hide them, or explain why they cannot be used yet.",
        explanation:
          "The fragments were introduced as concrete evidence, so failing to mention them next risks breaking short-term causality.",
        suggestedContext: "Mention Tav securing the fragments or Sil insisting on inspecting them.",
        relatedEntity: "Tav's lens fragments",
        affectedElements: ["Tav", "lens fragments", "chapter 3"],
        status: ContinuityIssueStatus.OPEN,
      },
      {
        projectId: project.id,
        chapterId: chapterTwo.id,
        severity: ContinuitySeverity.LOW,
        confidence: 0.68,
        checkMode: ContinuityCheckMode.CHAPTER,
        issueType: "Relationship escalation",
        title: "Track Sil and Orin's trust movement",
        description:
          "The archive scenes increase intimacy; chapter 3 should either deepen, complicate, or recoil from that shift.",
        explanation:
          "Their alliance changed emotionally in chapter 2, so the next chapter should acknowledge the new temperature between them.",
        suggestedContext: "Use a moment of strategic disagreement or near-confession.",
        relatedEntity: "Sil / Orin",
        affectedElements: ["Sil", "Orin", "trust arc"],
        status: ContinuityIssueStatus.OPEN,
      },
    ],
  });

  await prisma.aiAssistRun.create({
    data: {
      projectId: project.id,
      chapterId: chapterTwo.id,
      mode: AssistMode.COACH,
      role: AiRole.WRITING_COACH,
      actionType: AssistActionType.COACH,
      instruction: "How do I start chapter 3 with momentum?",
      contextNote: "Need a bridge from archive revelation into action.",
      suggestion:
        "Open with Sil and Orin leaving the archive under pressure rather than discussing theory in place. Let Tav's fragments create a practical problem: they are attracting attention or destabilizing near light. The chapter's first paragraph should move feet and stakes at the same time.",
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
