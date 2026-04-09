import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, devices } from "playwright";

const base = process.env.STORYFORGE_BASE_URL ?? "http://localhost:3000";
const authUsername = process.env.STORYFORGE_USERNAME?.trim() ?? "";
const authPassword = process.env.STORYFORGE_PASSWORD?.trim() ?? "";
const exportDir = process.env.STORYFORGE_DOWNLOAD_DIR?.trim() || path.join(process.cwd(), "hosted-exports");

async function pagePause(ms = 500) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableNetworkError(error) {
  const message = String(error?.message ?? error ?? "");
  return [
    "ECONNRESET",
    "ENOTFOUND",
    "ETIMEDOUT",
    "ERR_INTERNET_DISCONNECTED",
    "ERR_NETWORK_IO_SUSPENDED",
    "Timeout",
  ].some((token) => message.includes(token));
}

async function jsClick(locator) {
  await locator.waitFor({ state: "visible", timeout: 30000 });
  await locator.evaluate((node) => node.click());
}

async function openRibbon(page, name) {
  const tab = page.getByTestId("workspace-ribbon-tabs").getByRole("button", { name, exact: true });
  try {
    await tab.click({ timeout: 15000 });
  } catch {
    await jsClick(tab);
  }
  await page.waitForTimeout(200);
}

function ribbonButton(page, label) {
  return page.getByTestId("workspace-ribbon-content").getByRole("button", { name: label, exact: true }).first();
}

async function signInIfNeeded(page) {
  if (!authUsername || !authPassword) {
    return;
  }

  await page.goto(new URL("/sign-in", base).toString(), { waitUntil: "networkidle" });
  if ((await page.locator('a[href="/projects/new"]').count()) > 0) {
    return;
  }
  await page.getByLabel("Username").fill(authUsername);
  await page.getByLabel("Password").fill(authPassword);
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/auth/sign-in") && response.request().method() === "POST", {
      timeout: 30000,
    }),
    page.getByRole("button", { name: "Sign in", exact: true }).click(),
  ]);
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator('a[href="/projects/new"]').first().waitFor({ timeout: 30000 });
}

async function requestJson(api, path, init, timeoutMs = 300000) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await api.fetch(new URL(path, base).toString(), {
        timeout: timeoutMs,
        ...init,
      });
      const text = await response.text();
      if (!text.trim()) {
        throw new Error(`Empty response from ${path} (${response.status})`);
      }

      let payload;
      try {
        payload = JSON.parse(text);
      } catch (error) {
        throw new Error(
          `Non-JSON response from ${path} (${response.status}): ${text.slice(0, 400)}`,
          { cause: error },
        );
      }

      if (!response.ok() || payload.ok === false) {
        const status = response.status();
        const message = payload?.error || `Request failed: ${status}`;
        if (attempt < 3 && (status === 429 || status >= 500)) {
          lastError = new Error(message);
          await pagePause(1500 * (attempt + 1));
          continue;
        }
        throw new Error(message);
      }
      return payload.data;
    } catch (error) {
      lastError = error;
      if (attempt >= 3 || !isRetryableNetworkError(error)) {
        throw error;
      }
      await pagePause(1500 * (attempt + 1));
    }
  }

  throw lastError ?? new Error(`Request failed for ${path}`);
}

async function getProject(api, projectId) {
  const data = await requestJson(api, `/api/projects/${projectId}`);
  return data.project;
}

async function patchProject(api, projectId, patch) {
  const data = await requestJson(api, `/api/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    data: patch,
  });
  return data.project;
}

async function patchChapter(api, chapterId, patch) {
  const data = await requestJson(api, `/api/chapters/${chapterId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    data: patch,
  });
  return data.project;
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function waitForInlinePreview(page, timeout = 240000) {
  await page.getByTestId("inline-ai-preview").waitFor({ timeout });
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "book";
}

async function postJson(api, route, data = {}, timeoutMs = 300000) {
  return requestJson(api, route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    data,
  }, timeoutMs);
}

async function exportProjectFiles(api, projectId, title) {
  await fs.mkdir(exportDir, { recursive: true });
  const slug = slugify(title);
  const formats = [
    ["pdf", "pdf"],
    ["epub", "epub"],
    ["md", "md"],
    ["txt", "txt"],
    ["json", "json"],
  ];
  const saved = [];

  for (const [format, extension] of formats) {
    const response = await api.fetch(new URL(`/api/projects/${projectId}/export?format=${format}`, base).toString(), {
      method: "GET",
      timeout: 180000,
    });
    if (!response.ok()) {
      throw new Error(`Export ${format} failed with status ${response.status()}`);
    }
    const filePath = path.join(exportDir, `${slug}.${extension}`);
    await fs.writeFile(filePath, await response.body());
    saved.push(filePath);
  }

  return saved;
}

async function resolveInlinePreview(page, action = "Accept") {
  const preview = page.getByTestId("inline-ai-preview").last();
  await preview.scrollIntoViewIfNeeded();
  await jsClick(preview.getByRole("button", { name: action, exact: true }).first());
  await preview.waitFor({ state: "detached", timeout: 30000 });
}

async function runGenerateChapterFlow(page) {
  await openRibbon(page, "AI Engine");
  await jsClick(ribbonButton(page, "Generate Chapter"));
  try {
    await waitForInlinePreview(page, 300000);
    await resolveInlinePreview(page, "Accept");
  } catch {
    await pagePause(6000);
  }
}

async function appendContinuation(page) {
  const editor = page.getByTestId("manuscript-editor");
  await editor.waitFor({ timeout: 30000 });
  await editor.evaluate((node) => {
    node.focus();
    if (typeof node.value === "string") {
      const cursor = node.value.length;
      node.setSelectionRange(cursor, cursor);
    }
  });

  await editor.click({ button: "right", force: true, position: { x: 80, y: 60 } });
  const menu = page.getByTestId("chapter-context-menu").last();
  await menu.waitFor({ timeout: 10000 });
  await jsClick(menu.getByRole("button", { name: "Continue from cursor", exact: true }).first());
  await waitForInlinePreview(page, 300000);
  await resolveInlinePreview(page, "Accept");
}

async function topUpChapterToMinimum(page, projectId, chapterIndex, minimumWords, maxAttempts = 3) {
  const api = page.context().request;
  let project = await getProject(api, projectId);
  let words = countWords(project.chapters[chapterIndex]?.draft || "");

  for (let attempt = 0; attempt < maxAttempts && words < minimumWords; attempt += 1) {
    await switchToChapter(page, chapterIndex);
    await appendContinuation(page);
    project = await getProject(api, projectId);
    words = countWords(project.chapters[chapterIndex]?.draft || "");
  }

  return { project, words };
}

async function createProject(page) {
  const title = `Harrow Pines ${Date.now()}`;
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator('a[href="/projects/new"]').first().click();
  await page.waitForURL(/\/projects\/new/, { timeout: 30000 });

  await page.getByPlaceholder("The Glass Meridian").fill(title);
  await page.getByPlaceholder("A mapmaker races a self-censoring oracle.").fill(
    "A forensic pathologist and a deputy sheriff chase a killer through a wet timber town where every suspect seems ready to break the case open before the evidence turns."
  );
  await page.getByPlaceholder("What is the story fundamentally about?").fill(
    "In a logging town hollowed out by layoffs and flood damage, Dr. Mara Sloane is called to examine a body found in a stand of pines. Every forensic finding points toward an obvious suspect, but each apparent answer collapses under better evidence, forcing Mara and deputy Eli Voss to navigate grief, corruption, and a staged sequence of clues meant to waste time."
  );
  await page.getByPlaceholder("Who is the protagonist, what is changing, and what is the fundamental conflict?").fill(
    "Mara Sloane is a forensic pathologist who trusts evidence more than people. She returns to field work after a failed testimony scandal and has to learn that truth arrives through frightened witnesses, compromised institutions, and human motives as much as through lab certainty. The central conflict is between the killer's careful manipulation of suspicion and Mara's need to prove that the dead can still speak accurately."
  );
  await page.getByPlaceholder("Escalate the mystery, deepen the romance, land on a costly reveal...").fill(
    "Make this a tight, page-turning forensic mystery novella with escalating false leads, crisp chapter endings, grounded investigation, and a final reveal that feels inevitable in hindsight. Keep it around two thousand words total, in three short chapters, with each chapter ending on a hook and no repetitive scenes."
  );

  await jsClick(page.getByRole("button", { name: "Create Project", exact: true }));
  await page.waitForURL(/\/projects\/(?!new)/, { timeout: 30000 });
  await page.waitForLoadState("networkidle");

  const projectId = page.url().split("/projects/")[1];
  return { title, projectId, projectUrl: page.url() };
}

async function configureBookPlan(page, projectId) {
  const api = page.context().request;
  let project = await getProject(api, projectId);
  project = await patchProject(api, projectId, {
    bookSettings: {
      ...project.bookSettings,
      authorName: "Michael William Polevoy",
      targetBookLength: 2000,
      targetChapterLength: 667,
    },
  });

  await openRibbon(page, "Edit");
  await jsClick(ribbonButton(page, "Story Skeleton"));
  await page.getByRole("heading", { name: "Story Skeleton", exact: true }).waitFor({ timeout: 30000 });

  const planner = page.getByRole("heading", { name: "Book length planner", exact: true }).locator("../../..");
  const plannerInputs = planner.locator('input[type="number"]');
  await plannerInputs.nth(0).fill("2000");
  await plannerInputs.nth(1).fill("3");
  await jsClick(page.getByRole("button", { name: "Apply book plan", exact: true }));
  await pagePause(2000);

  project = await getProject(api, projectId);
  assert.equal(project.chapters.length, 3, "Book planner did not produce 3 chapters");

  const chapterPlans = [
    {
      title: "The Body in the Pines",
      purpose:
        "Introduce Mara Sloane, the corpse in the woods, and the first suspect while making the crime scene feel immediate and concrete.",
      currentBeat:
        "The body is found near an old flood marker. Mara notices deliberate staging around the victim's hands and a false trail toward the victim's estranged brother.",
      desiredMood: "Cold rain, muddy detail, professional tension, fear under control.",
      outline:
        "Open with dawn callout. Crime scene work in the rain. Deputy Eli Voss briefs Mara. Early forensic details point toward family violence. End on discovery that the victim was moved after death.",
    },
    {
      title: "The Brother with No Blood",
      purpose:
        "Drive the investigation into the obvious suspect, then clear him with a sharper layer of forensic evidence.",
      currentBeat:
        "Mara and Eli lean hard on the brother, only to realize the blood pattern on his clothes was planted from stored butcher waste rather than the victim.",
      desiredMood: "Claustrophobic interviews, sharp forensic reversals, mounting public pressure.",
      outline:
        "Interrogate the brother. Compare blood chemistry and tissue fragments. Let town gossip flare. Clear the brother publicly. End on a trace fiber that leads back to a respected civic donor.",
    },
    {
      title: "Ash Under the Nails",
      purpose:
        "Close the loop with a final forensic twist, expose the real killer, and land on a satisfying but morally bruised ending.",
      currentBeat:
        "Mara discovers kiln ash and resin in the victim's nail scrapings and proves the killer staged the body using flood debris to imitate an older unsolved murder.",
      desiredMood: "Breathless, precise, morally grim, with a final controlled release of truth.",
      outline:
        "Trace kiln ash to a charity restoration workshop. Reveal motive tied to embezzlement and accidental witness. Force a confession through physical evidence and timing. End with the dead identified correctly and the town left changed.",
    },
  ];

  for (let index = 0; index < 3; index += 1) {
    const chapter = project.chapters[index];
    await patchChapter(api, chapter.id, {
      ...chapterPlans[index],
      targetWordCount: 667,
    });
  }

  await page.reload({ waitUntil: "networkidle" });
  await openRibbon(page, "Edit");
  await jsClick(ribbonButton(page, "Story Skeleton"));
  await page.getByRole("heading", { name: "Story Skeleton", exact: true }).waitFor({ timeout: 30000 });
}

async function generateChapterOne(page, projectId) {
  await openRibbon(page, "View");
  await jsClick(ribbonButton(page, "Writing View"));
  await page.getByTestId("manuscript-editor").waitFor({ timeout: 30000 });

  await openRibbon(page, "AI Engine");
  await jsClick(ribbonButton(page, "Generate Outline"));
  await pagePause(7000);

  await openRibbon(page, "AI Engine");
  await runGenerateChapterFlow(page);
  await topUpChapterToMinimum(page, projectId, 0, 520, 3);
}

async function switchToChapter(page, index) {
  await openRibbon(page, "View");
  const chapterToggle = ribbonButton(page, "Show Chapters");
  if ((await chapterToggle.count()) > 0) {
    await jsClick(chapterToggle);
  }
  const sidebar = page.locator("aside");
  await sidebar.waitFor({ timeout: 20000 });
  await jsClick(sidebar.getByTestId("sidebar-chapter-button").nth(index));
  await pagePause(1200);
}

async function writeRemainingBook(page, projectId) {
  const api = page.context().request;
  let project = await getProject(api, projectId);

  for (let index = 1; index < project.chapters.length; index += 1) {
    await switchToChapter(page, index);
    await runGenerateChapterFlow(page);
    project = await getProject(api, projectId);

    if (countWords(project.chapters[index].draft || "") < 220) {
      await runGenerateChapterFlow(page);
      project = await getProject(api, projectId);
    }

    if (countWords(project.chapters[index].draft || "") < 520) {
      ({ project } = await topUpChapterToMinimum(page, projectId, index, 520, 2));
    }
  }
}

async function runReviewAndExport(page, projectId) {
  const api = page.context().request;
  const project = await getProject(api, projectId);

  for (const chapter of project.chapters) {
    await postJson(api, `/api/chapters/${chapter.id}/sync`);
    await postJson(api, `/api/chapters/${chapter.id}/summary`);
    await postJson(api, `/api/chapters/${chapter.id}/extract-memory`);
    await postJson(api, `/api/chapters/${chapter.id}/continuity`, { mode: "CHAPTER" });
  }

  await postJson(api, `/api/projects/${projectId}/sync`);
  return exportProjectFiles(api, projectId, project.title);
}

async function verifyDesktopBook(page, projectId) {
  const api = page.context().request;
  let project = await getProject(api, projectId);
  let totalWords = project.chapters.reduce((sum, chapter) => sum + countWords(chapter.draft || ""), 0);

  for (let attempt = 0; attempt < 8 && totalWords < 2000; attempt += 1) {
    const weakestChapterIndex = project.chapters.reduce(
      (best, chapter, index, all) =>
        countWords(chapter.draft || "") < countWords(all[best].draft || "") ? index : best,
      0,
    );
    await switchToChapter(page, weakestChapterIndex);
    await appendContinuation(page);
    project = await getProject(api, projectId);
    totalWords = project.chapters.reduce((sum, chapter) => sum + countWords(chapter.draft || ""), 0);
  }

  if (totalWords < 2000) {
    throw new Error(`Book draft too short after generation: ${totalWords} words`);
  }
  return totalWords;
}

async function runMobilePass(projectUrl, descriptor, assistantPrompt) {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ ...descriptor });
  const page = await context.newPage();
  try {
    await signInIfNeeded(page);
    await page.goto(projectUrl, { waitUntil: "networkidle" });
    await page.waitForLoadState("networkidle");
    await openRibbon(page, "View");
    const showAi = page.getByTestId("workspace-ribbon-content").getByRole("button", { name: "Show AI Bar", exact: true });
    const hideAi = page.getByTestId("workspace-ribbon-content").getByRole("button", { name: "Hide AI Bar", exact: true });
    if ((await showAi.count()) > 0) {
      await jsClick(showAi.first());
    } else if ((await hideAi.count()) === 0) {
      throw new Error("Mobile layout could not find the AI bar toggle.");
    }

    const dock = page.locator("#project-copilot-dock");
    const openButton = dock.getByRole("button", { name: "Open", exact: true });
    if ((await openButton.count()) > 0) {
      await jsClick(openButton.first());
    }

    await page.getByRole("heading", { name: "Talk to The Book Author", exact: true }).waitFor({ timeout: 30000 });
    const adviceOnly = page.getByLabel("Let The Book Author implement direct changes");
    if (await adviceOnly.count()) {
      await adviceOnly.evaluate((node) => {
        node.checked = false;
        node.dispatchEvent(new Event("input", { bubbles: true }));
        node.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
    await dock
      .getByPlaceholder(/Explain a scene problem, ask for stronger options, or tell The Book Author what to update\./i)
      .fill(assistantPrompt);
    await jsClick(dock.getByRole("button", { name: "Send", exact: true }));
    await pagePause(3000);

    await openRibbon(page, "View");
    const showOutline = page.getByTestId("workspace-ribbon-content").getByRole("button", { name: /Show Outline|Hide Outline/, exact: false }).first();
    await jsClick(showOutline);
    const outlineToggle = page.getByRole("button", { name: /Open outline|Hide outline/, exact: false }).first();
    if (await outlineToggle.count()) {
      await jsClick(outlineToggle);
    }

    const showPlanning = page.getByTestId("workspace-ribbon-content").getByRole("button", { name: /Show Planning|Hide Planning/, exact: false }).first();
    await jsClick(showPlanning);
    const planningToggle = page.getByRole("button", { name: /Open planning|Hide planning/, exact: false }).first();
    if (await planningToggle.count()) {
      await jsClick(planningToggle);
    }

    const openManuscript = page.getByRole("button", { name: "Open manuscript editor", exact: true });
    if ((await openManuscript.count()) > 0) {
      await jsClick(openManuscript.first());
    }
    await page.getByTestId("manuscript-editor").waitFor({ timeout: 30000 });
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();

  page.on("pageerror", (error) => console.error("PAGEERROR", error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      console.error("BROWSER_CONSOLE", message.text());
    }
  });

  try {
    const resumeProjectId = process.env.STORYFORGE_PROJECT_ID?.trim() ?? "";
    const resumeOnly = process.env.STORYFORGE_RESUME_ONLY === "1";

    let title;
    let projectId;
    let projectUrl;

    await signInIfNeeded(page);

    if (resumeProjectId) {
      projectId = resumeProjectId;
      projectUrl = `${base}/projects/${projectId}`;
      const project = await getProject(page.context().request, projectId);
      title = project.title;
      await page.goto(projectUrl, { waitUntil: "networkidle" });
      console.log(`Resuming project ${title} (${projectId})`);
    } else {
      ({ title, projectId, projectUrl } = await createProject(page));
      console.log(`Created project ${title} (${projectId})`);
    }

    if (!resumeOnly) {
      await configureBookPlan(page, projectId);
      console.log("Configured 2,000-word / 3-chapter plan");

      await generateChapterOne(page, projectId);
      console.log("Generated chapter 1 through the desktop UI");

      await writeRemainingBook(page, projectId);
      console.log("Built the rest of the book through the live writing APIs");
    }

    const totalWords = await verifyDesktopBook(page, projectId);
    const exportPaths = await runReviewAndExport(page, projectId);
    console.log(`Desktop flow complete, total words: ${totalWords}`);

    await runMobilePass(projectUrl, devices["iPhone 14"], "Give two short drafting tips for keeping the mystery tense on a phone-sized screen.");
    console.log("iPhone-sized flow verified");

    await runMobilePass(projectUrl, devices["Pixel 7"], "Give two short planning tips for keeping chapter outlines focused while drafting on mobile.");
    console.log("Android-sized flow verified");

    console.log(JSON.stringify({ ok: true, projectId, projectUrl, title, totalWords, exportPaths }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error("REAL_BOOK_FLOW_FAIL");
  console.error(error);
  process.exit(1);
});
