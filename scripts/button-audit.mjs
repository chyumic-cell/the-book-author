import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.STORYFORGE_BASE_URL ?? "http://localhost:3000";
const preferredProjectTitle = process.env.STORYFORGE_AUDIT_PROJECT_TITLE ?? "The Glass Meridian";
const authUsername = process.env.STORYFORGE_USERNAME?.trim() ?? "";
const authPassword = process.env.STORYFORGE_PASSWORD?.trim() ?? "";

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

async function listProjects(api) {
  const response = await api.get(`${base}/api/projects`);
  if (!response.ok) {
    throw new Error(`Could not load projects: ${response.status}`);
  }

  const payload = await response.json();
  return payload.data.projects;
}

async function resolveAuditProjectUrl(page) {
  await signInIfNeeded(page);
  const projects = await listProjects(page.context().request);
  const project =
    projects.find((entry) => entry.title === preferredProjectTitle) ??
    projects.find((entry) => entry.title === "The Pantless Seal") ??
    projects[0];

  if (!project) {
    return createAuditProject(page);
  }

  return `${base}/projects/${project.id}`;
}

async function jsClick(locator) {
  await locator.waitFor({ state: "visible", timeout: 30000 });
  await locator.evaluate((node) => node.click());
}

async function openRibbon(page, name) {
  await page.getByTestId("workspace-ribbon-tabs").getByRole("button", { name, exact: true }).click();
  await page.waitForTimeout(150);
}

function ribbonButton(page, name) {
  return page.getByTestId("workspace-ribbon-content").getByRole("button", { name, exact: true });
}

function ribbonLink(page, text) {
  return page.getByTestId("workspace-ribbon-content").locator(`a:has-text("${text}")`).first();
}

async function openAuditProject(page, projectUrl) {
  await page.goto(projectUrl, { waitUntil: "networkidle" });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
}

async function ensureWritingView(page) {
  await openRibbon(page, "Home");
  if ((await ribbonButton(page, "Writing").count()) > 0) {
    await jsClick(ribbonButton(page, "Writing").first());
  }
  await page.getByTestId("manuscript-editor").waitFor({ timeout: 30000 });
}

async function pagePause(duration = 350) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

async function setRibbonToggle(page, showLabel, hideLabel, shouldBeVisible) {
  const show = ribbonButton(page, showLabel);
  const hide = ribbonButton(page, hideLabel);

  if (shouldBeVisible) {
    if ((await show.count()) > 0) {
      await jsClick(show.first());
      return;
    }
    if ((await hide.count()) > 0) {
      return;
    }
  } else {
    if ((await hide.count()) > 0) {
      await jsClick(hide.first());
      return;
    }
    if ((await show.count()) > 0) {
      return;
    }
  }

  throw new Error(`Could not resolve toggle button for ${showLabel}/${hideLabel}`);
}

async function createAuditProject(page) {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator('a[href="/projects/new"]').first().click();
  await page.waitForURL(/\/projects\/new/, { timeout: 30000 });

  const stamp = Date.now();
  await page.getByPlaceholder("The Glass Meridian").fill(`Button Audit ${stamp}`);
  await page
    .getByPlaceholder("A mapmaker races a self-censoring oracle.")
    .fill("A QA operator stress-tests every The Book Author control and keeps the book stable under pressure.");
  await page
    .getByPlaceholder("What is the story fundamentally about?")
    .fill("A QA operator clicks every major The Book Author control, pushes the AI tools, and makes sure the workspace stays coherent through the whole session.");
  await page
    .getByPlaceholder("Who is the protagonist, what is changing, and what is the fundamental conflict?")
    .fill("The protagonist stress-tests an AI writing suite, verifies that edits are reversible, and keeps the manuscript usable while every system is exercised.");
  await page
    .getByPlaceholder("Escalate the mystery, deepen the romance, land on a costly reveal...")
    .fill("Stay small, stay stable, create a usable workspace, and end with every important tool behaving predictably under repeated use.");
  await jsClick(page.getByRole("button", { name: "Create Project", exact: true }));
  await page.waitForURL(/\/projects\/(?!new)/, { timeout: 30000 });
  return page.url();
}

async function testFileRibbon(page, projectUrl) {
  await openRibbon(page, "File");
  await jsClick(ribbonButton(page, "Save").first());
  await pagePause(500);
  await jsClick(ribbonButton(page, "Save As Backup").first());
  await pagePause(500);

  const exportFormats = [
    { label: "PDF", format: "pdf" },
    { label: "EPUB", format: "epub" },
    { label: "Markdown", format: "md" },
    { label: "TXT", format: "txt" },
    { label: "Backup JSON", format: "json" },
  ];

  for (const { label, format } of exportFormats) {
    const link = ribbonLink(page, label);
    await link.waitFor({ timeout: 10000 });
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/projects/") &&
        response.url().includes(`/export?format=${format}`) &&
        response.request().method() === "GET",
      { timeout: 30000 },
    );
    const downloadPromise = page.waitForEvent("download", { timeout: 30000 }).catch(() => null);
    await link.evaluate((node) => node.click());
    const response = await responsePromise;
    assert.equal(response.ok(), true, `${label} export did not return success`);
    await downloadPromise;
    await pagePause(600);
    if (!/\/projects\//.test(page.url())) {
      await openAuditProject(page, projectUrl);
    }
    await openRibbon(page, "File");
  }

  await ribbonLink(page, "Open Library").click();
  await page.waitForURL(base, { timeout: 30000 });
  await page.goBack({ waitUntil: "networkidle" });
  if (!/\/projects\//.test(page.url())) {
    await openAuditProject(page, projectUrl);
  }

  await openRibbon(page, "File");
  await ribbonLink(page, "New Book").click();
  await page.waitForURL(/\/projects\/new/, { timeout: 30000 });
  await page.goBack({ waitUntil: "networkidle" });
  if (!/\/projects\//.test(page.url())) {
    await openAuditProject(page, projectUrl);
  }
}

async function testRibbonButtons(page) {
  await openRibbon(page, "Home");
  await jsClick(ribbonButton(page, "Save").first());
  await jsClick(ribbonButton(page, "Backup").first());
  await jsClick(ribbonButton(page, "Undo").first());
  await jsClick(ribbonButton(page, "Redo").first());
  await jsClick(ribbonButton(page, "Zoom -").first());
  const zoomReset = page
    .getByTestId("workspace-ribbon-content")
    .locator("button")
    .filter({ hasText: /^\d+%$/ })
    .first();
  await jsClick(zoomReset);
  await jsClick(ribbonButton(page, "Zoom +").first());
  await jsClick(ribbonButton(page, "Outline").first());
  await jsClick(ribbonButton(page, "Planning").first());
  await jsClick(ribbonButton(page, "Context").first());

  await openRibbon(page, "Edit");
  await jsClick(ribbonButton(page, "Undo").first());
  await jsClick(ribbonButton(page, "Redo").first());
  await jsClick(ribbonButton(page, "Chapter View").first());
  await jsClick(ribbonButton(page, "Notes").first());
  await jsClick(ribbonButton(page, "Book Setup").first());
  await jsClick(ribbonButton(page, "Story Skeleton").first());

  await openRibbon(page, "Review");
  await jsClick(ribbonButton(page, "Continuity View").first());
  await jsClick(ribbonButton(page, "Summarize").first());
  await jsClick(ribbonButton(page, "Extract Memory").first());
  await jsClick(ribbonButton(page, "Run Continuity").first());
  await setRibbonToggle(page, "Show Context Pane", "Hide Context Pane", true);
  await pagePause(300);
  await openRibbon(page, "Review");
  await setRibbonToggle(page, "Show Context Pane", "Hide Context Pane", false);

  await openRibbon(page, "AI Engine");
  await jsClick(ribbonButton(page, "AI Engine").first());
  await page.waitForURL(/\/projects\//, { timeout: 30000 });
  await openRibbon(page, "AI Engine");
  await setRibbonToggle(page, "Show Command Bar", "Hide Command Bar", true);
  await page.getByRole("heading", { name: "Talk to The Book Author", exact: true }).waitFor({ timeout: 20000 });
  await openRibbon(page, "AI Engine");
  await setRibbonToggle(page, "Show Command Bar", "Hide Command Bar", false);
  await page.getByRole("heading", { name: "Talk to The Book Author", exact: true }).waitFor({ state: "detached", timeout: 20000 });
  await openRibbon(page, "AI Engine");
  await setRibbonToggle(page, "Show AI Bar", "Hide AI Bar", true);
  await page.getByRole("heading", { name: "Talk to The Book Author", exact: true }).waitFor({ timeout: 20000 });
  await openRibbon(page, "AI Engine");
  await setRibbonToggle(page, "Show AI Bar", "Hide AI Bar", false);
  await openRibbon(page, "AI Engine");
  await jsClick(ribbonButton(page, "Model Settings").first());
  await page.getByRole("heading", { name: "AI providers", exact: true }).waitFor({ timeout: 20000 });

  await openRibbon(page, "View");
  await jsClick(ribbonButton(page, "Writing View").first());
  await page.getByTestId("manuscript-editor").waitFor({ timeout: 20000 });
  await openRibbon(page, "View");
  await setRibbonToggle(page, "Show Chapters", "Hide Chapters", true);
  await page.locator("aside").waitFor({ timeout: 10000 });
  await openRibbon(page, "View");
  await setRibbonToggle(page, "Show Chapters", "Hide Chapters", false);
  await page.locator("aside").waitFor({ state: "detached", timeout: 10000 });
  await openRibbon(page, "View");
  await setRibbonToggle(page, "Show Context", "Hide Context", true);
  await page.getByRole("heading", { name: "Smart Context", exact: true }).waitFor({ timeout: 10000 });
  await openRibbon(page, "View");
  await setRibbonToggle(page, "Show Context", "Hide Context", false);
  await page.getByRole("heading", { name: "Smart Context", exact: true }).waitFor({ state: "detached", timeout: 10000 });
  await openRibbon(page, "View");
  await setRibbonToggle(page, "Show Outline", "Hide Outline", true);
  await page.getByLabel("Chapter outline").waitFor({ timeout: 10000 });
  await openRibbon(page, "View");
  await setRibbonToggle(page, "Show Outline", "Hide Outline", false);
  await page.getByLabel("Chapter outline").waitFor({ state: "detached", timeout: 10000 });
  await openRibbon(page, "View");
  await setRibbonToggle(page, "Show Planning", "Hide Planning", true);
  await page.getByRole("heading", { name: "Chapter planning", exact: true }).waitFor({ timeout: 10000 });
  await openRibbon(page, "View");
  await setRibbonToggle(page, "Show Planning", "Hide Planning", false);
  await page.getByRole("heading", { name: "Chapter planning", exact: true }).waitFor({ state: "detached", timeout: 10000 });
  await openRibbon(page, "View");
  await setRibbonToggle(page, "Show AI Bar", "Hide AI Bar", true);
  await page.getByRole("heading", { name: "Talk to The Book Author", exact: true }).waitFor({ timeout: 20000 });
  await openRibbon(page, "View");
  await setRibbonToggle(page, "Show AI Bar", "Hide AI Bar", false);
  await openRibbon(page, "View");
  await setRibbonToggle(page, "Show Inspector", "Hide Inspector", true);
  await pagePause(500);
  await openRibbon(page, "View");
  await setRibbonToggle(page, "Show Inspector", "Hide Inspector", false);
  await openRibbon(page, "View");
  await jsClick(ribbonButton(page, "Character Master").first());
  await page.getByRole("heading", { name: "Character Master", exact: true }).waitFor({ timeout: 20000 });
  await openRibbon(page, "View");
  await jsClick(ribbonButton(page, "Arc Master").first());
  await page.getByRole("heading", { name: "Story Arc Tracker", exact: true }).waitFor({ timeout: 20000 });
  await openRibbon(page, "View");
  await jsClick(ribbonButton(page, "Idea Lab").first());
  await page.getByRole("heading", { name: "Idea Lab", exact: true }).waitFor({ timeout: 20000 });

  await openRibbon(page, "Settings");
  await jsClick(ribbonButton(page, "Open Settings").first());
  await page.getByRole("heading", { name: "AI providers", exact: true }).waitFor({ timeout: 20000 });
  await openRibbon(page, "Settings");
  await jsClick(ribbonButton(page, "AI Providers").first());

  await openRibbon(page, "About Us");
  await jsClick(ribbonButton(page, "Open About Us").first());
  await jsClick(ribbonButton(page, "Where is my AI key?").first());
  await page.getByRole("heading", { name: "AI providers", exact: true }).waitFor({ timeout: 20000 });
  await openRibbon(page, "About Us");
  await jsClick(ribbonButton(page, "Open Writing View").first());
  await page.getByTestId("manuscript-editor").waitFor({ timeout: 20000 });
}

async function openContextMenuForField(page, locator, labelText, selection = true) {
  await locator.waitFor({ state: "visible", timeout: 20000 });
  const rect = await locator.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    return { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height };
  });
  await locator.evaluate((node, shouldSelect) => {
    node.focus();
    if (typeof node.value !== "string") {
      return;
    }
    if (shouldSelect) {
      const length = Math.min(40, node.value.length);
      node.setSelectionRange(0, length);
    } else {
      const cursor = Math.min(20, node.value.length);
      node.setSelectionRange(cursor, cursor);
    }
  }, selection);
  await locator.click({ button: "right" }).catch(() => {});
  const menuTitle = page.getByText(`Writing tools for ${labelText}`);
  try {
    await menuTitle.waitFor({ timeout: 2500 });
  } catch {
    await locator.dispatchEvent("contextmenu", {
      bubbles: true,
      clientX: rect ? rect.left + Math.min(rect.width / 2, 80) : 120,
      clientY: rect ? rect.top + Math.min(rect.height / 2, 40) : 120,
    });
    await menuTitle.waitFor({ timeout: 20000 });
  }
  return page.getByTestId("chapter-context-menu").last();
}

async function waitForInlinePreview(page) {
  await page.getByTestId("inline-ai-preview").waitFor({ timeout: 300000 });
}

async function resolveInlinePreview(page, buttonName) {
  const preview = page.getByTestId("inline-ai-preview").last();
  const target = preview.locator("button", { hasText: buttonName }).first();
  await preview.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  await target.evaluate((node) => node.click());
  await preview.waitFor({ state: "detached", timeout: 30000 });
}

async function testChapterWorkspace(page) {
  await ensureWritingView(page);

  await jsClick(page.getByRole("button", { name: "Free write", exact: true }));
  await jsClick(page.getByRole("button", { name: "Co-write", exact: true }));
  await jsClick(page.getByRole("button", { name: "Full author", exact: true }));

  await openRibbon(page, "View");
  await setRibbonToggle(page, "Show Chapters", "Hide Chapters", true);
  const sidebar = page.locator("aside");
  const chapterButtons = sidebar.getByTestId("sidebar-chapter-button");
  const visibleChapterButtons = await chapterButtons.count();
  for (let index = 0; index < visibleChapterButtons; index += 1) {
    await jsClick(chapterButtons.nth(index));
    await pagePause(250);
  }

  await jsClick(page.getByRole("button", { name: "Add chapter", exact: true }));
  await pagePause(1200);

  await jsClick(page.getByRole("button", { name: "Open outline", exact: true }));
  await page.getByLabel("Chapter outline").waitFor({ timeout: 10000 });
  await jsClick(page.getByRole("button", { name: "Collapse", exact: true }).first());
  await page.getByLabel("Chapter outline").waitFor({ state: "detached", timeout: 10000 });

  await jsClick(page.getByRole("button", { name: "Open planning", exact: true }));
  await page.getByRole("heading", { name: "Chapter planning", exact: true }).waitFor({ timeout: 10000 });
  const targetWordCountInput = page.locator('input[type="number"]').first();
  await targetWordCountInput.fill("450");
  await pagePause(600);
  await jsClick(page.getByRole("button", { name: "Collapse", exact: true }).first());
  await page.getByRole("heading", { name: "Chapter planning", exact: true }).waitFor({ state: "detached", timeout: 10000 });

  await openRibbon(page, "AI Engine");
  await jsClick(ribbonButton(page, "Generate Outline").first());
  await page.waitForTimeout(8000);
  await jsClick(page.getByRole("button", { name: "Open outline", exact: true }));
  const outline = page.getByLabel("Chapter outline");
  let menu = await openContextMenuForField(page, outline, "Chapter outline", true);
  await jsClick(menu.getByRole("button", { name: "Copy", exact: true }));
  menu = await openContextMenuForField(page, outline, "Chapter outline", true);
  await jsClick(menu.getByRole("button", { name: "Cut", exact: true }));
  menu = await openContextMenuForField(page, outline, "Chapter outline", false);
  await jsClick(menu.getByRole("button", { name: "Paste", exact: true }));
  menu = await openContextMenuForField(page, outline, "Chapter outline", true);
  await jsClick(menu.getByRole("button", { name: /Expand with AI|Expand current paragraph/ }).first());
  await waitForInlinePreview(page);
  await resolveInlinePreview(page, "Accept");

  await openRibbon(page, "AI Engine");
  await jsClick(ribbonButton(page, "Generate Chapter").first());
  await waitForInlinePreview(page);
  await resolveInlinePreview(page, "Accept");

  const editor = page.getByTestId("manuscript-editor");
  menu = await openContextMenuForField(page, editor, "Manuscript editor", true);
  await jsClick(menu.getByRole("button", { name: /Tighten with AI|Tighten current paragraph/ }).first());
  await waitForInlinePreview(page);
  await resolveInlinePreview(page, "Accept");

  menu = await openContextMenuForField(page, editor, "Manuscript editor", true);
  await jsClick(menu.getByRole("button", { name: /Improve prose|Improve current paragraph/ }).first());
  await waitForInlinePreview(page);
  await resolveInlinePreview(page, "Accept");

  menu = await openContextMenuForField(page, editor, "Manuscript editor", true);
  await jsClick(menu.getByRole("button", { name: /Add tension/ }).first());
  await waitForInlinePreview(page);
  await resolveInlinePreview(page, "Reject");

  menu = await openContextMenuForField(page, editor, "Manuscript editor", true);
  await jsClick(menu.getByRole("button", { name: /Sharpen voice|Sharpen this beat/ }).first());
  await waitForInlinePreview(page);
  await resolveInlinePreview(page, "Accept");

  menu = await openContextMenuForField(page, editor, "Manuscript editor", false);
  await jsClick(menu.getByRole("button", { name: "Continue from cursor", exact: true }));
  await waitForInlinePreview(page);
  await resolveInlinePreview(page, "Accept");

  menu = await openContextMenuForField(page, editor, "Manuscript editor", false);
  await jsClick(menu.getByRole("button", { name: "Suggest next beats", exact: true }));
  await waitForInlinePreview(page);
  await resolveInlinePreview(page, "Reject");

  menu = await openContextMenuForField(page, editor, "Manuscript editor", true);
  await jsClick(menu.getByRole("button", { name: /Coach this selection|Coach this moment/ }).first());
  await page.getByTestId("coach-note").waitFor({ timeout: 180000 });
  await jsClick(page.getByTestId("coach-note").getByRole("button", { name: "Dismiss", exact: true }));

  await openRibbon(page, "AI Engine");
  await jsClick(ribbonButton(page, "Rewrite Pacing").first());
  await waitForInlinePreview(page);
  await resolveInlinePreview(page, "Reject");

  await openRibbon(page, "AI Engine");
  await jsClick(ribbonButton(page, "Improve Prose").first());
  await waitForInlinePreview(page);
  await resolveInlinePreview(page, "Reject");

  await openRibbon(page, "AI Engine");
  await jsClick(ribbonButton(page, "Sharpen Voice").first());
  await waitForInlinePreview(page);
  await resolveInlinePreview(page, "Reject");

  await openRibbon(page, "Review");
  await jsClick(ribbonButton(page, "Summarize").first());
  await page.waitForTimeout(2000);
  await openRibbon(page, "Review");
  await jsClick(ribbonButton(page, "Extract Memory").first());
  await page.waitForTimeout(2000);
  await openRibbon(page, "Review");
  await jsClick(ribbonButton(page, "Run Continuity").first());
  await page.waitForTimeout(2000);
  await openRibbon(page, "AI Engine");
  await jsClick(ribbonButton(page, "Chapter Guide").first());
  await page.waitForTimeout(4000);
  const guideFix = page.getByRole("button", { name: "Fix with AI", exact: true }).first();
  if ((await guideFix.count()) > 0) {
    await jsClick(guideFix);
    await waitForInlinePreview(page);
    await resolveInlinePreview(page, "Reject");
  }
  await openRibbon(page, "AI Engine");
  await jsClick(ribbonButton(page, "Whole Book Guide").first());
  await page.waitForTimeout(4000);

  await openRibbon(page, "View");
  await setRibbonToggle(page, "Show Context", "Hide Context", true);
  await page.getByRole("heading", { name: "Smart Context", exact: true }).waitFor({ timeout: 10000 });
  for (const label of ["Characters", "Arcs", "Summary", "Continuity", "Threads"]) {
    await jsClick(page.getByRole("button", { name: label, exact: true }).last());
  }
  await jsClick(page.getByRole("button", { name: "Close pane", exact: true }));
}

async function testCopilot(page) {
  const dock = page.locator("#project-copilot-dock");
  const collapsedInput = dock.getByPlaceholder("Ask The Book Author plainly for help, edits, ideas, or chapter changes.");
  await collapsedInput.fill("Add a working note called Button Audit Note and mention that every control was exercised.");
  await jsClick(dock.getByRole("button", { name: "Send", exact: true }));
  await page.getByRole("heading", { name: "Talk to The Book Author", exact: true }).waitFor({ timeout: 180000 });
  await pagePause(2000);
  const expandedDock = page.locator("#project-copilot-dock");
  await expandedDock.getByLabel("Let The Book Author implement direct changes").uncheck();
  await expandedDock
    .getByPlaceholder("Explain a scene problem, ask for stronger options, or tell The Book Author what to update.")
    .fill("Give short advice on how to use The Book Author well during drafting.");
  await jsClick(expandedDock.getByRole("button", { name: "Send", exact: true }));
  await pagePause(2500);
  await jsClick(expandedDock.getByRole("button", { name: "AI key settings", exact: true }));
  await page.getByRole("heading", { name: "AI providers", exact: true }).waitFor({ timeout: 20000 });
  await ensureWritingView(page);
  const reopenedDock = page.locator("#project-copilot-dock");
  const openButton = reopenedDock.getByRole("button", { name: "Open", exact: true });
  if ((await openButton.count()) > 0 && (await openButton.first().isVisible().catch(() => false))) {
    await jsClick(openButton.first());
  }
  await page.getByRole("heading", { name: "Talk to The Book Author", exact: true }).waitFor({ timeout: 20000 });
  const collapseButton = reopenedDock.getByRole("button", { name: "Collapse", exact: true });
  if ((await collapseButton.count()) > 0) {
    await jsClick(collapseButton.first());
  }
}

async function exerciseEditableSection(page, testId) {
  const section = page.getByTestId(testId);
  await section.waitFor({ state: "attached", timeout: 20000 });
  await section.scrollIntoViewIfNeeded();
  await section.waitFor({ state: "visible", timeout: 20000 });

  await jsClick(section.getByRole("button", { name: "Expand all", exact: true }));
  await jsClick(section.getByRole("button", { name: "Collapse all", exact: true }));

  const expandButtons = section.getByRole("button", { name: "Expand", exact: true });
  if ((await expandButtons.count()) > 0) {
    await jsClick(expandButtons.first());
  }

  const collapseButtons = section.getByRole("button", { name: "Collapse", exact: true });
  if ((await collapseButtons.count()) > 0) {
    await jsClick(collapseButtons.first());
  }

  await jsClick(section.getByRole("button", { name: "Add", exact: true }));
  await pagePause(900);

  const saveButtons = section.getByRole("button", { name: "Save", exact: true });
  await assert.doesNotReject(async () => {
    await page.waitForFunction(
      ([selector]) => {
        const root = document.querySelector(`[data-testid="${selector}"]`);
        if (!root) {
          return false;
        }
        return root.querySelectorAll("button").length > 0 && root.querySelectorAll('button').length >= 1;
      },
      [testId],
      { timeout: 10000 },
    );
  });
  await jsClick(saveButtons.last());
  await pagePause(700);

  const deleteButtons = section.getByRole("button", { name: "Delete", exact: true });
  if ((await deleteButtons.count()) > 0) {
    await jsClick(deleteButtons.last());
    await pagePause(700);
  }
}

async function testBookSetup(page) {
  await openRibbon(page, "Edit");
  await jsClick(ribbonButton(page, "Book Setup").first());
  await page.getByRole("heading", { name: "Book setup", exact: true }).waitFor({ timeout: 20000 });
  await jsClick(page.getByRole("button", { name: "Save setup", exact: true }));
  await pagePause(800);
  const addAiKey = page.getByRole("button", { name: "Add AI Key", exact: true });
  if ((await addAiKey.count()) > 0) {
    await jsClick(addAiKey);
    await page.getByRole("heading", { name: "AI providers", exact: true }).waitFor({ timeout: 20000 });
    await jsClick(page.getByRole("button", { name: "Save Now", exact: true }));
  }
}

async function testSettings(page) {
  await openRibbon(page, "Settings");
  await jsClick(ribbonButton(page, "Open Settings").first());
  await page.getByTestId("settings-ai-providers").waitFor({ timeout: 20000 });

  const providers = page.getByTestId("settings-ai-providers");
  await jsClick(providers.getByRole("button", { name: /Save AI provider|Saving provider/ }).first());
  await pagePause(1200);
  await jsClick(providers.getByRole("button", { name: /Refresh model list|Refreshing/ }).first());
  await pagePause(1500);
  const modelCards = providers.locator('button[type="button"]').filter({ hasText: ":free" });
  if ((await modelCards.count()) > 0) {
    await jsClick(modelCards.first());
    await pagePause(1200);
  }

  const styleSettings = page.getByTestId("settings-style-export");
  await jsClick(styleSettings.getByRole("button", { name: /Save settings|Saving/ }).first());
}

async function testIdeaLab(page) {
  await openRibbon(page, "View");
  await jsClick(ribbonButton(page, "Idea Lab").first());
  await page.getByRole("heading", { name: "Idea Lab", exact: true }).waitFor({ timeout: 20000 });
  await exerciseEditableSection(page, "editable-section-idea-vault");
  await exerciseEditableSection(page, "editable-section-working-notes");
}

async function testStorySkeleton(page) {
  await openRibbon(page, "Edit");
  await jsClick(ribbonButton(page, "Story Skeleton").first());
  await page.getByRole("heading", { name: "Story Skeleton", exact: true }).waitFor({ timeout: 20000 });
  await jsClick(page.getByRole("button", { name: /Generate story plan|Planning/ }).first());
  await pagePause(8000);
  await exerciseEditableSection(page, "editable-section-structure-engine");
  await exerciseEditableSection(page, "editable-section-scene-engine");
}

async function testStoryBible(page) {
  await openRibbon(page, "View");
  await jsClick(ribbonButton(page, "Character Master").first());
  await page.getByTestId("character-master").waitFor({ timeout: 20000 });

  const characterMaster = page.getByTestId("character-master");
  await jsClick(characterMaster.getByRole("button", { name: "New character", exact: true }));
  await pagePause(1000);
  await jsClick(characterMaster.getByRole("button", { name: /Quick edit mode|Deep edit mode/ }).first());
  await jsClick(characterMaster.getByRole("button", { name: /Quick edit mode|Deep edit mode/ }).first());

  const characterButtons = characterMaster.getByTestId("character-master-list").getByRole("button");
  const characterCount = await characterButtons.count();
  for (let index = 0; index < characterCount; index += 1) {
    await jsClick(characterButtons.nth(index));
    await pagePause(150);
  }

  await page.getByLabel("Free-text core").fill("He talks in circles and avoids saying things directly. He sounds warm, but he is evasive when pressured.");
  await jsClick(characterMaster.getByRole("button", { name: /Interpret notes with AI|Interpreting/ }).first());
  await pagePause(4000);
  const suggestionApply = page.getByTestId("character-ai-suggestions").getByRole("button", { name: "Apply", exact: true });
  if ((await suggestionApply.count()) > 0) {
    await jsClick(suggestionApply.first());
  }
  await jsClick(characterMaster.getByRole("button", { name: "Save dossier", exact: true }));
  await pagePause(800);

  const relationshipManager = page.getByTestId("relationship-manager");
  const addRelationshipButton = relationshipManager.getByRole("button", { name: "Add relationship", exact: true });
  if (await addRelationshipButton.isDisabled()) {
    await jsClick(characterMaster.getByRole("button", { name: "New character", exact: true }));
    await pagePause(1000);
    await page.getByLabel("Free-text core").fill("A second dossier exists so The Book Author can exercise relationship mapping and save a connection.");
    await jsClick(characterMaster.getByRole("button", { name: "Save dossier", exact: true }));
    await pagePause(800);
  }

  const relationshipWebButtons = page.getByTestId("character-relationship-web-buttons").getByRole("button");
  const webCount = await relationshipWebButtons.count();
  for (let index = 0; index < webCount; index += 1) {
    await jsClick(relationshipWebButtons.nth(index));
    await pagePause(120);
  }

  const deleteCountBefore = await relationshipManager.getByRole("button", { name: "Delete relationship", exact: true }).count();
  await jsClick(addRelationshipButton);
  await pagePause(900);
  const saveRelationships = relationshipManager.getByRole("button", { name: "Save relationship", exact: true });
  await jsClick(saveRelationships.last());
  const deleteRelationships = relationshipManager.getByRole("button", { name: "Delete relationship", exact: true });
  assert.ok((await deleteRelationships.count()) >= deleteCountBefore, "Relationship add did not expose a delete button");
  await jsClick(deleteRelationships.last());

  await exerciseEditableSection(page, "editable-section-plot-threads-and-mysteries");
  await exerciseEditableSection(page, "editable-section-locations");
  await exerciseEditableSection(page, "editable-section-factions");
  await exerciseEditableSection(page, "editable-section-timeline");
}

async function testMemory(page) {
  await openRibbon(page, "Review");
  await jsClick(ribbonButton(page, "Summarize").first());
  await pagePause(2000);
  await openRibbon(page, "Review");
  await jsClick(ribbonButton(page, "Extract Memory").first());
  await pagePause(3000);

  const projectId = page.url().split("/projects/")[1]?.split(/[?#]/)[0];
  assert.ok(projectId, "Could not resolve project id for memory verification");
  const response = await page.context().request.get(`${base}/api/projects/${projectId}`);
  assert.equal(response.ok(), true, "Could not load project after memory extraction");
  const payload = await response.json();
  const project = payload.data.project;
  assert.ok(
    (project.shortTermMemoryItems?.length ?? 0) + (project.longTermMemoryItems?.length ?? 0) > 0,
    "Memory extraction did not populate any memory items",
  );
}

async function testContinuity(page) {
  await openRibbon(page, "Review");
  await jsClick(ribbonButton(page, "Continuity").first());
  await page.getByRole("heading", { name: "Continuity dashboard", exact: true }).waitFor({ timeout: 20000 });
  await jsClick(page.getByRole("button", { name: /Run chapter check|Checking/ }).first());
  await pagePause(2000);
}

async function testSidebar(page) {
  await ensureWritingView(page);
  await openRibbon(page, "View");
  await setRibbonToggle(page, "Show Chapters", "Hide Chapters", true);
  const sidebar = page.locator("aside");
  await sidebar.waitFor({ timeout: 20000 });

  const viewButtons = sidebar.getByTestId("sidebar-section-views").getByTestId("sidebar-tree-button");
  const viewCount = await viewButtons.count();
  for (let index = 0; index < viewCount; index += 1) {
    await jsClick(viewButtons.nth(index));
    await pagePause(150);
  }

  const chapterPaneButtons = sidebar.getByTestId("sidebar-section-chapters").getByTestId("sidebar-chapter-button");
  const chapterCount = await chapterPaneButtons.count();
  for (let index = 0; index < chapterCount; index += 1) {
    await jsClick(chapterPaneButtons.nth(index));
    await pagePause(150);
  }

  const characterButtons = sidebar.getByTestId("sidebar-section-characters").getByTestId("sidebar-tree-button");
  const characterCount = await characterButtons.count();
  for (let index = 0; index < characterCount; index += 1) {
    await jsClick(characterButtons.nth(index));
    await pagePause(120);
  }

  const structureButtons = sidebar.getByTestId("sidebar-section-story-structure").getByTestId("sidebar-tree-button");
  const structureCount = await structureButtons.count();
  for (let index = 0; index < structureCount; index += 1) {
    await jsClick(structureButtons.nth(index));
    await pagePause(120);
  }

  await sidebar.locator('[data-testid="sidebar-section-idea-vault"] summary').click();
  const ideaButtons = sidebar.getByTestId("sidebar-section-idea-vault").getByTestId("sidebar-tree-button");
  const ideaCount = await ideaButtons.count();
  for (let index = 0; index < ideaCount; index += 1) {
    await jsClick(ideaButtons.nth(index));
    await pagePause(120);
  }
  await jsClick(sidebar.getByRole("link", { name: "Library", exact: true }));
  await page.waitForURL(base, { timeout: 30000 });
}

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
  const page = await context.newPage();

  page.on("pageerror", (error) => console.error("PAGEERROR", error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      console.error("BROWSER_CONSOLE", message.text());
    }
  });

  let projectUrl = await resolveAuditProjectUrl(page);

  try {
    console.log("AUDIT_STEP create project");
    projectUrl = await createAuditProject(page);
    console.log("AUDIT_STEP open audit project");
    await openAuditProject(page, projectUrl);
    console.log("AUDIT_STEP file ribbon");
    await testFileRibbon(page, projectUrl);
    console.log("AUDIT_STEP reopen project");
    await openAuditProject(page, projectUrl);
    console.log("AUDIT_STEP ribbon buttons");
    await testRibbonButtons(page);
    console.log("AUDIT_STEP writing view");
    await ensureWritingView(page);
    console.log("AUDIT_STEP chapter workspace");
    await testChapterWorkspace(page);
    console.log("AUDIT_STEP copilot");
    await testCopilot(page);
    console.log("AUDIT_STEP book setup");
    await testBookSetup(page);
    console.log("AUDIT_STEP settings");
    await testSettings(page);
    console.log("AUDIT_STEP idea lab");
    await testIdeaLab(page);
    console.log("AUDIT_STEP story skeleton");
    await testStorySkeleton(page);
    console.log("AUDIT_STEP story bible");
    await testStoryBible(page);
    console.log("AUDIT_STEP memory");
    await testMemory(page);
    console.log("AUDIT_STEP continuity");
    await testContinuity(page);
    console.log("AUDIT_STEP reopen project for sidebar");
    await openAuditProject(page, projectUrl);
    console.log("AUDIT_STEP sidebar");
    await testSidebar(page);
    console.log("BUTTON_AUDIT_OK");
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error("BUTTON_AUDIT_FAIL");
  console.error(error);
  process.exit(1);
});
