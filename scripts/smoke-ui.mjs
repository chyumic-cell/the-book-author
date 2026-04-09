import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.STORYFORGE_BASE_URL ?? "http://localhost:3000";
const authUsername = process.env.STORYFORGE_USERNAME?.trim() ?? "";
const authPassword = process.env.STORYFORGE_PASSWORD?.trim() ?? "";
const viewports = [
  { name: "portrait", viewport: { width: 1200, height: 1800 } },
  { name: "landscape", viewport: { width: 1600, height: 1000 } },
];

async function createSmokeProject(page) {
  const title = `Smoke Check ${Date.now()}`;
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator('a[href="/projects/new"]').first().click();
  await page.waitForURL(/\/projects\/new/, { timeout: 30000 });
  await page.getByPlaceholder("The Glass Meridian").fill(title);
  await page.getByPlaceholder("A mapmaker races a self-censoring oracle.").fill(
    "A compact QA story used to prove that The Book Author can still create and open a project in hosted mode."
  );
  await page.getByPlaceholder("What is the story fundamentally about?").fill(
    "A writer stress-tests a drafting system and needs the workspace to stay stable while all the moving parts behave."
  );
  await page.getByPlaceholder("Who is the protagonist, what is changing, and what is the fundamental conflict?").fill(
    "A careful writer needs a quiet, reliable workspace while the software proves that writing, revision, and export still work end to end."
  );
  await page.getByPlaceholder("Escalate the mystery, deepen the romance, land on a costly reveal...").fill(
    "Keep the project tiny, coherent, and usable. This project exists only to prove that the hosted app opens and behaves normally."
  );
  await page.getByRole("button", { name: "Create Project", exact: true }).click();
  await page.waitForURL(/\/projects\/(?!new)/, { timeout: 30000 });
  return page.url();
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

async function resolveProjectUrl(page) {
  if (process.env.STORYFORGE_PROJECT_PATH) {
    return new URL(process.env.STORYFORGE_PROJECT_PATH, base).toString();
  }

  await page.goto(base, { waitUntil: "networkidle" });
  const html = await page.content();
  const matches = [...html.matchAll(/href="(\/projects\/[^"]+)"/gi)]
    .map((match) => match[1])
    .filter((href) => href && href !== "/projects/new");

  if (matches[0]) {
    return new URL(matches[0], base).toString();
  }

  return createSmokeProject(page);
}

async function jsClick(locator) {
  await locator.waitFor({ state: "visible", timeout: 20000 });
  await locator.evaluate((node) => node.click());
}

async function openWorkspace(page) {
  await signInIfNeeded(page);
  const projectUrl = await resolveProjectUrl(page);
  await page.goto(projectUrl, { waitUntil: "networkidle" });
  await page.waitForURL(/\/projects\//, { timeout: 30000 });
  await page.waitForLoadState("networkidle");
}

async function openRibbon(page, name) {
  await page.getByTestId("workspace-ribbon-tabs").getByRole("button", { name, exact: true }).click();
  await page.waitForTimeout(150);
}

function ribbonControl(page, label) {
  return page.getByTestId("workspace-ribbon-content").locator(
    `button:has-text("${label}"), a:has-text("${label}")`,
  ).first();
}

async function clickRibbonAction(page, labels) {
  for (const label of labels) {
    const locator = page.getByTestId("workspace-ribbon-content").getByRole("button", { name: label, exact: true });
    if ((await locator.count()) > 0) {
      await jsClick(locator.first());
      await page.waitForTimeout(250);
      return label;
    }
  }

  throw new Error(`None of the ribbon actions were found: ${labels.join(", ")}`);
}

async function ensureWritingView(page) {
  await openRibbon(page, "Home");
  const writingButton = page.getByRole("button", { name: "Writing", exact: true });
  if ((await writingButton.count()) > 0) {
    await jsClick(writingButton);
    await page.waitForTimeout(350);
  }

  await page.getByTestId("manuscript-editor").waitFor({ timeout: 30000 });
}

async function assertRibbonSwaps(page) {
  const checks = [
    { tab: "File", visible: "Open Library", hidden: "Chapter View" },
    { tab: "Edit", visible: "Chapter View", hidden: "Open Library" },
    { tab: "Review", visible: "Continuity", hidden: "Chapter View" },
    { tab: "AI Engine", visible: "Model Settings", hidden: "Continuity" },
    { tab: "View", visible: "Show AI Bar", hidden: "Model Settings" },
    { tab: "Settings", visible: "Open Settings", hidden: "Show Chapters" },
    { tab: "About Us", visible: "Where is my AI key?", hidden: "Open Settings" },
    { tab: "Home", visible: "Zoom +", hidden: "Where is my AI key?" },
  ];

  for (const check of checks) {
    await openRibbon(page, check.tab);
    await ribbonControl(page, check.visible).waitFor({ timeout: 10000 });
    assert.equal(
      await ribbonControl(page, check.hidden).count(),
      0,
      `${check.tab} ribbon left stale controls visible`,
    );
  }
}

async function getLayoutState(page) {
  return page.evaluate(() => ({
    bodyScroll: document.body.scrollHeight > window.innerHeight + 4,
    manuscriptExists: !!document.querySelector('[data-testid="manuscript-editor"]'),
    sidebarVisible: !!document.querySelector("aside"),
    smartContextVisible: !!Array.from(document.querySelectorAll("h4")).find((el) => el.textContent === "Smart Context"),
    outlineVisible: !!Array.from(document.querySelectorAll("label")).find((el) => (el.textContent || "").includes("Chapter outline")),
    planningVisible: !!Array.from(document.querySelectorAll("h4")).find((el) => el.textContent === "Chapter planning"),
    aiDockExpanded: !!Array.from(document.querySelectorAll("h3")).find((el) => el.textContent === "Talk to The Book Author"),
    zoomLabel: Array.from(document.querySelectorAll("button"))
      .map((el) => (el.textContent || "").trim())
      .find((text) => /^\d+%$/.test(text)) || null,
  }));
}

async function assertDefaultWritingShell(page, viewportName) {
  const state = await getLayoutState(page);
  assert.equal(state.bodyScroll, false, `${viewportName}: body scroll leaked`);
  assert.equal(state.manuscriptExists, true, `${viewportName}: manuscript editor missing`);
  assert.equal(state.sidebarVisible, false, `${viewportName}: chapter sidebar should start hidden`);
  assert.equal(state.smartContextVisible, false, `${viewportName}: context pane should start hidden`);
  assert.equal(state.outlineVisible, false, `${viewportName}: outline should start hidden`);
  assert.equal(state.planningVisible, false, `${viewportName}: planning should start hidden`);
  assert.equal(state.aiDockExpanded, false, `${viewportName}: AI dock should start collapsed`);
}

async function toggleViewPanels(page, viewportName) {
  await openRibbon(page, "View");

  await clickRibbonAction(page, ["Show Chapters"]);
  await page.waitForSelector("aside", { state: "visible", timeout: 10000 });
  await clickRibbonAction(page, ["Hide Chapters"]);
  await page.waitForSelector("aside", { state: "detached", timeout: 10000 });

  await clickRibbonAction(page, ["Show Context"]);
  await page.getByRole("heading", { name: "Smart Context", exact: true }).waitFor({ timeout: 10000 });
  await jsClick(page.getByRole("button", { name: "Close pane", exact: true }));
  await page.getByRole("heading", { name: "Smart Context", exact: true }).waitFor({ state: "detached", timeout: 10000 });

  await clickRibbonAction(page, ["Show Outline"]);
  await page.getByRole("textbox", { name: "Chapter outline" }).waitFor({ timeout: 10000 });
  await jsClick(page.getByRole("button", { name: "Collapse", exact: true }));
  await page.getByRole("textbox", { name: "Chapter outline" }).waitFor({ state: "detached", timeout: 10000 });

  await clickRibbonAction(page, ["Show Planning"]);
  await page.getByRole("heading", { name: "Chapter planning", exact: true }).waitFor({ timeout: 10000 });
  await jsClick(page.getByRole("button", { name: "Collapse", exact: true }));
  await page.getByRole("heading", { name: "Chapter planning", exact: true }).waitFor({ state: "detached", timeout: 10000 });

  await clickRibbonAction(page, ["Show AI Bar"]);
  await page.getByRole("heading", { name: "Talk to The Book Author", exact: true }).waitFor({ timeout: 10000 });
  await jsClick(page.getByRole("button", { name: "Collapse", exact: true }));
  await page.getByRole("heading", { name: "Talk to The Book Author", exact: true }).waitFor({ state: "detached", timeout: 10000 });

  const state = await getLayoutState(page);
  assert.equal(state.bodyScroll, false, `${viewportName}: body scroll leaked after panel toggles`);
}

async function testHomeControls(page, viewportName) {
  await openRibbon(page, "Home");

  const editor = page.getByTestId("manuscript-editor");
  const beforeZoom = await editor.evaluate((node) => getComputedStyle(node).fontSize);
  await clickRibbonAction(page, ["Zoom +"]);
  const afterZoom = await editor.evaluate((node) => getComputedStyle(node).fontSize);
  assert.notEqual(afterZoom, beforeZoom, `${viewportName}: zoom + did not change manuscript size`);

  await clickRibbonAction(page, ["110%", "120%", "90%", "100%"]);
  const resetZoom = await editor.evaluate((node) => getComputedStyle(node).fontSize);
  assert.notEqual(resetZoom, "0px", `${viewportName}: zoom reset produced invalid font size`);

  const original = await editor.inputValue();
  await editor.focus();
  await editor.evaluate((node) => {
    const cursor = node.value.length;
    node.setSelectionRange(cursor, cursor);
  });
  await editor.type(" smoke");
  const afterType = await editor.inputValue();
  await clickRibbonAction(page, ["Undo"]);
  const afterUndo = await editor.inputValue();
  assert.equal(afterUndo, original, `${viewportName}: undo did not revert the manuscript edit`);

  await clickRibbonAction(page, ["Redo"]);
  const afterRedo = await editor.inputValue();
  assert.equal(afterRedo, afterType, `${viewportName}: redo did not restore the manuscript edit`);

  await page.keyboard.press("Control+Z");
  await page.waitForTimeout(150);
}

async function testSelectionAndContextMenu(page, viewportName) {
  const editor = page.getByTestId("manuscript-editor");
  await editor.focus();
  const initialValue = await editor.inputValue();
  if (!initialValue.trim()) {
    await editor.fill("Selection smoke text for The Book Author.");
    await page.waitForTimeout(1200);
  }
  await editor.evaluate((node) => {
    const length = Math.min(40, node.value.length);
    node.setSelectionRange(0, length);
  });

  const selected = await editor.evaluate((node) => node.value.slice(node.selectionStart, node.selectionEnd));
  assert.ok(selected.length > 0, `${viewportName}: manuscript selection failed`);

  const box = await editor.boundingBox();
  assert.ok(box, `${viewportName}: manuscript editor box missing`);
  await editor.click({ button: "right", position: { x: Math.min(80, Math.max(8, box.width / 2)), y: 48 }, force: true });

  const menuHeading = page.getByText("Writing tools for Manuscript editor");
  try {
    await menuHeading.waitFor({ timeout: 4000 });
  } catch {
    await editor.focus();
    await page.keyboard.press("Shift+F10");
    await menuHeading.waitFor({ timeout: 10000 });
  }

  await page.getByRole("button", { name: "Copy", exact: true }).waitFor({ timeout: 10000 });
  await page.keyboard.press("Escape");
}

async function testResizablePanes(page, viewportName) {
  await openRibbon(page, "View");
  await clickRibbonAction(page, ["Show Chapters"]);
  await clickRibbonAction(page, ["Show Context"]);

  const separators = page.getByRole("separator");
  assert.ok((await separators.count()) >= 2, `${viewportName}: pane resize handles missing`);

  const aside = page.locator("aside");
  const before = await aside.evaluate((node) => node.getBoundingClientRect().width);
  const firstSeparator = separators.first();
  const box = await firstSeparator.boundingBox();
  assert.ok(box, `${viewportName}: left resize handle missing a box`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 36, box.y + box.height / 2);
  await page.mouse.up();
  await page.waitForTimeout(200);
  const after = await aside.evaluate((node) => node.getBoundingClientRect().width);
  assert.notEqual(Math.round(after), Math.round(before), `${viewportName}: left pane did not resize`);

  await openRibbon(page, "View");
  await clickRibbonAction(page, ["Hide Chapters"]);
  await clickRibbonAction(page, ["Hide Context"]);
}

async function testSidebarNavigation(page) {
  await openRibbon(page, "View");
  await clickRibbonAction(page, ["Show Chapters"]);

  const sidebar = page.locator("aside");
  await sidebar.getByRole("button", { name: "Story Bible", exact: true }).click();
  await page.getByRole("heading", { name: "Character Master", exact: true }).waitFor({ timeout: 10000 });

  await openRibbon(page, "Home");
  await clickRibbonAction(page, ["Writing"]);
  await page.getByTestId("manuscript-editor").waitFor({ timeout: 10000 });

  await openRibbon(page, "View");
  await clickRibbonAction(page, ["Hide Chapters"]);
}

async function runViewport(browser, viewportConfig) {
  const page = await browser.newPage({ viewport: viewportConfig.viewport });
  page.on("pageerror", (error) => console.error(`[${viewportConfig.name}] PAGEERROR`, error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      console.error(`[${viewportConfig.name}] BROWSER_CONSOLE`, message.text());
    }
  });

  await openWorkspace(page);
  await ensureWritingView(page);
  await assertRibbonSwaps(page);
  await ensureWritingView(page);
  await assertDefaultWritingShell(page, viewportConfig.name);
  await toggleViewPanels(page, viewportConfig.name);
  await testHomeControls(page, viewportConfig.name);
  await testSelectionAndContextMenu(page, viewportConfig.name);
  await testResizablePanes(page, viewportConfig.name);
  await testSidebarNavigation(page);

  await page.screenshot({ path: `smoke-ui-${viewportConfig.name}.png`, fullPage: false });
  await page.close();
}

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });

  try {
    for (const viewportConfig of viewports) {
      await runViewport(browser, viewportConfig);
    }
    console.log("SMOKE_UI_OK");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("SMOKE_UI_FAIL");
  console.error(error);
  process.exit(1);
});
