import assert from "node:assert/strict";

const base = process.env.STORYFORGE_BASE_URL ?? "https://the-book-author.vercel.app";
const username = process.env.STORYFORGE_USERNAME ?? "MichaelPolevoy";
const password = process.env.STORYFORGE_PASSWORD ?? "0525786222";
const keepProject = process.env.STORYFORGE_KEEP_QUALITY_PROJECT === "1";
const requestTimeoutMs = Number(process.env.STORYFORGE_AUDIT_REQUEST_TIMEOUT_MS ?? 240000);

let cookie = "";

function mergeCookies(headers) {
  const raw = headers.getSetCookie ? headers.getSetCookie() : headers.get("set-cookie") ? [headers.get("set-cookie")] : [];
  const parts = raw.map((value) => value.split(";")[0]).filter(Boolean);
  if (parts.length) {
    cookie = [...new Set([...(cookie ? cookie.split("; ") : []), ...parts])].join("; ");
  }
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`${options.method ?? "GET"} ${path} timed out`)), requestTimeoutMs);
  const headers = {
    Origin: base,
    Referer: `${base}/`,
    Cookie: cookie,
    ...(options.headers ?? {}),
  };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const startedAt = Date.now();
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers,
      redirect: "manual",
      signal: controller.signal,
    });
    mergeCookies(response.headers);
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    const elapsedMs = Date.now() - startedAt;
    if (!response.ok) {
      throw new Error(`${options.method ?? "GET"} ${path} failed ${response.status} after ${elapsedMs}ms: ${text.slice(0, 1200)}`);
    }
    return { data, text, elapsedMs };
  } finally {
    clearTimeout(timeout);
  }
}

async function signIn() {
  await request("/api/auth/sign-in", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

function wc(value) {
  return String(value ?? "").trim().split(/\s+/).filter(Boolean).length;
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function includesLoose(text, needle) {
  return clean(text).toLowerCase().includes(clean(needle).toLowerCase());
}

function getPath(object, path) {
  return path.split(".").reduce((current, key) => (current == null ? undefined : current[key]), object);
}

function nonEmpty(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? "").trim()).filter(Boolean).length > 0;
  }
  return String(value ?? "").trim().length > 0;
}

function repeatedOpening(text) {
  const normalized = clean(text).toLowerCase();
  const opening = normalized.slice(0, 120);
  return opening.length > 60 && normalized.indexOf(opening, 180) !== -1;
}

function repeatedNgram(text, size = 7) {
  const words = clean(text).toLowerCase().split(/\s+/).filter(Boolean);
  const seen = new Map();
  for (let index = 0; index + size <= words.length; index += 1) {
    const gram = words.slice(index, index + size).join(" ");
    const first = seen.get(gram);
    if (first != null && index - first > size) {
      return gram;
    }
    seen.set(gram, index);
  }
  return "";
}

function comparableWords(text) {
  return clean(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff\s'-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 5)
    .filter(
      (word) =>
        ![
          "malket",
          "chapter",
          "witness",
          "tithe",
          "memory",
          "prince",
          "sarun",
          "could",
          "would",
          "their",
          "there",
          "before",
          "after",
          "through",
        ].includes(word),
    );
}

function overlapScore(left, right) {
  const leftWords = new Set(comparableWords(left));
  const rightWords = new Set(comparableWords(right));
  if (!leftWords.size || !rightWords.size) return 0;
  let shared = 0;
  for (const word of leftWords) {
    if (rightWords.has(word)) shared += 1;
  }
  return shared / Math.min(leftWords.size, rightWords.size);
}

function oddCharacterRatio(text) {
  const compact = String(text ?? "").replace(/\s/g, "");
  if (!compact) return 1;
  const normal = compact.match(/[A-Za-z0-9"'.,!?;:()\-\u0590-\u05ff]/g)?.length ?? 0;
  return 1 - normal / compact.length;
}

function hasUnbalancedFormatting(text) {
  const straightQuotes = (String(text).match(/"/g) ?? []).length;
  const italicStars = (String(text).match(/\*/g) ?? []).length;
  return straightQuotes % 2 !== 0 || italicStars % 2 !== 0;
}

const leakPatterns = [
  /\bas an ai\b/i,
  /\bi (?:will|would|can) (?:write|rewrite|revise|expand|tighten|help)\b/i,
  /\bhere is (?:the|a)\b/i,
  /\btarget area\b/i,
  /\brequested field paths?\b/i,
  /\breturn only\b/i,
  /\brejected previous result\b/i,
  /\bselected text:\b/i,
  /\bcontext package\b/i,
  /\bchapter blueprint\b/i,
  /\bdossier\.[a-z]/i,
  /\bpath :: value\b/i,
  /```/,
  /\bundefined\b|\bnull\b/i,
];

function leakageReasons(text) {
  return leakPatterns.filter((pattern) => pattern.test(String(text ?? ""))).map((pattern) => pattern.toString());
}

function qualityReasons(
  text,
  {
    minWords = 8,
    requireDialogue = false,
    requiredTerms = [],
    requiredAnyTerms = [],
    requiredAnyCount = 1,
    literary = false,
    minSentences,
    minParagraphs,
  } = {},
) {
  const reasons = [];
  const words = wc(text);
  const normalized = clean(text);
  if (words < minWords) reasons.push(`too short (${words} words, expected at least ${minWords})`);
  const leaks = leakageReasons(text);
  if (leaks.length) reasons.push(`leaks internal/prompt language (${leaks.join(", ")})`);
  if (oddCharacterRatio(text) > 0.08) reasons.push("too many odd/non-prose characters");
  if (repeatedOpening(text)) reasons.push("appears to restart/repeat the opening");
  const repeated = repeatedNgram(text);
  if (repeated) reasons.push(`repeats phrase: "${repeated}"`);
  if (hasUnbalancedFormatting(text)) reasons.push("unbalanced quotation marks or italic asterisks");
  if (requireDialogue && !/"[^"\n]{2,}"/.test(String(text))) reasons.push("expected dialogue but found no quoted speech");
  for (const term of requiredTerms) {
    if (!includesLoose(text, term)) reasons.push(`missing expected story term "${term}"`);
  }
  if (requiredAnyTerms.length) {
    const hits = requiredAnyTerms.filter((term) => includesLoose(text, term));
    if (hits.length < requiredAnyCount) {
      reasons.push(
        `not visibly tied to enough book canon terms (${hits.length}/${requiredAnyCount}; expected some of: ${requiredAnyTerms.join(", ")})`,
      );
    }
  }
  if (literary) {
    const sentenceCount = normalized.split(/[.!?]+/).map((entry) => entry.trim()).filter(Boolean).length;
    const paragraphCount = String(text).split(/\n{2,}/).map((entry) => entry.trim()).filter(Boolean).length;
    const requiredSentences = minSentences ?? 5;
    const requiredParagraphs = minParagraphs ?? 3;
    if (sentenceCount < requiredSentences) reasons.push("not enough sentence movement for prose");
    if (paragraphCount < requiredParagraphs) reasons.push("not enough paragraph shape for prose");
    if (!/[.!?]["']?$/.test(normalized)) reasons.push("does not end like complete prose");
  }
  return reasons;
}

function assertQuality(label, text, options = {}) {
  const reasons = qualityReasons(text, options);
  if (reasons.length) {
    throw new Error(`${label} quality failed: ${reasons.join("; ")}\nOutput:\n${String(text ?? "").slice(0, 1800)}`);
  }
}

function assertChapterProgression(previousChapter, nextChapter, expectedTerms = []) {
  assertQuality(`chapter ${nextChapter.number} draft`, nextChapter.draft, {
    minWords: 180,
    requireDialogue: true,
    requiredTerms: ["Malket", ...expectedTerms],
    literary: true,
  });
  if (/^\s*(?:chapter\s+1\b|the oath feast began|malket stood at the edge of the oath feast)/i.test(nextChapter.draft)) {
    throw new Error(`Chapter ${nextChapter.number} appears to restart the book instead of continuing the story.`);
  }
  const overlap = overlapScore(previousChapter.draft, nextChapter.draft);
  if (overlap > 0.42) {
    throw new Error(
      `Chapter ${nextChapter.number} is too similar to Chapter ${previousChapter.number} (${Math.round(overlap * 100)}% content overlap).`,
    );
  }
  const previousTail = clean(previousChapter.draft).split(/\s+/).slice(-90).join(" ");
  const nextHead = clean(nextChapter.draft).split(/\s+/).slice(0, 140).join(" ");
  const bridgeOverlap = overlapScore(previousTail, nextHead);
  if (bridgeOverlap < 0.04 && !expectedTerms.some((term) => includesLoose(nextHead, term))) {
    throw new Error(
      `Chapter ${nextChapter.number} does not visibly bridge from the previous ending or expected continuation terms.`,
    );
  }
}

function assertLength(label, text, target, { tolerance = 0.1, maxSlack = 200 } = {}) {
  const words = wc(text);
  const slack = Math.min(Math.max(Math.round(target * tolerance), 1), maxSlack);
  const min = Math.max(1, target - slack);
  const max = target + slack;
  if (words < min || words > max) {
    throw new Error(`${label} length failed: ${words} words, expected ${min}-${max} around target ${target}.\nOutput:\n${String(text ?? "").slice(0, 1200)}`);
  }
}

async function createProject() {
  const stamp = Date.now();
  const response = await request("/api/projects", {
    method: "POST",
    body: JSON.stringify({
      title: `AI Quality Audit ${stamp}`,
      premise:
        "In a medieval fantasy city, every public wish becomes legal reality, but each witnessed miracle steals one cherished memory. A court fixer named Malket must survive an oath feast where a corrupt prince plans to rewrite the city's laws with a spoken wish.",
      oneLineHook: "A memory-taxed wish law turns a royal feast into a verbal battlefield.",
      genre: "Medieval fantasy",
      tone: "Dialogue-heavy, tense, emotionally sharp, commercially readable",
      audience: "Adult fantasy readers",
      pointOfView: "Third person limited",
      tense: "Past tense",
      storyBrief:
        "Malket is a tired court fixer whose power is not magic but language. He must stop Prince Sarun from using the Witness Tithe to make a cruel wish binding before the entire court.",
      plotDirection:
        "Build a tight, dialogue-heavy chapter around bargaining, interruption, threat, subtext, and a costly moral choice. Do not restart the scene halfway through.",
    }),
  });
  return response.data.data.projectId;
}

async function getProject(projectId) {
  return (await request(`/api/projects/${projectId}`)).data.data.project;
}

async function patchChapter(chapterId, payload) {
  await request(`/api/chapters/${chapterId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

async function createChapter(projectId) {
  const response = await request(`/api/projects/${projectId}/chapters`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return response.data.data.chapterId;
}

async function createCanon(projectId) {
  await request(`/api/projects/${projectId}/story-bible`, {
    method: "POST",
    body: JSON.stringify({
      entityType: "character",
      payload: {
        name: "Malket",
        role: "",
        archetype: "",
        summary: "",
        goal: "",
        fear: "",
        secret: "",
        wound: "",
        notes:
          "He is court-bred, exhausted, dangerous with words, emotionally guarded, and terrified that each public miracle will erase the memory of his dead sister.",
      },
    }),
  });
  await request(`/api/projects/${projectId}/story-bible`, {
    method: "POST",
    body: JSON.stringify({
      entityType: "workingNote",
      payload: {
        title: "Witness Tithe",
        content: "",
        status: "ACTIVE",
        tags: ["book-rule", "magic-system"],
      },
    }),
  });
  await request(`/api/projects/${projectId}/skeleton`, {
    method: "POST",
    body: JSON.stringify({
      entityType: "structureBeat",
      payload: {
        type: "OPENING_DISTURBANCE",
        label: "Oath Feast Disturbance",
        description: "",
        notes: "",
        status: "PLANNED",
        orderIndex: 1,
      },
    }),
  });
}

async function targetedAi(projectId, body) {
  const response = await request(`/api/projects/${projectId}/targeted-ai`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { elapsedMs: response.elapsedMs, data: response.data.data };
}

function logTiming(label, result) {
  console.log(`QUALITY_TIMING ${label} ${Math.round(result.elapsedMs / 1000)}s`);
}

async function assist(chapterId, body) {
  const response = await request(`/api/chapters/${chapterId}/assist`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { elapsedMs: response.elapsedMs, run: response.data.data.run };
}

async function generateChapterWithCanon(projectId, chapterId, patch) {
  await patchChapter(chapterId, patch);
  const outlineResponse = await request(`/api/chapters/${chapterId}/generate/outline`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  const outline = outlineResponse.data.data.run.suggestion;
  assertQuality(`chapter ${patch.number ?? ""} generated outline`, outline, {
    minWords: 60,
    requiredTerms: patch.requiredTermsForAudit ?? ["Malket"],
  });
  await patchChapter(chapterId, { outline });
  const draftResponse = await request(`/api/chapters/${chapterId}/generate/draft`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  const draft = draftResponse.data.data.run.suggestion;
  await patchChapter(chapterId, { draft });
  const project = await getProject(projectId);
  return project.chapters.find((entry) => entry.id === chapterId);
}

async function assistant(projectId, body) {
  const response = await request(`/api/projects/${projectId}/assistant`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { elapsedMs: response.elapsedMs, data: response.data.data };
}

function summarizeDossier(character) {
  const requiredPaths = [
    "role",
    "summary",
    "goal",
    "fear",
    "secret",
    "wound",
    "quickProfile.accent",
    "quickProfile.speechPattern",
    "dossier.basicIdentity.fullName",
    "dossier.lifePosition.roleTitle",
    "dossier.lifePosition.socialClass",
    "dossier.personalityBehavior.coreTraits",
    "dossier.personalityBehavior.flaws",
    "dossier.personalityBehavior.emotionalTendencies",
    "dossier.personalityBehavior.conflictStyle",
    "dossier.motivationStory.shortTermGoal",
    "dossier.motivationStory.internalConflict",
    "dossier.motivationStory.stakesIfFail",
    "dossier.speechLanguage.accent",
    "dossier.speechLanguage.dialect",
    "dossier.speechLanguage.directness",
    "dossier.speechLanguage.rhythm",
    "dossier.speechLanguage.emotionalShifts",
    "dossier.speechLanguage.angrySpeech",
    "dossier.speechLanguage.scaredSpeech",
    "dossier.speechLanguage.lyingSpeech",
    "currentState.emotionalState",
    "currentState.loyalties",
  ];
  const filled = requiredPaths.filter((path) => nonEmpty(getPath(character, path)));
  const missing = requiredPaths.filter((path) => !nonEmpty(getPath(character, path)));
  return { required: requiredPaths.length, filled: filled.length, missing };
}

function assertDossier(character) {
  assert.ok(character, "Character was not created.");
  const summary = summarizeDossier(character);
  if (summary.filled < Math.ceil(summary.required * 0.8)) {
    throw new Error(`Character dossier under-filled: ${summary.filled}/${summary.required}. Missing: ${summary.missing.join(", ")}`);
  }
  for (const path of [
    "summary",
    "quickProfile.speechPattern",
    "dossier.speechLanguage.directness",
    "dossier.speechLanguage.emotionalShifts",
    "currentState.emotionalState",
  ]) {
    assertQuality(`character ${path}`, getPath(character, path), { minWords: 4, requiredTerms: path === "summary" ? ["Malket"] : [] });
  }
  return summary;
}

async function runAudit() {
  console.log("QUALITY_STEP sign in");
  await signIn();
  const projectId = await createProject();
  console.log(`QUALITY_STEP project ${projectId}`);
  try {
    let project = await getProject(projectId);
    let chapter = project.chapters[0];
    await patchChapter(chapter.id, {
      title: "Chapter 1",
      targetWordCount: 1000,
      purpose: "",
      currentBeat: "",
      desiredMood: "",
      outline: "",
      draft: "",
      notes: "",
    });
    await createCanon(projectId);
    project = await getProject(projectId);
    chapter = project.chapters[0];
    const character = project.characters.find((entry) => entry.name === "Malket");
    const rule = project.workingNotes.find((entry) => entry.title === "Witness Tithe");
    const beat = project.structureBeats.find((entry) => entry.label === "Oath Feast Disturbance");

    console.log("QUALITY_STEP character dossier");
    const characterResult = await targetedAi(projectId, {
      mode: "character",
      characterId: character.id,
      action: "develop-dossier",
      draftCharacter: character,
    });
    logTiming("character dossier", characterResult);
    project = characterResult.data.project;
    const developedCharacter = project.characters.find((entry) => entry.id === character.id);
    const dossierSummary = assertDossier(developedCharacter);

    console.log("QUALITY_STEP book rule");
    const bookRuleResult = await targetedAi(projectId, {
      scope: "STORY_BIBLE",
      itemId: rule.id,
      itemTitle: rule.title,
      fieldKey: "content",
      fieldLabel: "Content",
      action: "develop",
      currentValue: rule.content ?? "",
      draftItem: rule,
      instruction: "Explain the magic law clearly enough that chapter drafting can obey it without exposition dumps.",
    });
    logTiming("book rule", bookRuleResult);
    project = await getProject(projectId);
    const developedRule = project.workingNotes.find((entry) => entry.id === rule.id);
    assertQuality("book rule", developedRule.content, { minWords: 30, requiredTerms: ["Witness", "memory"] });

    console.log("QUALITY_STEP structure beat");
    for (const [fieldKey, fieldLabel] of [
      ["description", "Description"],
      ["notes", "Notes"],
    ]) {
      const currentBeat = (await getProject(projectId)).structureBeats.find((entry) => entry.id === beat.id);
      const structureResult = await targetedAi(projectId, {
        scope: "SKELETON",
        targetEntityType: "structureBeat",
        itemId: beat.id,
        itemTitle: beat.label,
        fieldKey,
        fieldLabel,
        action: "develop",
        currentValue: currentBeat[fieldKey] ?? "",
        draftItem: currentBeat,
        instruction: "Make it usable for drafting the oath feast scene and include Malket's opposition.",
      });
      logTiming(`structure ${fieldKey}`, structureResult);
    }
    project = await getProject(projectId);
    const developedBeat = project.structureBeats.find((entry) => entry.id === beat.id);
    assertQuality("structure beat description", developedBeat.description, { minWords: 20, requiredTerms: ["Malket"] });
    assertQuality("structure beat notes", developedBeat.notes, {
      minWords: 15,
      requiredTerms: ["Malket"],
      requiredAnyTerms: ["Oath", "Witness", "Tithe", "Sarun", "feast", "court"],
      requiredAnyCount: 2,
    });

    console.log("QUALITY_STEP chapter runway fields");
    for (const [fieldKey, fieldLabel] of [
      ["title", "Title"],
      ["purpose", "Purpose"],
      ["currentBeat", "Current beat"],
      ["desiredMood", "Desired mood"],
      ["outline", "Outline"],
    ]) {
      project = await getProject(projectId);
      chapter = project.chapters.find((entry) => entry.id === chapter.id);
      const runwayResult = await targetedAi(projectId, {
        scope: "SKELETON",
        targetEntityType: "chapter",
        itemId: chapter.id,
        itemTitle: chapter.title,
        fieldKey,
        fieldLabel,
        action: "develop",
        currentValue: String(chapter[fieldKey] ?? ""),
        draftItem: chapter,
        instruction:
          "Use Malket, the Witness Tithe, and the Oath Feast Disturbance. Make it specific, useful, and dialogue-heavy.",
      });
      logTiming(`chapter field ${fieldKey}`, runwayResult);
    }
    project = await getProject(projectId);
    chapter = project.chapters.find((entry) => entry.id === chapter.id);
    assertQuality("chapter title", chapter.title, { minWords: 2 });
    assertQuality("chapter purpose", chapter.purpose, { minWords: 12, requiredTerms: ["Malket"] });
    assertQuality("chapter current beat", chapter.currentBeat, {
      minWords: 10,
      requiredTerms: ["Malket"],
      requiredAnyTerms: ["Oath", "Witness", "Tithe", "Sarun", "feast", "court"],
      requiredAnyCount: 2,
    });
    assertQuality("chapter desired mood", chapter.desiredMood, { minWords: 3 });
    assertQuality("chapter outline", chapter.outline, { minWords: 90, requiredTerms: ["Malket", "Witness"], literary: false });

    console.log("QUALITY_STEP generate buttons");
    const outlineResponse = await request(`/api/chapters/${chapter.id}/generate/outline`, { method: "POST", body: JSON.stringify({}) });
    const generatedOutline = outlineResponse.data.data.run.suggestion;
    assertQuality("generate outline", generatedOutline, { minWords: 80, requiredTerms: ["Malket", "Witness"] });
    await patchChapter(chapter.id, { outline: generatedOutline });

    const draftResponse = await request(`/api/chapters/${chapter.id}/generate/draft`, { method: "POST", body: JSON.stringify({}) });
    const generatedDraft = draftResponse.data.data.run.suggestion;
    assertQuality("generate chapter draft", generatedDraft, {
      minWords: 180,
      requireDialogue: true,
      requiredTerms: ["Malket"],
      literary: true,
    });
    await patchChapter(chapter.id, { draft: generatedDraft });

    console.log("QUALITY_STEP manuscript assist actions");
    const selected =
      "Malket stood at the edge of the oath feast while Prince Sarun lifted the silver cup. Every noble leaned forward because a witnessed wish could become law before anyone had time to object. Malket knew the Witness Tithe would take a memory from the speaker, but he also knew the prince had already chosen someone else to pay.";
    const before =
      "The hall smelled of orange peel, hot wax, and old bargains. Musicians played softly enough that every whisper could still become evidence.";
    const after =
      "Across the table, the queen's scribe lowered his eyes. That frightened Malket more than any drawn blade.";

    const assistResults = {};
    for (const actionType of [
      "EXPAND",
      "TIGHTEN",
      "IMPROVE_PROSE",
      "SHARPEN_VOICE",
      "ADD_TENSION",
      "ADD_DIALOGUE",
      "DESCRIPTION_TO_DIALOGUE",
      "CONTINUE",
      "NEXT_BEATS",
    ]) {
      const result = await assist(chapter.id, {
        mode: "CO_WRITE",
        role: actionType === "NEXT_BEATS" ? "OUTLINE_ARCHITECT" : "COWRITER",
        actionType,
        selectionText: actionType === "CONTINUE" || actionType === "NEXT_BEATS" ? "" : selected,
        instruction:
          actionType === "CUSTOM_EDIT"
            ? "Make it sharper and more dangerous while preserving the exact scene facts."
            : "",
        contextNote: "Oath feast scene with Malket, Prince Sarun, and the Witness Tithe.",
        beforeSelection: before,
        afterSelection: after,
      });
      assistResults[actionType] = { words: wc(result.run.suggestion), elapsedMs: result.elapsedMs };
      const output = result.run.suggestion;
      if (actionType === "EXPAND") {
        assertLength("expand selection", output, wc(selected) * 3);
      }
      if (actionType === "TIGHTEN") {
        assertLength("tighten selection", output, Math.max(Math.ceil(wc(selected) / 3), 8));
      }
      assertQuality(`assist ${actionType}`, output, {
        minWords: actionType === "TIGHTEN" ? 8 : actionType === "NEXT_BEATS" ? 18 : 25,
        requireDialogue: actionType === "ADD_DIALOGUE" || actionType === "DESCRIPTION_TO_DIALOGUE",
        requiredTerms:
          actionType === "CONTINUE" || actionType === "NEXT_BEATS"
            ? ["Malket"]
            : actionType === "TIGHTEN"
              ? []
              : ["Malket"],
        literary: ["EXPAND", "IMPROVE_PROSE", "SHARPEN_VOICE", "ADD_TENSION", "ADD_DIALOGUE", "DESCRIPTION_TO_DIALOGUE"].includes(actionType),
        minSentences: ["EXPAND", "IMPROVE_PROSE", "SHARPEN_VOICE", "ADD_TENSION", "ADD_DIALOGUE", "DESCRIPTION_TO_DIALOGUE"].includes(actionType)
          ? 2
          : undefined,
        minParagraphs: ["EXPAND", "IMPROVE_PROSE", "SHARPEN_VOICE", "ADD_TENSION", "ADD_DIALOGUE", "DESCRIPTION_TO_DIALOGUE"].includes(actionType)
          ? 1
          : undefined,
      });
    }

    console.log("QUALITY_STEP bottom AI bar");
    const assistantResult = await assistant(projectId, {
      role: "OUTLINE_ARCHITECT",
      scope: "AUTO",
      chapterId: chapter.id,
      applyChanges: true,
      message:
        "Fill all chapter outline fields that are still weak or missing. Decide where the information belongs yourself. Use Malket, the Witness Tithe, and the Oath Feast Disturbance. Do not only update one field.",
    });
    assertQuality("assistant answer", assistantResult.data.message ?? assistantResult.data.assistantMessage ?? "", { minWords: 10 });
    project = await getProject(projectId);
    chapter = project.chapters.find((entry) => entry.id === chapter.id);
    const filledChapterFields = ["title", "purpose", "currentBeat", "desiredMood", "outline"].filter((field) => nonEmpty(chapter[field]));
    if (filledChapterFields.length < 5) {
      throw new Error(`Bottom AI bar did not leave all core chapter fields filled. Filled: ${filledChapterFields.join(", ")}`);
    }

    console.log("QUALITY_STEP chapter-to-chapter continuity");
    const chapter2Id = await createChapter(projectId);
    const chapter3Id = await createChapter(projectId);
    const firstChapterForSequence = (await getProject(projectId)).chapters.find((entry) => entry.id === chapter.id);
    const chapter2 = await generateChapterWithCanon(projectId, chapter2Id, {
      title: "The Scribe's Vanishing Ledger",
      purpose:
        "Continue directly after the oath feast. Malket follows the queen's scribe into the archive to learn who Prince Sarun chose to pay the Witness Tithe.",
      currentBeat:
        "The immediate fallout of Sarun's public wish attempt drives Malket from the feast hall into the archive, where the scribe reveals a missing ledger and a worse bargain.",
      desiredMood: "Suspicious, intimate, dialogue-heavy, dangerous, with momentum from Chapter 1.",
      targetWordCount: 1000,
      keyBeats: [
        "Malket leaves the feast with the queen's scribe under watch.",
        "The scribe admits the Witness Tithe can be redirected through a ledger.",
        "Sarun's agent interrupts before the proof is named.",
      ],
      requiredInclusions: ["queen's scribe", "archive", "ledger", "Witness Tithe fallout"],
      forbiddenElements: ["Do not restart at the oath feast opening.", "Do not introduce a new unrelated protagonist."],
      sceneList: ["corridor after feast", "archive alcove", "interruption by Sarun's agent"],
      outline:
        "Chapter 2 must continue from Chapter 1. Malket follows the queen's scribe away from the feast, presses him about who will pay Sarun's Witness Tithe, discovers the ledger that redirects memory-loss debt, and ends with Sarun's agent arriving before the scribe can name the victim.",
      requiredTermsForAudit: ["Malket", "scribe", "ledger"],
    });
    assertChapterProgression(firstChapterForSequence, chapter2, ["scribe", "ledger"]);

    const chapter3 = await generateChapterWithCanon(projectId, chapter3Id, {
      title: "The Price Written Twice",
      purpose:
        "Continue from the archive interruption. Malket confronts Prince Sarun with the ledger evidence and realizes the prince has written Malket's sister's memory into the debt.",
      currentBeat:
        "The ledger revelation forces Malket into direct verbal combat with Sarun, turning the Witness Tithe from public law into personal blackmail.",
      desiredMood: "Confrontational, grief-struck, sharp with dialogue, escalating from Chapter 2.",
      targetWordCount: 1000,
      keyBeats: [
        "Malket carries the ledger proof from the archive.",
        "Sarun tries to bargain using Malket's dead sister's memory.",
        "Malket chooses to speak a dangerous counter-wish rather than let another person pay.",
      ],
      requiredInclusions: ["ledger evidence", "Sarun", "dead sister's memory", "counter-wish"],
      forbiddenElements: ["Do not reset the story to a new feast opening.", "Do not ignore the archive discovery from Chapter 2."],
      sceneList: ["archive exit", "private court passage", "confrontation with Sarun"],
      outline:
        "Chapter 3 must continue from Chapter 2. Malket uses the ledger discovery to confront Sarun, learns the prince has tied the debt to Malket's dead sister's memory, and makes a dangerous counter-wish that changes the balance of power instead of restarting the book.",
      requiredTermsForAudit: ["Malket", "Sarun", "ledger"],
    });
    assertChapterProgression(chapter2, chapter3, ["Sarun", "ledger"]);

    const summary = {
      projectId,
      dossier: dossierSummary,
      ruleWords: wc(developedRule.content),
      beatDescriptionWords: wc(developedBeat.description),
      outlineWords: wc(chapter.outline),
      draftWords: wc(generatedDraft),
      sequence: [
        { number: firstChapterForSequence.number, words: wc(firstChapterForSequence.draft) },
        { number: chapter2.number, words: wc(chapter2.draft), overlapWithPrevious: overlapScore(firstChapterForSequence.draft, chapter2.draft) },
        { number: chapter3.number, words: wc(chapter3.draft), overlapWithPrevious: overlapScore(chapter2.draft, chapter3.draft) },
      ],
      assistResults,
    };
    console.log("QUALITY_AUDIT_OK");
    console.log(JSON.stringify(summary, null, 2));
    if (!keepProject) {
      await request(`/api/projects/${projectId}`, { method: "DELETE" }).catch(() => null);
    }
  } catch (error) {
    console.error("QUALITY_AUDIT_FAIL");
    console.error(error);
    console.error(`Project kept for inspection: ${base}/projects/${projectId}`);
    process.exitCode = 1;
  }
}

runAudit().catch((error) => {
  console.error("QUALITY_AUDIT_FAIL");
  console.error(error);
  process.exit(1);
});
