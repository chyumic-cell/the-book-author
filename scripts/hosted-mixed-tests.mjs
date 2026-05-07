import { chromium } from "playwright";

const base = process.env.STORYFORGE_BASE_URL ?? "https://the-book-author.vercel.app";
const username = process.env.STORYFORGE_USERNAME ?? "MichaelPolevoy";
const password = process.env.STORYFORGE_PASSWORD ?? "0525786222";
const mode = process.env.STORYFORGE_MIXED_MODE ?? "first";

function wc(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasDialogue(text) {
  return /"[^"\n]+"/.test(String(text || ""));
}

function includesLoose(text, needle) {
  return String(text || "").toLowerCase().includes(String(needle || "").toLowerCase());
}

async function signIn(page) {
  await page.goto(`${base}/sign-in`, { waitUntil: "networkidle" });
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/auth/sign-in") && response.request().method() === "POST"),
    page.getByRole("button", { name: "Sign in", exact: true }).click(),
  ]);
}

async function authedFetch(page, path, options = {}) {
  const result = await page.evaluate(
    async ({ url, options }) => {
      const response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
        credentials: "include",
      });
      const text = await response.text();
      let data;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      return { ok: response.ok, status: response.status, data };
    },
    { url: `${base}${path}`, options },
  );

  if (!result.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed: ${result.status} ${JSON.stringify(result.data)}`);
  }

  return result.data;
}

async function assistant(page, projectId, body) {
  const start = Date.now();
  const data = await authedFetch(page, `/api/projects/${projectId}/assistant`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { ms: Date.now() - start, data };
}

async function getProject(page, projectId) {
  return (await authedFetch(page, `/api/projects/${projectId}`)).data.project;
}

async function createSingleChapterProject(page, label) {
  const create = await authedFetch(page, "/api/projects", {
    method: "POST",
    body: JSON.stringify({
      title: `${label} ${Date.now()}`,
      premise:
        "In a medieval fantasy city, public wishes are legal force, but every miracle spoken before witnesses steals a cherished memory. A court fixer named Malket must bargain through one dangerous feast before the city tears itself apart.",
      genre: "Fantasy",
      tone: "Dialogue-heavy, dangerous, emotional, commercial",
      audience: "Adult",
      pointOfView: "Third person limited",
      tense: "Past tense",
      storyBrief:
        "Malket must survive an oath-feast where nobles, priests, and mercenaries all know the Witness Tithe can ruin a life faster than a blade.",
      plotDirection:
        "Make the chapter extremely dialogue-heavy, pressure-driven, Bell-style, and rooted in negotiation, leverage, and emotional reversals.",
    }),
  });

  const projectId = create.data.projectId;
  let project = await getProject(page, projectId);
  const chapter = project.chapters[0];
  await authedFetch(page, `/api/chapters/${chapter.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      title: "Chapter 1",
      purpose: "",
      currentBeat: "",
      desiredMood: "",
      outline: "",
      draft: "",
      targetWordCount: 1000,
      keyBeats: [],
      requiredInclusions: [],
      forbiddenElements: [],
      sceneList: [],
    }),
  });
  return { projectId, chapterId: chapter.id };
}

async function buildTargetedCharacter(page, projectId) {
  await authedFetch(page, `/api/projects/${projectId}/story-bible`, {
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
        notes: "He must sound court-bred, exhausted, sharp, and emotionally guarded.",
      },
    }),
  });
  let project = await getProject(page, projectId);
  const character = project.characters.find((entry) => entry.name === "Malket");
  await authedFetch(page, `/api/projects/${projectId}/targeted-ai`, {
    method: "POST",
    body: JSON.stringify({
      mode: "character",
      characterId: character.id,
      action: "develop-dossier",
      draftCharacter: character,
    }),
  });
  project = await getProject(page, projectId);
  return project.characters.find((entry) => entry.id === character.id);
}

async function buildTargetedStructure(page, projectId, chapterId) {
  await authedFetch(page, `/api/projects/${projectId}/skeleton`, {
    method: "POST",
    body: JSON.stringify({
      entityType: "structureBeat",
      payload: {
        chapterId,
        type: "OPENING_DISTURBANCE",
        label: "Oath Feast Disturbance",
        description: "",
        notes: "",
        status: "PLANNED",
        orderIndex: 1,
      },
    }),
  });
  let project = await getProject(page, projectId);
  const beat = project.structureBeats.find((entry) => entry.label === "Oath Feast Disturbance") ?? project.structureBeats[0];
  for (const field of ["description", "notes"]) {
    await authedFetch(page, `/api/projects/${projectId}/targeted-ai`, {
      method: "POST",
      body: JSON.stringify({
        scope: "SKELETON",
        targetEntityType: "structureBeat",
        itemId: beat.id,
        itemTitle: beat.label,
        fieldKey: field,
        fieldLabel: field === "description" ? "Description" : "Notes",
        action: "develop",
        currentValue: beat[field] ?? "",
        draftItem: beat,
      }),
    });
  }
  project = await getProject(page, projectId);
  return project.structureBeats.find((entry) => entry.id === beat.id);
}

async function buildTargetedRule(page, projectId) {
  await authedFetch(page, `/api/projects/${projectId}/story-bible`, {
    method: "POST",
    body: JSON.stringify({
      entityType: "workingNote",
      payload: {
        title: "Witness Tithe",
        content: "",
        status: "ACTIVE",
        tags: ["book-rule"],
      },
    }),
  });
  let project = await getProject(page, projectId);
  const rule = project.workingNotes.find((entry) => entry.title === "Witness Tithe");
  await authedFetch(page, `/api/projects/${projectId}/targeted-ai`, {
    method: "POST",
    body: JSON.stringify({
      scope: "STORY_BIBLE",
      itemId: rule.id,
      itemTitle: rule.title,
      fieldKey: "content",
      fieldLabel: "Content",
      action: "develop",
      currentValue: rule.content ?? "",
      draftItem: rule,
    }),
  });
  project = await getProject(page, projectId);
  return project.workingNotes.find((entry) => entry.id === rule.id);
}

async function buildTargetedOutline(page, projectId, chapterId) {
  let project = await getProject(page, projectId);
  let chapter = project.chapters.find((entry) => entry.id === chapterId);
  const fields = [
    ["title", "Title"],
    ["purpose", "Purpose"],
    ["currentBeat", "Current beat"],
    ["desiredMood", "Desired mood"],
    ["keyBeats", "Key beats"],
    ["requiredInclusions", "Required inclusions"],
    ["forbiddenElements", "Forbidden elements"],
    ["sceneList", "Scene list"],
    ["outline", "Outline"],
  ];
  for (const [fieldKey, fieldLabel] of fields) {
    await authedFetch(page, `/api/projects/${projectId}/targeted-ai`, {
      method: "POST",
      body: JSON.stringify({
        scope: "SKELETON",
        targetEntityType: "chapter",
        itemId: chapter.id,
        itemTitle: chapter.title,
        fieldKey,
        fieldLabel,
        action: "develop",
        currentValue: Array.isArray(chapter[fieldKey]) ? chapter[fieldKey].join("\n") : String(chapter[fieldKey] ?? ""),
        draftItem: chapter,
        instruction:
          "Make this a medieval fantasy chapter built around the Oath Feast Disturbance, the Witness Tithe, and Malket's sharp court voice. Keep it dialogue-heavy and commercially gripping.",
      }),
    });
    project = await getProject(page, projectId);
    chapter = project.chapters.find((entry) => entry.id === chapterId);
  }
  return chapter;
}

async function buildAssistantCharacter(page, projectId, chapterId) {
  await assistant(page, projectId, {
    message:
      "In the Story Bible create one character dossier for Malket. Fill the useful fields, especially role, summary, goal, fear, secret, wound, speech pattern, accent or dialect, directness, emotional state, and relationship texture. Make him court-bred, dangerous with words, exhausted, and emotionally guarded.",
    role: "COWRITER",
    scope: "STORY_BIBLE",
    chapterId,
    applyChanges: true,
  });
  const project = await getProject(page, projectId);
  return project.characters.find((entry) => entry.name.toLowerCase().includes("malket"));
}

async function buildAssistantStructure(page, projectId, chapterId) {
  await assistant(page, projectId, {
    message:
      "In the story skeleton create one opening disturbance structure beat called Oath Feast Disturbance. Fill the structure beat properly and link it to Chapter 1.",
    role: "OUTLINE_ARCHITECT",
    scope: "SKELETON",
    chapterId,
    applyChanges: true,
  });
  const project = await getProject(page, projectId);
  return project.structureBeats.find((entry) => includesLoose(entry.label, "oath feast") || entry.type === "OPENING_DISTURBANCE");
}

async function buildAssistantRule(page, projectId, chapterId) {
  await assistant(page, projectId, {
    message:
      "In the Story Bible create one book rule called Witness Tithe. Make it a sharp, canon-safe magic law about spoken wishes before witnesses costing a cherished memory.",
    role: "COWRITER",
    scope: "STORY_BIBLE",
    chapterId,
    applyChanges: true,
  });
  const project = await getProject(page, projectId);
  return project.workingNotes.find((entry) => includesLoose(entry.title, "Witness Tithe"));
}

async function buildAssistantOutline(page, projectId, chapterId) {
  await assistant(page, projectId, {
    message:
      "In the story skeleton for Chapter 1, fill the title, purpose, current beat, desired mood, key beats, required inclusions, forbidden elements, scene list, and outline. Make it medieval fantasy, dialogue-heavy, driven by the Oath Feast Disturbance, Malket, and the Witness Tithe.",
    role: "OUTLINE_ARCHITECT",
    scope: "SKELETON",
    chapterId,
    applyChanges: true,
  });
  const project = await getProject(page, projectId);
  return project.chapters.find((entry) => entry.id === chapterId);
}

async function writeWithAssistant(page, projectId, chapterId) {
  const result = await assistant(page, projectId, {
    message:
      "Write Chapter 1 now as a single chapter of about 1,000 words. Use the established Malket dossier, the Oath Feast Disturbance structure beat, the Witness Tithe book rule, and the full chapter runway already in the app. Make it extremely dialogue-heavy, medieval fantasy, emotionally sharp, and commercially gripping. Do not restart the scene halfway through.",
    role: "GHOSTWRITER",
    scope: "CHAPTER",
    chapterId,
    applyChanges: true,
  });
  await sleep(4000);
  const project = await getProject(page, projectId);
  return { result, chapter: project.chapters.find((entry) => entry.id === chapterId) };
}

async function writeWithButtons(page, projectId, chapterId) {
  const outline = await authedFetch(page, `/api/chapters/${chapterId}/generate/outline`, { method: "POST" });
  await authedFetch(page, `/api/chapters/${chapterId}`, {
    method: "PATCH",
    body: JSON.stringify({ outline: outline.data.run.suggestion }),
  });
  const draft = await authedFetch(page, `/api/chapters/${chapterId}/generate/draft`, { method: "POST" });
  await authedFetch(page, `/api/chapters/${chapterId}`, {
    method: "PATCH",
    body: JSON.stringify({ draft: draft.data.run.suggestion }),
  });
  const project = await getProject(page, projectId);
  return project.chapters.find((entry) => entry.id === chapterId);
}

function summarizeCharacter(character) {
  if (!character) return null;
  return {
    name: character.name,
    role: character.role,
    summaryWords: wc(character.summary),
    accent: character.quickProfile?.accent ?? "",
    speechPattern: character.quickProfile?.speechPattern ?? "",
    emotionalState: character.currentState?.emotionalState ?? "",
    dialect: character.dossier?.speechLanguage?.dialect ?? "",
    directness: character.dossier?.speechLanguage?.directness ?? "",
    freeTextCoreWords: wc(character.dossier?.freeTextCore ?? ""),
  };
}

function summarizeBeat(beat) {
  if (!beat) return null;
  return {
    type: beat.type,
    label: beat.label,
    descriptionWords: wc(beat.description),
    notesWords: wc(beat.notes),
    chapterId: beat.chapterId,
  };
}

function summarizeRule(rule) {
  if (!rule) return null;
  return {
    title: rule.title,
    words: wc(rule.content),
    tags: rule.tags,
  };
}

function summarizeChapter(chapter) {
  if (!chapter) return null;
  return {
    title: chapter.title,
    purposeWords: wc(chapter.purpose),
    beatWords: wc(chapter.currentBeat),
    outlineWords: wc(chapter.outline),
    draftWords: wc(chapter.draft),
    hasDialogue: hasDialogue(chapter.draft),
    mentionsMalket: includesLoose(chapter.draft, "Malket"),
    mentionsWitnessTithe: includesLoose(chapter.draft, "Witness Tithe") || includesLoose(chapter.draft, "witness tithe"),
    mentionsOathFeast: includesLoose(chapter.draft, "Oath Feast") || includesLoose(chapter.draft, "oath-feast"),
    repeatsOpening: chapter.draft ? chapter.draft.toLowerCase().indexOf(chapter.draft.toLowerCase().slice(0, 100), 220) >= 0 : false,
  };
}

async function runTest1(page, label) {
  const { projectId, chapterId } = await createSingleChapterProject(page, label);
  const character = await buildTargetedCharacter(page, projectId);
  const beat = await buildTargetedStructure(page, projectId, chapterId);
  const rule = await buildTargetedRule(page, projectId);
  const chapterPlan = await buildTargetedOutline(page, projectId, chapterId);
  const { result, chapter } = await writeWithAssistant(page, projectId, chapterId);
  return {
    label,
    projectId,
    assistantMs: result.ms,
    character: summarizeCharacter(character),
    beat: summarizeBeat(beat),
    rule: summarizeRule(rule),
    chapterPlan: summarizeChapter(chapterPlan),
    chapter: summarizeChapter(chapter),
  };
}

async function runTest2(page, label) {
  const { projectId, chapterId } = await createSingleChapterProject(page, label);
  const character = await buildAssistantCharacter(page, projectId, chapterId);
  const beat = await buildAssistantStructure(page, projectId, chapterId);
  const rule = await buildAssistantRule(page, projectId, chapterId);
  const chapterPlan = await buildAssistantOutline(page, projectId, chapterId);
  const chapter = await writeWithButtons(page, projectId, chapterId);
  return {
    label,
    projectId,
    character: summarizeCharacter(character),
    beat: summarizeBeat(beat),
    rule: summarizeRule(rule),
    chapterPlan: summarizeChapter(chapterPlan),
    chapter: summarizeChapter(chapter),
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await signIn(page);
    const test1 = await runTest1(page, `Mixed Test 1 ${mode}`);
    const test2 = await runTest2(page, `Mixed Test 2 ${mode}`);
    console.log(JSON.stringify({ mode, test1, test2 }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
