import type {
  CharacterRecord,
  CraftPillarScore,
  CraftReport,
  CraftSignal,
  ProjectWorkspace,
  StructureBeatType,
} from "@/types/storyforge";
import { APP_NAME } from "@/lib/brand";

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function makeSignal(
  id: string,
  area: string,
  severity: CraftSignal["severity"],
  confidence: number,
  title: string,
  explanation: string,
  suggestion: string,
  affectedElements: string[] = [],
): CraftSignal {
  return {
    id,
    area,
    severity,
    confidence,
    title,
    explanation,
    suggestion,
    affectedElements,
  };
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function countFilled(values: Array<string | null | undefined>) {
  return values.filter((value) => String(value ?? "").trim().length > 0).length;
}

function getLead(project: ProjectWorkspace) {
  return (
    project.characters.find((character) => character.role.toLowerCase().includes("lead")) ??
    project.characters.find((character) => character.povEligible) ??
    project.characters[0] ??
    null
  );
}

function getCharacterBondScore(lead: CharacterRecord | null) {
  if (!lead) {
    return { empathy: 20, sympathy: 20, vulnerability: 20, innerConflict: 20 };
  }

  return {
    empathy: clamp(25 + countFilled([lead.goal, lead.summary]) * 18),
    sympathy: clamp(25 + countFilled([lead.fear, lead.notes]) * 18),
    vulnerability: clamp(20 + countFilled([lead.wound, lead.secret]) * 20),
    innerConflict: clamp(20 + countFilled([lead.goal, lead.fear, lead.secret, lead.wound]) * 15),
  };
}

function buildPitch(project: ProjectWorkspace, lead: CharacterRecord | null) {
  const protagonist = lead?.name || "the protagonist";
  const need = lead?.goal || project.plotThreads[0]?.title || "set things right";
  const obstacle = project.plotThreads[0]?.summary || project.premise;

  return {
    logline: `${protagonist} must ${need.charAt(0).toLowerCase()}${need.slice(1)} before ${obstacle.charAt(0).toLowerCase()}${obstacle.slice(1)}.`,
    elevatorPitch: [
      `${project.title} is a ${project.bookSettings.genre.toLowerCase()} novel about ${protagonist}.`,
      `When ${project.oneLineHook || project.premise.toLowerCase()}, the story drives toward ${project.bookSettings.plotDirection.toLowerCase()}.`,
      `It promises ${project.plotThreads[0]?.promisedPayoff || "a major emotional and plot payoff"} while preserving ${project.bookSettings.tone.toLowerCase()} energy.`,
    ],
  };
}

function buildStructureWarnings(project: ProjectWorkspace) {
  const requiredBeats: StructureBeatType[] = [
    "OPENING_DISTURBANCE",
    "FIRST_DOORWAY",
    "MIDPOINT",
    "SECOND_DOORWAY",
    "CLIMAX",
    "RESOLUTION",
  ];

  const warnings: CraftSignal[] = [];
  const progress = requiredBeats.map((type) => {
    const beat = project.structureBeats.find((entry) => entry.type === type);
    const present = Boolean(beat);

    if (!present) {
      warnings.push(
        makeSignal(
          `missing-${type.toLowerCase()}`,
          "structure",
          type === "MIDPOINT" || type === "CLIMAX" ? "HIGH" : "MEDIUM",
          0.78,
          `${type.replaceAll("_", " ")} is not mapped yet`,
          "The structure engine cannot track this turning point because it is missing from the skeleton.",
      `Add a structure beat so ${APP_NAME} can judge progression and chapter pressure against it.`,
          [type],
        ),
      );
    }

    return {
      type,
      label: beat?.label || type.replaceAll("_", " "),
      present,
      summary: beat?.description || "Not mapped yet.",
    };
  });

  return { progress, warnings };
}

export function buildCraftReport(project: ProjectWorkspace): CraftReport {
  const warnings: CraftSignal[] = [];
  const lead = getLead(project);
  const structure = buildStructureWarnings(project);
  const sceneCompleteness = project.sceneCards.map((scene) =>
    countFilled([scene.goal, scene.conflict, scene.outcome]),
  );
  const fillerSceneIds = project.sceneCards
    .filter((scene) => countFilled([scene.goal, scene.conflict, scene.outcome]) <= 1)
    .map((scene) => scene.id);

  if (!lead) {
    warnings.push(
      makeSignal(
        "missing-lead",
        "lock",
        "HIGH",
        0.9,
        "No clear lead character is marked",
        "The LOCK system needs a visible lead to evaluate objective, conflict, and payoff pressure.",
        "Mark a lead-facing character as POV eligible or give one character a stronger role/goal definition.",
      ),
    );
  }

  if (project.plotThreads.length === 0) {
    warnings.push(
      makeSignal(
        "missing-threads",
        "plot",
        "HIGH",
        0.88,
        "No plot threads are being tracked",
      `Without plot threads, ${APP_NAME} cannot monitor unresolved promises or escalation properly.`,
        "Add at least one main plot thread and one secondary thread.",
      ),
    );
  }

  if (fillerSceneIds.length > 0) {
    warnings.push(
      makeSignal(
        "filler-scenes",
        "scenes",
        fillerSceneIds.length > 2 ? "HIGH" : "MEDIUM",
        0.76,
        "Some scene cards are missing change pressure",
        "Scene cards without a visible goal, conflict, and outcome are more likely to feel static or disconnected.",
        "Give each scene a concrete want, a source of resistance, and a changed condition at the end.",
        fillerSceneIds,
      ),
    );
  }

  const characterBond = getCharacterBondScore(lead);
  const lockWarnings: CraftSignal[] = [];

  if (!lead?.goal) {
    lockWarnings.push(
      makeSignal(
        "lock-goal",
        "lock",
        "HIGH",
        0.82,
        "Lead objective is weak or missing",
        "A passive or undefined objective makes the story feel reactive.",
        "Write the lead's immediate desire in blunt language so chapters can build confrontation around it.",
        lead ? [lead.id] : [],
      ),
    );
  }

  if (!project.plotThreads.some((thread) => thread.heat >= 4)) {
    lockWarnings.push(
      makeSignal(
        "low-confrontation",
        "lock",
        "MEDIUM",
        0.7,
        "Confrontation pressure looks soft",
        "Current plot threads are present, but none are marked as especially hot.",
        "Raise the heat on the main conflict or add a harder source of opposition.",
        project.plotThreads.map((thread) => thread.id),
      ),
    );
  }

  const stakesText = [
    project.premise,
    project.bookSettings.storyBrief,
    project.bookSettings.plotDirection,
    ...project.plotThreads.map((thread) => `${thread.title} ${thread.summary} ${thread.promisedPayoff}`),
  ]
    .join(" ")
    .toLowerCase();

  const stakes = {
    physical: clamp((stakestextMatch(stakesText, ["death", "kill", "disaster", "destroy", "survive"]) / 5) * 100),
    professional: clamp((stakestextMatch(stakesText, ["career", "reputation", "position", "status", "rank", "power"]) / 6) * 100),
    psychological: clamp((stakestextMatch(stakesText, ["memory", "identity", "love", "sanity", "grief", "fear", "shame"]) / 7) * 100),
  };

  const stakesWarnings: CraftSignal[] = [];
  if (Math.max(stakes.physical, stakes.professional, stakes.psychological) < 45) {
    stakesWarnings.push(
      makeSignal(
        "low-stakes",
        "stakes",
        "HIGH",
        0.8,
        "The current setup does not show strong stakes language yet",
        "The app can still function, but the story materials are not clearly signaling physical, professional, or psychological cost.",
        "Clarify what the lead stands to lose in body, livelihood, or identity.",
      ),
    );
  }

  const pillars: CraftPillarScore[] = [
    {
      id: "plot",
      label: "Plot",
      score: clamp(project.plotThreads.length * 18 + average(project.plotThreads.map((thread) => thread.heat * 14))),
      summary: "Tracks unresolved promises, pressure lines, and payoff visibility.",
    },
    {
      id: "characters",
      label: "Characters",
      score: clamp(average(project.characters.map((character) => countFilled([character.goal, character.fear, character.secret, character.wound]) * 22))),
      summary: "Measures whether characters have defined wants, fears, wounds, and contradiction.",
    },
    {
      id: "structure",
      label: "Structure",
      score: clamp((structure.progress.filter((beat) => beat.present).length / structure.progress.length) * 100),
      summary: "Checks how much of the big-turn structure is actually mapped in the skeleton.",
    },
    {
      id: "scenes",
      label: "Scenes",
      score: clamp(average(sceneCompleteness) * 28),
      summary: "Rewards scene cards that contain goal, conflict, and changed outcome.",
    },
    {
      id: "dialogue",
      label: "Dialogue",
      score: clamp(
        average(
          project.chapters.map((chapter) => {
            const lines = (chapter.draft.match(/["']/g) ?? []).length;
            return Math.min(lines * 6, 100);
          }),
        ) || 42,
      ),
      summary: "Uses the manuscript and chapter drafts to estimate dialogue presence and scene exchange.",
    },
    {
      id: "styleVoice",
      label: "Style / Voice",
      score: clamp(35 + project.styleProfile.voiceRules.length * 12 + countFilled([project.styleProfile.aestheticGuide, project.styleProfile.styleGuide]) * 15),
      summary: "Looks for explicit voice rules and an aesthetic identity to keep prose from flattening out.",
    },
    {
      id: "theme",
      label: "Theme",
      score: clamp(project.bookSettings.themes.length * 18 + countFilled([project.oneLineHook, project.bookSettings.storyBrief]) * 16),
      summary: "Measures whether thematic intent is named and reflected in the project materials.",
    },
  ];

  return {
    pillars,
    lock: {
      lead: lead?.name || "No clear lead marked yet.",
      objective: lead?.goal || project.plotThreads[0]?.title || "Define the lead's driving objective.",
      confrontation: project.plotThreads[0]?.summary || "Map the main source of conflict.",
      knockoutEnding:
        project.plotThreads[0]?.promisedPayoff || "State the decisive emotional and plot payoff the ending should land.",
      warnings: lockWarnings,
    },
    stakes: {
      physical: stakes.physical,
      professional: stakes.professional,
      psychological: stakes.psychological,
      warnings: stakesWarnings,
    },
    structure: {
      beatProgress: structure.progress,
      warnings: structure.warnings,
    },
    scenes: {
      totalScenes: project.sceneCards.length,
      completeScenes: project.sceneCards.filter((scene) => countFilled([scene.goal, scene.conflict, scene.outcome]) >= 3).length,
      fillerSceneIds,
      warnings: warnings.filter((warning) => warning.area === "scenes"),
    },
    characterBond: {
      empathy: characterBond.empathy,
      sympathy: characterBond.sympathy,
      vulnerability: characterBond.vulnerability,
      innerConflict: characterBond.innerConflict,
      warnings:
        characterBond.vulnerability < 45
          ? [
              makeSignal(
                "low-vulnerability",
                "characterBond",
                "MEDIUM",
                0.68,
                "Lead vulnerability could be more visible",
                "Readers bond fastest when the lead is exposed emotionally, morally, or socially.",
                "Clarify the lead's wound, fear, or private weakness in the character record or early scenes.",
                lead ? [lead.id] : [],
              ),
            ]
          : [],
    },
    pageTurner: {
      tension: clamp(average(project.plotThreads.map((thread) => thread.heat * 18)) || 40),
      pacing: clamp(project.styleProfile.pacing * 18),
      unresolvedQuestions: project.chapters.reduce((count, chapter) => count + chapter.summaries.reduce((sum, summary) => sum + summary.unresolvedQuestions.length, 0), 0),
      chapterEndings: clamp(project.chapters.filter((chapter) => chapter.draft.trim().length > 0).length * 12),
      warnings:
        project.chapters.every((chapter) => chapter.summaries.every((summary) => summary.unresolvedQuestions.length === 0))
          ? [
              makeSignal(
                "few-open-questions",
                "pageTurner",
                "MEDIUM",
                0.66,
                "Few unresolved questions are being tracked",
                "If chapter summaries do not preserve open questions, forward pull gets harder to monitor.",
                "Capture at least one reader-facing unresolved question after each important chapter.",
              ),
            ]
          : [],
    },
    pitch: buildPitch(project, lead),
    warnings: [...warnings, ...lockWarnings, ...stakesWarnings, ...structure.warnings],
    sourceFramework: [
      "Bell-inspired seven pillars",
      "LOCK: Lead, Objective, Confrontation, Knockout Ending",
      "Three death stakes: physical, professional, psychological",
    ],
  };
}

function stakestextMatch(text: string, needles: string[]) {
  return needles.reduce((count, needle) => (text.includes(needle) ? count + 1 : count), 0);
}
