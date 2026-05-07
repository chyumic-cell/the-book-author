import { chromium } from "playwright";

const base = "https://the-book-author.vercel.app";
const username = "MichaelPolevoy";
const password = "0525786222";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function wc(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
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

async function createThreeChapterProject(page, titlePrefix, premise, storyBrief, plotDirection) {
  const create = await authedFetch(page, "/api/projects", {
    method: "POST",
    body: JSON.stringify({
      title: `${titlePrefix} ${Date.now()}`,
      premise,
      genre: "Fantasy",
      tone: "Dangerous, witty, emotional",
      audience: "Adult",
      pointOfView: "Third person limited",
      tense: "Past tense",
      storyBrief,
      plotDirection,
    }),
  });

  const projectId = create.data.projectId;
  let project = (await authedFetch(page, `/api/projects/${projectId}`)).data.project;
  while (project.chapters.length < 3) {
    await authedFetch(page, `/api/projects/${projectId}/chapters`, { method: "POST" });
    project = (await authedFetch(page, `/api/projects/${projectId}`)).data.project;
  }

  return { projectId, project };
}

async function runTest1(page, label) {
  const { projectId, project: initialProject } = await createThreeChapterProject(
    page,
    label,
    "A medieval fantasy kingdom survives through bargains with saints, mercenaries, and rival nobles.",
    "An envoy, a disgraced knight, and a monastery scribe try to prevent civil war through speech, bargaining, and dangerous confessions.",
    "Make it extremely dialogue heavy, commercially gripping, medieval, emotional, and pressure-driven.",
  );

  for (const [index, chapter] of initialProject.chapters.slice(0, 3).entries()) {
    await authedFetch(page, `/api/chapters/${chapter.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: `Chapter ${index + 1}`,
        purpose: "",
        currentBeat: "",
        desiredMood: "medieval fantasy, dialogue-heavy, high pressure",
        outline: "",
        draft: "",
        targetWordCount: 1000,
      }),
    });
  }

  await page.goto(`${base}/projects/${projectId}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Show AI Bar" }).click().catch(() => {});
  const dock = page.locator("#project-copilot-dock");
  await dock.getByRole("button", { name: "Open" }).click().catch(() => {});
  await dock
    .locator("textarea")
    .last()
    .fill(
      "Write the whole book in three chapters. Make it a 3,000 word medieval fantasy that is extremely dialogue heavy. Keep the scenes tense, emotional, commercially sharp, and full of reversals.",
    );
  await dock.getByRole("button", { name: /^Send$/ }).click();
  await sleep(420000);

  const project = (await authedFetch(page, `/api/projects/${projectId}`)).data.project;
  return {
    label,
    type: "test1",
    projectId,
    totalWords: project.chapters.slice(0, 3).reduce((sum, chapter) => sum + wc(chapter.draft), 0),
    chapters: project.chapters.slice(0, 3).map((chapter) => ({
      number: chapter.number,
      title: chapter.title,
      words: wc(chapter.draft),
    })),
  };
}

async function runAssist(page, chapterId, payload) {
  return authedFetch(page, `/api/chapters/${chapterId}/assist`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function applyRun(page, assistRunId, payload) {
  return authedFetch(page, `/api/assist-runs/${assistRunId}/apply`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function runTest2(page, label) {
  const { projectId, project: initialProject } = await createThreeChapterProject(
    page,
    label,
    "A medieval fantasy city survives by negotiation between a crown envoy, a knight, and a monastery scribe.",
    "A diplomacy mission spirals into betrayal and confession.",
    "Make it extremely dialogue heavy, emotionally sharp, and pressure-driven.",
  );

  const seeds = [
    'At the abbey gate, the envoy said, "Open, or let the city hear why you refuse me."',
    'In the archive tower, the scribe whispered, "If I tell you the truth, you will call it treason before dawn."',
    'On the bridge above the market, the knight said, "If one of us kneels now, all three of us live."',
  ];

  for (const [index, chapter] of initialProject.chapters.slice(0, 3).entries()) {
    await authedFetch(page, `/api/chapters/${chapter.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: `Chapter ${index + 1}`,
        draft: seeds[index],
        targetWordCount: 1000,
        desiredMood: "medieval fantasy, dialogue-heavy, high pressure",
        purpose: "Drive the conflict through talk, leverage, and emotional revelation.",
      }),
    });
  }

  let project = (await authedFetch(page, `/api/projects/${projectId}`)).data.project;
  for (const chapter of project.chapters.slice(0, 3)) {
    let draft = chapter.draft;
    const seed = draft;
    const actions = [
      {
        actionType: "EXPAND",
        selectionText: seed,
        instruction: "Expand this into a much fuller opening scene with heavy dialogue, emotional subtext, and medieval fantasy atmosphere.",
        mode: "CO_WRITE",
        role: "COWRITER",
      },
      {
        actionType: "ADD_DIALOGUE",
        selectionText: draft,
        instruction: "Add more direct quoted dialogue, interruptions, and argument without losing continuity.",
        mode: "CO_WRITE",
        role: "COWRITER",
      },
      {
        actionType: "CUSTOM_EDIT",
        selectionText: draft,
        instruction: "Make this more commercially gripping, more emotional, and more pressure-driven while keeping it medieval fantasy and very dialogue-heavy.",
        mode: "CO_WRITE",
        role: "DEVELOPMENTAL_EDITOR",
      },
      {
        actionType: "IMPROVE_PROSE",
        selectionText: draft,
        instruction: "Sharpen the prose while keeping the dialogue dominant and the scene clear.",
        mode: "CO_WRITE",
        role: "DEVELOPMENTAL_EDITOR",
      },
      {
        actionType: "SHARPEN_VOICE",
        selectionText: draft,
        instruction: "Sharpen the voice and give each speaker more distinct rhythm and attitude.",
        mode: "CO_WRITE",
        role: "STORY_DOCTOR",
      },
      {
        actionType: "CONTINUE",
        selectionText: "",
        instruction: "Continue the chapter naturally with lots of dialogue, reversals, and emotional leverage. Do not restart the story.",
        mode: "FULL_AUTHOR",
        role: "GHOSTWRITER",
        beforeSelection: draft.slice(-800),
        afterSelection: "",
      },
    ];

    for (const step of actions) {
      const result = await runAssist(page, chapter.id, {
        ...step,
        contextNote: "Test 2 manuscript-buttons workflow.",
      });
      const runId = result.data.run.id;
      const suggestion = result.data.run.suggestion || "";
      const applyMode = step.actionType === "CONTINUE" ? "append" : "replace-draft";
      await applyRun(page, runId, {
        applyMode,
        actionType: step.actionType,
        selectionText: step.selectionText || "",
        instruction: step.instruction || "",
        contextNote: "Test 2 manuscript-buttons workflow.",
        beforeSelection: step.beforeSelection || "",
        afterSelection: step.afterSelection || "",
        fieldKey: "draft",
        draft,
        content: suggestion,
        selectionStart: 0,
        selectionEnd: draft.length,
      });
      const refreshed = (await authedFetch(page, `/api/projects/${projectId}`)).data.project;
      draft = refreshed.chapters.find((entry) => entry.id === chapter.id).draft;
    }
  }

  project = (await authedFetch(page, `/api/projects/${projectId}`)).data.project;
  return {
    label,
    type: "test2",
    projectId,
    totalWords: project.chapters.slice(0, 3).reduce((sum, chapter) => sum + wc(chapter.draft), 0),
    chapters: project.chapters.slice(0, 3).map((chapter) => ({
      number: chapter.number,
      title: chapter.title,
      words: wc(chapter.draft),
    })),
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.setDefaultTimeout(120000);

  await signIn(page);

  const results = [];
  results.push(await runTest1(page, "Test1-Run1"));
  results.push(await runTest2(page, "Test2-Run1"));
  results.push(await runTest1(page, "Test1-Run2"));
  results.push(await runTest2(page, "Test2-Run2"));

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
