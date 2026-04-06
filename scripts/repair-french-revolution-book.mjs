import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import OpenAI from "openai";

const base = process.env.STORYFORGE_BASE_URL ?? "http://localhost:3000";
const projectId = process.env.STORYFORGE_PROJECT_ID ?? "cmn4fq5wq003pu86gn6n7sz02";
const exportsDir = path.join(process.cwd(), "exports");
const providerConfigPath = path.join(process.cwd(), ".the-book-author.providers.json");
const targetOpenRouterModel = process.env.STORYFORGE_MODEL ?? "arcee-ai/trinity-large-preview:free";

const finalActPlan = {
  13: {
    title: "The Haunted Tavern",
    pov: "René de Valmont",
    purpose:
      "After the imperial campaign leaves him hurt and hunted, René shelters in a tavern that eerily recalls the night he unknowingly spoke with the fleeing king, and the past closes around him.",
    currentBeat: "René sees how memory, drink, and revolutionary hatred have turned every refuge into a trap.",
    targetWordCount: 950,
    keyBeats: [
      "René enters the tavern and recognizes details that echo the earlier royal flight.",
      "A mocking revolutionary song about the dead king turns the room against him from within.",
      "He recognizes Thibault in disgrace before the room does, but neither man can safely claim the other.",
      "A drunken accusation nearly exposes René, forcing a brief violent escape that worsens his wound.",
    ],
    requiredInclusions: [
      "The tavern must feel like a dark mirror of the earlier meeting with the disguised king.",
      "René must suppress his grief and rage to survive.",
      "Thibault must appear pitiable, ruined, and still stubbornly loyal under the shame.",
      "René must leave wounded but still uncaught.",
    ],
    forbiddenElements: ["Meta commentary", "Chapter headings inside the prose", "Austria-Hungary terminology"],
    desiredMood: "Claustrophobic, ghost-haunted, bitterly nostalgic",
    sceneList: [
      "René limps into the tavern at dusk.",
      "A song about the dead king spreads through the room.",
      "Thibault performs badly for drink money and is recognized.",
      "A drunk accuses René of being a royalist.",
      "René escapes into the night, bleeding and shaken.",
    ],
    notes: "Echo chapter 2 while showing how far the world and René have fallen.",
  },
  14: {
    title: "The Fool's Lament",
    pov: "Thibault the Fool",
    purpose:
      "Show Thibault's social death in full and bind him to the main tragedy by making Jacques witness his humiliation and injury.",
    currentBeat: "Thibault turns mockery into one last weapon and pays for it with his body.",
    targetWordCount: 900,
    keyBeats: [
      "Thibault performs for a hostile crowd without motley, but the room still treats him as the crown's whore.",
      "He mocks both himself and the revolution in a way that is almost a confession.",
      "The crowd turns violent and beats him badly.",
      "Jacques watches from the shadows, hates himself for hesitating, and ultimately helps only after the worst is done.",
    ],
    requiredInclusions: [
      "People must ridicule and pity him for serving the monarchy.",
      "He no longer wears clown clothes, but his old identity clings to him anyway.",
      "His injury must be serious enough to matter in the final act, but not instantly fatal.",
      "Jacques must become tied to Thibault through guilt and secret aid.",
    ],
    forbiddenElements: ["René appearing in the scene", "Any triumph that erases Thibault's degradation", "Meta commentary"],
    desiredMood: "Squalid, cruel, self-lacerating, tragic",
    sceneList: [
      "Thibault drinks before a cheap performance.",
      "The crowd jeers him as the monarchy's whore.",
      "He gives a poisonous, funny, unforgivable performance.",
      "The beating happens in public and then in the alley.",
      "Jacques finally intervenes after too much damage is done.",
    ],
    notes: "Keep Thibault human, ashamed, witty, and doomed rather than cartoonish.",
  },
  15: {
    title: "The Jailed Cavalier",
    pov: "René de Valmont",
    purpose:
      "Drop René into a false ending by capturing him, then force Jacques to choose conscience over public duty in order to free him.",
    currentBeat: "René confronts mortality in captivity while Jacques risks damnation to release him.",
    targetWordCount: 1000,
    keyBeats: [
      "René is recognized as a nobleman and dragged into a makeshift prison.",
      "He meets other doomed royalists and sees what defeat really looks like.",
      "Jacques appears disguised as a guard and recognizes René from the king's last days.",
      "Jacques engineers a narrow escape through filth and darkness.",
      "René leaves behind his signet ring and part of his old identity.",
    ],
    requiredInclusions: [
      "The cell must feel like a rehearsal for execution.",
      "Jacques must protect René without revealing himself too soon.",
      "The escape must be close, ugly, and dangerous rather than glamorous.",
      "René must lose the signet ring.",
    ],
    forbiddenElements: ["Direct confrontation with Isabelle", "Clean heroic victory", "Meta commentary"],
    desiredMood: "Airless, terrified, infernal, desperate",
    sceneList: [
      "Capture on the road after the tavern violence.",
      "Condemned men in the makeshift jail.",
      "Jacques reveals himself only in fragments.",
      "The sewage-tunnel escape.",
      "René emerges changed and diminished.",
    ],
    notes: "Manual co-writing chapter. Use coach, continue, expand, tension, and tighten.",
    manualAssist: true,
  },
  16: {
    title: "The Orphan's Bargain",
    pov: "Isabelle Moreau",
    purpose:
      "Push Isabelle fully into betrayal by making her trade information for revenge, then force her to witness what that choice does to real people.",
    currentBeat: "Isabelle mistakes vengeance for adulthood and crosses a line she cannot uncross.",
    targetWordCount: 900,
    keyBeats: [
      "A revolutionary handler recruits Isabelle for information because she can pass unnoticed.",
      "She agrees, believing royalist suffering will balance her own losses.",
      "She reports on a meeting or route connected to René's escape network.",
      "The resulting raid spills blood she did not imagine.",
      "She realizes too late that revenge has made her resemble the violence that orphaned her.",
    ],
    requiredInclusions: [
      "Her conflict must be genuine, not cartoonishly cold.",
      "The betrayal must materially endanger René, Jacques, and the royalist cause.",
      "She must witness consequences she cannot simply rationalize away.",
      "No redemption yet.",
    ],
    forbiddenElements: ["René being directly present for the whole chapter", "An easy excuse that absolves Isabelle", "Meta commentary"],
    desiredMood: "Hard, guilty, narrowing, morally corrosive",
    sceneList: [
      "Recruitment in a market or queue.",
      "Isabelle weighing the offer alone.",
      "Secret observation of the royalist route.",
      "Report to the handler.",
      "Aftermath of the raid.",
    ],
    notes: "Make the orphan arc painful and morally legible.",
  },
  17: {
    title: "The Broken Standard",
    pov: "René de Valmont",
    purpose:
      "Converge the orphan, jailer, jester, and monarchist arcs in a failed royalist counterstroke exposed by Isabelle's betrayal and paid for by Jacques's sacrifice.",
    currentBeat: "What should have been the road back into France becomes the beginning of the end.",
    targetWordCount: 1050,
    keyBeats: [
      "René reaches the rendezvous for a royalist-imperial counterstroke and senses something is wrong.",
      "The trap closes because Isabelle's intelligence has exposed the crossing.",
      "Jacques openly sacrifices his cover and his life to get René free.",
      "Thibault, battered and ashamed, chooses loyalty over survival and follows René into the collapse.",
      "The white standard is broken before the offensive truly begins.",
    ],
    requiredInclusions: [
      "Jacques must pay off his guilt through decisive action.",
      "Isabelle's betrayal must have visible, irreversible consequence.",
      "Thibault must begin reclaiming dignity through action, not speeches alone.",
      "End with the final assault or final doomed decision fully in motion.",
    ],
    forbiddenElements: ["A hopeful reset", "Meta commentary", "Open-ended ambiguity about whether the trap mattered"],
    desiredMood: "Panicked, martial, sacrificial, fated",
    sceneList: [
      "Rendezvous before the crossing.",
      "Signs of betrayal and the first volley.",
      "Jacques reveals himself and buys time.",
      "René and Thibault break through toward the final position.",
      "The standard is shattered.",
    ],
    notes: "This chapter must feel like the tragic machine finally closing.",
  },
  18: {
    title: "The Last Cavalier",
    pov: "René de Valmont",
    purpose:
      "End the novel as a resolved Greek tragedy in which René makes one last doomed attempt to carry the monarchist dream back into France and loses everything for it.",
    currentBeat: "René chooses meaning over survival and dies with the old world.",
    targetWordCount: 1100,
    keyBeats: [
      "René joins or leads the final failed assault meant to carry the royalist banner into France.",
      "Thibault wins back dignity in a fatal act that saves René for one last push.",
      "René realizes the monarchy cannot be restored by ceremony, blood, or memory, yet continues anyway because he cannot be anyone else.",
      "Isabelle witnesses enough of the ending to understand what her revenge helped destroy.",
      "René dies and the cause fails.",
    ],
    requiredInclusions: [
      "The ending must be tragic but resolved, not sequel bait.",
      "Thibault's fate must land with dignity and sorrow.",
      "Jacques's sacrifice must echo in René's final choices.",
      "Isabelle must be left alive or spiritually marked in a way that closes her arc with bitterness, not victory.",
      "No restoration of the monarchy.",
    ],
    forbiddenElements: ["Cautious hope", "A beginning-not-ending tone", "Meta commentary"],
    desiredMood: "Terminal, solemn, war-torn, classically tragic",
    sceneList: [
      "The final push toward French soil.",
      "Thibault's fatal diversion or sacrifice.",
      "René carrying the standard or charge beyond reason.",
      "Recognition that the old world is dead.",
      "René's death and the bitter aftermath through surviving eyes.",
    ],
    notes: "Write a finished tragic ending. No preface, no heading inside the draft, no 'beginning' language.",
  },
};

function cleanGeneratedText(value = "") {
  let text = value.replace(/\r/g, "").replace(/```(?:json)?/gi, "").trim();
  text = text.replace(/^(?:here(?:'s| is)|below is|i(?:'ll| will))(?:.|\n)*?(?:\n\s*\n|\n---+\s*\n|\n#{1,6}\s+)/i, "");
  text = text.replace(/^(?:revised|updated|new)\s+chapter(?:.|\n)*?(?:\n\s*\n|\n---+\s*\n|\n#{1,6}\s+)/i, "");
  text = text.replace(/^\s*---+\s*/i, "");
  text = text.replace(/^\s*(?:\*\*|#+\s*)?chapter\s+\d+[^\n]*?(?:\*\*)?\s*\n+/i, "");
  text = text.replace(/^\s*(?:\*\*|#+\s*)?[a-z][^\n]{0,80}\s*\n+(?=chapter\s+\d+)/i, "");
  text = text.replace(/^\s*(?:\*\*|#+\s*)?(?:draft|outline|revision)[^\n]*\n+/i, "");
  return text.trim();
}

function cleanSummaryText(value = "") {
  return cleanGeneratedText(value).replace(/\s+/g, " ").trim();
}

function cleanCharacterNotes(value = "") {
  return value
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return true;
      }
      if (/^---+$/.test(trimmed)) {
        return false;
      }
      return !/^(?:ch\.\s*\d+:\s*)?(?:here(?:'s| is)|below is|i(?:'ll| will)|(?:\*\*|#+\s*)?chapter\s+\d+)/i.test(trimmed);
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

async function requestJson(requestPath, options = {}) {
  const response = await fetch(`${base}${requestPath}`, {
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    ...options,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(`${options.method ?? "GET"} ${requestPath} failed: ${payload?.error ?? response.statusText}`);
  }
  return payload.data;
}

async function downloadFile(requestPath, outputPath) {
  const response = await fetch(`${base}${requestPath}`);
  if (!response.ok) {
    throw new Error(`Download failed for ${requestPath}: ${response.status} ${response.statusText}`);
  }
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
}

async function refreshProject() {
  return requestJson(`/api/projects/${projectId}`);
}

async function applyRun(runId, fieldKey, currentContent, applyMode, selectionStart, selectionEnd) {
  return requestJson(`/api/assist-runs/${runId}/apply`, {
    method: "POST",
    body: JSON.stringify({ applyMode, fieldKey, content: currentContent, selectionStart, selectionEnd }),
  });
}

async function updateChapter(chapterId, patch) {
  return requestJson(`/api/chapters/${chapterId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

async function patchStoryBible(entityType, id, payload) {
  return requestJson(`/api/projects/${projectId}/story-bible`, {
    method: "PATCH",
    body: JSON.stringify({ entityType, id, payload }),
  });
}

async function askAssistant(message, role, scope, applyChanges) {
  return requestJson(`/api/projects/${projectId}/assistant`, {
    method: "POST",
    body: JSON.stringify({ message, role, scope, chapterId: null, applyChanges }),
  });
}

async function reviseAndReplaceDraft(chapterId, instruction, actionType = "REVISE") {
  const revision = await requestJson(`/api/chapters/${chapterId}/revise`, {
    method: "POST",
    body: JSON.stringify({ actionType, instruction }),
  });
  await applyRun(revision.run.id, "draft", "", "replace-draft", 0, 0);
}

function middleSlice(text, preferredLength = 420) {
  if (text.length <= preferredLength) {
    return { selectionText: text, selectionStart: 0, selectionEnd: text.length };
  }
  const start = Math.max(0, Math.floor(text.length / 2) - Math.floor(preferredLength / 2));
  const end = Math.min(text.length, start + preferredLength);
  return { selectionText: text.slice(start, end), selectionStart: start, selectionEnd: end };
}

async function runAssistOnDraft(chapterId, currentDraft, actionType, instruction, applyMode) {
  const slice =
    actionType === "CONTINUE" || actionType === "NEXT_BEATS" || actionType === "COACH"
      ? {
          selectionText: currentDraft.slice(Math.max(0, currentDraft.length - 500)),
          selectionStart: Math.max(0, currentDraft.length - 500),
          selectionEnd: currentDraft.length,
        }
      : middleSlice(currentDraft);

  const assist = await requestJson(`/api/chapters/${chapterId}/assist`, {
    method: "POST",
    body: JSON.stringify({
      mode: actionType === "COACH" ? "COACH" : "CO_WRITE",
      role: actionType === "COACH" ? "WRITING_COACH" : "COWRITER",
      actionType,
      selectionText: slice.selectionText,
      instruction,
      contextNote: "Repair pass harness",
      beforeSelection: currentDraft.slice(0, slice.selectionStart),
      afterSelection: currentDraft.slice(slice.selectionEnd),
    }),
  });

  if (actionType !== "COACH") {
    await applyRun(assist.run.id, "draft", currentDraft, applyMode, slice.selectionStart, slice.selectionEnd);
  }
}

async function generateAndApplyOutline(chapterId) {
  const outline = await requestJson(`/api/chapters/${chapterId}/generate/outline`, { method: "POST" });
  await applyRun(outline.run.id, "outline", "", "replace-draft", 0, 0);
}

async function generateAndApplyDraft(chapterId) {
  const draft = await requestJson(`/api/chapters/${chapterId}/generate/draft`, { method: "POST" });
  await applyRun(draft.run.id, "draft", "", "replace-draft", 0, 0);
}

async function summarizeExtractAndCheck(chapterId) {
  await requestJson(`/api/chapters/${chapterId}/summary`, { method: "POST" });
  await requestJson(`/api/chapters/${chapterId}/extract-memory`, { method: "POST" });
  return requestJson(`/api/chapters/${chapterId}/continuity`, {
    method: "POST",
    body: JSON.stringify({ mode: "POST_GENERATION" }),
  });
}

async function repairContinuityIfNeeded(chapterId) {
  const continuity = await summarizeExtractAndCheck(chapterId);
  if (!continuity.report.issues.length) {
    return;
  }
  const instruction = [
    "Repair the continuity issues while keeping the chapter emotionally strong and historically legible.",
    "Return finished prose only.",
    ...continuity.report.issues.map(
      (issue) => `- ${issue.title}: ${issue.description} Fix it by making sure ${issue.suggestedContext}`,
    ),
  ].join("\n");
  await reviseAndReplaceDraft(chapterId, instruction, "REVISE");
  await summarizeExtractAndCheck(chapterId);
}

async function cleanStoredCanon(project) {
  for (const chapter of project.chapters) {
    const cleanedDraft = cleanGeneratedText(chapter.draft);
    const cleanedOutline = cleanGeneratedText(chapter.outline);
    const patch = {};
    if (cleanedDraft !== chapter.draft) {
      patch.draft = cleanedDraft;
    }
    if (cleanedOutline !== chapter.outline) {
      patch.outline = cleanedOutline;
    }
    if (Object.keys(patch).length) {
      await updateChapter(chapter.id, patch);
    }
  }

  const refreshed = (await refreshProject()).project;
  for (const character of refreshed.characters) {
    const cleanedNotes = cleanCharacterNotes(character.notes);
    const nextState = structuredClone(character.currentState);
    let changed = false;
    for (const key of ["recentChanges", "lastMeaningfulAppearance"]) {
      if (typeof nextState[key] === "string") {
        const cleaned = cleanSummaryText(nextState[key]);
        if (cleaned !== nextState[key]) {
          nextState[key] = cleaned;
          changed = true;
        }
      }
    }
    if (cleanedNotes !== character.notes || changed) {
      await patchStoryBible("character", character.id, { ...character, notes: cleanedNotes, currentState: nextState });
    }
  }

  const latest = (await refreshProject()).project;
  for (const thread of latest.plotThreads) {
    const cleanedSummary = cleanSummaryText(thread.summary);
    if (cleanedSummary !== thread.summary) {
      await patchStoryBible("plotThread", thread.id, { ...thread, summary: cleanedSummary });
    }
  }
}

async function resyncAllChapters(project) {
  for (const chapter of [...project.chapters].sort((a, b) => a.number - b.number)) {
    await summarizeExtractAndCheck(chapter.id);
  }
}

async function buildManualChapter(chapter, plan) {
  const seedDraft = [
    `[Seed for co-writing] ${plan.title}`,
    plan.purpose,
    `POV: ${plan.pov}. Focus: ${plan.currentBeat}.`,
    `Include: ${plan.requiredInclusions.join(", ")}.`,
  ].join("\n");

  await updateChapter(chapter.id, { draft: seedDraft, status: "DRAFTING" });
  await runAssistOnDraft(
    chapter.id,
    seedDraft,
    "COACH",
    `Coach this chapter plainly. Help me build ${plan.title} as a tragic, high-tension imprisonment and escape chapter anchored in ${plan.pov}.`,
    "append",
  );
  await runAssistOnDraft(
    chapter.id,
    seedDraft,
    "CONTINUE",
    `Continue this seed into finished historical-fiction prose for ${plan.title}. No headings. No explanations. Keep the point of view unmistakably ${plan.pov}.`,
    "append",
  );

  let refreshed = (await refreshProject()).project.chapters.find((entry) => entry.id === chapter.id);
  await runAssistOnDraft(
    chapter.id,
    refreshed.draft,
    "EXPAND",
    "Expand the prison atmosphere, Jacques's moral torment, and the physical ugliness of the escape without padding.",
    "append",
  );
  refreshed = (await refreshProject()).project.chapters.find((entry) => entry.id === chapter.id);
  await runAssistOnDraft(
    chapter.id,
    refreshed.draft,
    "ADD_TENSION",
    "Increase dread, ticking-clock pressure, and the feeling that René may die before dawn.",
    "append",
  );
  refreshed = (await refreshProject()).project.chapters.find((entry) => entry.id === chapter.id);
  await runAssistOnDraft(
    chapter.id,
    refreshed.draft,
    "TIGHTEN",
    "Tighten repetition and sharpen the chapter so it reads as urgent, tragic, and professionally paced.",
    "replace-draft",
  );
  await reviseAndReplaceDraft(
    chapter.id,
    "Sharpen the voice and period texture while keeping the prose clean, direct, and free of any preface or headings.",
    "SHARPEN_VOICE",
  );
}

async function getLocalProviderClient() {
  const raw = await readFile(providerConfigPath, "utf8");
  const parsed = JSON.parse(raw);
  if (parsed.activeProvider !== "OPENROUTER" || !parsed.openrouter?.apiKey) {
    throw new Error("The repair harness expects an active OpenRouter configuration in .the-book-author.providers.json.");
  }
  return new OpenAI({
    apiKey: parsed.openrouter.apiKey,
    baseURL: parsed.openrouter.baseUrl || "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": parsed.openrouter.siteUrl || "http://localhost:3000",
      "X-Title": parsed.openrouter.appName || "StoryForge",
    },
  });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractJsonCandidate(value) {
  const cleaned = value.replace(/```json|```/gi, "").trim();
  const arrayStart = cleaned.indexOf("[");
  const arrayEnd = cleaned.lastIndexOf("]");
  return arrayStart >= 0 && arrayEnd > arrayStart ? cleaned.slice(arrayStart, arrayEnd + 1) : cleaned;
}

async function generateText(prompt) {
  const client = await getLocalProviderClient();
  const retryDelaysMs = [0, 1800, 4200, 8500];
  let lastError = null;

  for (const [index, delay] of retryDelaysMs.entries()) {
    if (delay > 0) {
      await sleep(delay);
    }
    try {
      const response = await client.responses.create({
        model: targetOpenRouterModel,
        input: prompt,
      });
      return (
        response.output_text ||
        (response.output ?? []).flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("\n")
      );
    } catch (error) {
      lastError = error;
      const status = Number(error?.status ?? 0);
      const retryable = status === 408 || status === 409 || status === 429 || status >= 500;
      if (!retryable || index === retryDelaysMs.length - 1) {
        break;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("The live provider did not return a response.");
}

async function finalContinuityAudit(project) {
  let lastRaw = "";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const raw = await generateText(
      [
        "You are StoryForge's final continuity and tragic-resolution auditor.",
        "Return strict JSON only as an array.",
        "Find up to 4 real continuity, unresolved-arc, or tragic-ending problems that a simple rule check might miss.",
        "Only report genuine problems. If the book is clean, return [].",
        "Be especially alert for unresolved orphan, jailer, jester, and monarchist arcs; broken timeline logic; repeated wrapper text; and endings that feel open instead of resolved.",
        "Project title:",
        project.title,
        "Plot direction:",
        project.bookSettings.plotDirection,
        "Plot threads:",
        JSON.stringify(project.plotThreads, null, 2),
        "Character latest states:",
        JSON.stringify(
          project.characters.map((character) => ({
            name: character.name,
            notes: character.notes.slice(-1000),
            currentState: character.currentState,
          })),
          null,
          2,
        ),
        "Chapter summaries:",
        JSON.stringify(
          project.chapters.map((chapter) => ({
            number: chapter.number,
            title: chapter.title,
            summary: chapter.summaries.find((entry) => entry.kind === "CORE")?.summary || chapter.purpose,
          })),
          null,
          2,
        ),
        'Array item shape: {"chapterNumber":17,"issue":"string","fixInstruction":"string"}',
      ].join("\n\n"),
    );

    lastRaw = raw;
    try {
      const parsed = JSON.parse(extractJsonCandidate(raw));
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item) =>
            Number.isInteger(item?.chapterNumber) &&
            typeof item?.issue === "string" &&
            typeof item?.fixInstruction === "string",
        );
      }
    } catch {
      // keep trying
    }
  }
  throw new Error(`Could not parse final continuity audit JSON.\n\n${lastRaw.slice(0, 2000)}`);
}

async function main() {
  await mkdir(exportsDir, { recursive: true });

  let project = (await refreshProject()).project;
  await cleanStoredCanon(project);
  project = (await refreshProject()).project;
  await resyncAllChapters(project);

  const coachAdvice = await askAssistant(
    "Plainly diagnose the tragic weak spots in the current final act and tell me how to resolve René, Isabelle, Jacques, and Thibault without sentimentalizing any of them.",
    "WRITING_COACH",
    "PROJECT",
    false,
  );
  const outlineAction = await askAssistant(
    "Update the plot direction: the final act converges the orphan, the jailer, the jester, and René in a failed royalist counterstroke exposed by betrayal and ending in sacrifice, death, and the collapse of the monarchist dream. Also add a climax beat for that convergence.",
    "OUTLINE_ARCHITECT",
    "SKELETON",
    true,
  );
  const doctorAdvice = await askAssistant(
    "Explain in blunt story-doctor terms what would make the ending feel properly like a Greek tragedy instead of a setup for another volume.",
    "STORY_DOCTOR",
    "PROJECT",
    false,
  );

  console.log("COACH_REPLY");
  console.log(coachAdvice.reply);
  console.log("OUTLINE_ACTIONS");
  console.log(JSON.stringify(outlineAction.actions, null, 2));
  console.log("DOCTOR_REPLY");
  console.log(doctorAdvice.reply);

  project = (await refreshProject()).project;
  const characterIdByName = new Map(project.characters.map((character) => [character.name, character.id]));

  for (const chapterNumber of Object.keys(finalActPlan).map(Number).sort((a, b) => a - b)) {
    const plan = finalActPlan[chapterNumber];
    const chapter = project.chapters.find((entry) => entry.number === chapterNumber);
    if (!chapter) {
      throw new Error(`Chapter ${chapterNumber} is missing from ${project.title}.`);
    }

    await updateChapter(chapter.id, {
      title: plan.title,
      purpose: plan.purpose,
      currentBeat: plan.currentBeat,
      targetWordCount: plan.targetWordCount,
      keyBeats: plan.keyBeats,
      requiredInclusions: plan.requiredInclusions,
      forbiddenElements: plan.forbiddenElements,
      desiredMood: plan.desiredMood,
      sceneList: plan.sceneList,
      notes: plan.notes,
      outline: "",
      draft: "",
      povCharacterId: characterIdByName.get(plan.pov) ?? null,
      status: "PLANNED",
    });

    await requestJson(`/api/chapters/${chapter.id}/continuity`, {
      method: "POST",
      body: JSON.stringify({ mode: "PRE_GENERATION" }),
    });

    await generateAndApplyOutline(chapter.id);
    if (plan.manualAssist) {
      await buildManualChapter(chapter, plan);
    } else {
      await generateAndApplyDraft(chapter.id);
    }

    if ([13, 16, 17].includes(chapterNumber)) {
      await reviseAndReplaceDraft(
        chapter.id,
        [
          `Rewrite ${plan.title} so it strictly follows the stored chapter purpose, beat, and required inclusions.`,
          "Keep the prose clean and historically textured.",
          "No preface, no headings, no meta remarks, no explanation.",
          "Make the POV unmistakable from the opening paragraphs.",
        ].join("\n"),
        "REVISE",
      );
    }

    if (chapterNumber === 18) {
      await reviseAndReplaceDraft(
        chapter.id,
        [
          `This is the final chapter of the novel, ${plan.title}.`,
          "Rewrite it as a fully resolved Greek-tragedy ending.",
          "René must die and the monarchist cause must fail.",
          "Thibault must regain dignity through fatal action.",
          "Isabelle must witness enough of the ending to understand the human cost of her revenge.",
          "Do not end on hope, setup, or a beginning. End the novel.",
          "Return finished prose only with no heading or preface.",
        ].join("\n"),
        "REVISE",
      );
    }

    let refreshed = (await refreshProject()).project.chapters.find((entry) => entry.id === chapter.id);
    if (chapterNumber === 17) {
      await runAssistOnDraft(
        chapter.id,
        refreshed.draft,
        "ADD_TENSION",
        "Increase the trap, the panic, and the sense that Jacques is burning the last of his life to buy René a doomed chance.",
        "append",
      );
      refreshed = (await refreshProject()).project.chapters.find((entry) => entry.id === chapter.id);
      await runAssistOnDraft(
        chapter.id,
        refreshed.draft,
        "TIGHTEN",
        "Tighten the chapter so the failed counterstroke feels relentless and clear.",
        "replace-draft",
      );
    }

    if (chapterNumber === 18) {
      await runAssistOnDraft(
        chapter.id,
        refreshed.draft,
        "EXPAND",
        "Expand the final tragic beats, battlefield immediacy, and emotional recognition without adding sequel bait.",
        "append",
      );
      refreshed = (await refreshProject()).project.chapters.find((entry) => entry.id === chapter.id);
      await runAssistOnDraft(
        chapter.id,
        refreshed.draft,
        "TIGHTEN",
        "Tighten the entire final chapter so it lands with tragic authority and no slackness.",
        "replace-draft",
      );
    }

    await reviseAndReplaceDraft(
      chapter.id,
      `Polish ${plan.title} for prose clarity, Bell-style momentum, and zero meta wrapper text.`,
      chapterNumber === 15 ? "SHARPEN_VOICE" : "IMPROVE_PROSE",
    );

    await repairContinuityIfNeeded(chapter.id);
    await updateChapter(chapter.id, { status: "COMPLETE" });
    project = (await refreshProject()).project;
  }

  for (const chapter of [...project.chapters].sort((a, b) => a.number - b.number)) {
    await summarizeExtractAndCheck(chapter.id);
  }

  const auditFixes = await finalContinuityAudit((await refreshProject()).project);
  for (const issue of auditFixes.slice(0, 4)) {
    const chapter = (await refreshProject()).project.chapters.find((entry) => entry.number === issue.chapterNumber);
    if (!chapter) {
      continue;
    }
    await reviseAndReplaceDraft(
      chapter.id,
      `${issue.fixInstruction}\nReturn finished prose only. Do not add headings or explanations.`,
      "REVISE",
    );
    await repairContinuityIfNeeded(chapter.id);
    await updateChapter(chapter.id, { status: "COMPLETE" });
  }

  project = (await refreshProject()).project;
  await cleanStoredCanon(project);
  project = (await refreshProject()).project;
  await resyncAllChapters(project);

  const exportSlug = slugify(project.title);
  const pdfPath = path.join(exportsDir, `${exportSlug}.pdf`);
  const mdPath = path.join(exportsDir, `${exportSlug}.md`);
  const jsonPath = path.join(exportsDir, `${exportSlug}.json`);
  const reportPath = path.join(exportsDir, `${exportSlug}-repair-report.json`);

  await downloadFile(`/api/projects/${projectId}/export?format=pdf`, pdfPath);
  await downloadFile(`/api/projects/${projectId}/export?format=md`, mdPath);
  await downloadFile(`/api/projects/${projectId}/export?format=json`, jsonPath);

  const finalProject = (await refreshProject()).project;
  const wrapperFindings = finalProject.chapters
    .filter((chapter) => /here(?:'s| is)|i(?:'ll| will)|^\s*---/im.test(chapter.draft))
    .map((chapter) => ({ number: chapter.number, title: chapter.title }));

  await writeFile(
    reportPath,
    JSON.stringify(
      {
        projectId,
        title: finalProject.title,
        totalWords: finalProject.chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
        coachAdvice: coachAdvice.reply,
        doctorAdvice: doctorAdvice.reply,
        outlineActions: outlineAction.actions,
        auditFixes,
        wrapperFindings,
        exports: { pdfPath, mdPath, jsonPath },
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        projectId,
        title: finalProject.title,
        totalWords: finalProject.chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
        pdfPath,
        mdPath,
        jsonPath,
        reportPath,
        wrapperFindings,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("BOOK_REPAIR_FAIL");
  console.error(error);
  process.exit(1);
});
