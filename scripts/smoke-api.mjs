const base = process.env.STORYFORGE_BASE_URL ?? "http://localhost:3000";

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });

  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed: ${response.status} ${JSON.stringify(data)}`);
  }

  return data;
}

async function main() {
  const create = await request("/api/projects", {
    method: "POST",
    body: JSON.stringify({
      title: "End To End Smoke",
      premise:
        "A novelist stress-tests StoryForge by writing, co-writing, revising, and checking continuity in one relentless session.",
      oneLineHook: "A writer tests the AI that is supposed to help finish the book.",
      genre: "Techno-thriller",
      tone: "Tense and propulsive",
      audience: "Adult",
      pointOfView: "Third person limited",
      tense: "Past tense",
      storyBrief:
        "Mara is trying to finish a novel while also proving the software can preserve continuity, respond to coaching requests, and generate usable prose.",
      plotDirection:
        "Escalate from controlled testing into pressure, contradiction checks, and a stronger collaborative voice by the end of the chapter.",
    }),
  });

  const projectId = create.data.projectId;
  let project = create.data.project;
  let chapterId = project.chapters[0].id;

  await request(`/api/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify({
      title: "End To End Smoke",
      premise:
        "A novelist stress-tests StoryForge by writing, co-writing, revising, and checking continuity in one relentless session.",
      oneLineHook: "A writer tests the AI that is supposed to help finish the book.",
      bookSettings: {
        genre: "Techno-thriller",
        tone: "Tense and propulsive",
        audience: "Adult",
        themes: ["trust", "control"],
        pointOfView: "Third person limited",
        tense: "Past tense",
        targetChapterLength: 2200,
        targetBookLength: 80000,
        storyBrief:
          "Mara is trying to finish a novel while also proving the software can preserve continuity, respond to coaching requests, and generate usable prose.",
        plotDirection:
          "Escalate from controlled testing into pressure, contradiction checks, and a stronger collaborative voice by the end of the chapter.",
        pacingNotes: "Open fast and keep pressure visible.",
        romanceLevel: 1,
        darknessLevel: 3,
        proseStyle: "Clean and vivid",
        comparableTitles: ["The Writing Life", "Dark Matter"],
      },
      styleProfile: {
        guidanceIntensity: "STRONG",
        proseDensity: 3,
        pacing: 4,
        darkness: 3,
        romanceIntensity: 1,
        humorLevel: 2,
        actionFrequency: 4,
        mysteryDensity: 4,
        dialogueDescriptionRatio: 6,
        literaryCommercialBalance: 7,
        aestheticGuide: "Screens, rain, city light, sleepless momentum.",
        styleGuide: "Favor clear stakes and specific verbs.",
        voiceRules: ["Avoid repetition", "End scenes with momentum"],
      },
    }),
  });

  const character = await request(`/api/projects/${projectId}/story-bible`, {
    method: "POST",
    body: JSON.stringify({
      entityType: "character",
      payload: {
        name: "Mara Quill",
        role: "Novelist and tester",
        archetype: "Driven skeptic",
        summary: "She wants the software to help without surrendering authorship.",
        goal: "Finish the book and trust the tool only where it earns that trust.",
        fear: "Losing the human spark of the manuscript.",
        secret: "She is secretly relieved when the AI surprises her.",
        wound: "A previous draft collapsed under its own sprawl.",
        quirks: ["Counts revisions out loud"],
        notes: "Primary POV",
        tags: ["writer", "skeptical"],
        povEligible: true,
      },
    }),
  });

  project = character.data.project;
  const characterId = project.characters[0]?.id;

  await request(`/api/projects/${projectId}/story-bible`, {
    method: "POST",
    body: JSON.stringify({
      entityType: "plotThread",
      payload: {
        title: "Can Mara trust the tool?",
        summary: "She keeps testing the boundary between assistance and authorship.",
        status: "ACTIVE",
        heat: 4,
        promisedPayoff: "She learns how to collaborate without disappearing.",
      },
    }),
  });

  await request(`/api/projects/${projectId}/story-bible`, {
    method: "POST",
    body: JSON.stringify({
      entityType: "location",
      payload: {
        name: "Night Office",
        summary: "A cramped apartment office full of marked-up pages.",
        atmosphere: "Sleepless and electric",
        rules: "Silence after midnight",
        notes: "Main drafting location",
        tags: ["office"],
      },
    }),
  });

  await request(`/api/projects/${projectId}/story-bible`, {
    method: "POST",
    body: JSON.stringify({
      entityType: "faction",
      payload: {
        name: "Beta Circle",
        summary: "Early readers and testers.",
        agenda: "Break the tool before it breaks writers.",
        resources: "Feedback and deadlines",
        notes: "Pressure source",
        tags: ["testers"],
      },
    }),
  });

  await request(`/api/projects/${projectId}/story-bible`, {
    method: "POST",
    body: JSON.stringify({
      entityType: "timelineEvent",
      payload: {
        label: "Night One",
        description: "Mara begins the full-system test.",
        orderIndex: 1,
        occursAtChapter: 1,
      },
    }),
  });

  await request(`/api/projects/${projectId}/idea-lab`, {
    method: "POST",
    body: JSON.stringify({
      entityType: "ideaEntry",
      payload: {
        title: "What if the assistant becomes part of the story pressure?",
        content: "Use the tool itself as part of the character conflict rather than just an external helper.",
        type: "WHAT_IF",
        source: "Smoke test",
        tags: ["assistant", "meta"],
        isFavorite: true,
        status: "ACTIVE",
      },
    }),
  });

  await request(`/api/projects/${projectId}/idea-lab`, {
    method: "POST",
    body: JSON.stringify({
      entityType: "workingNote",
      payload: {
        title: "Loose chapter note",
        content: "Maybe chapter two should force Mara to choose between speed and ownership.",
        type: "SANDBOX",
        status: "ACTIVE",
        linkedChapterId: null,
        tags: ["chapter-two"],
      },
    }),
  });

  const newChapter = await request(`/api/projects/${projectId}/chapters`, {
    method: "POST",
  });
  chapterId = newChapter.data.chapterId;

  await request(`/api/projects/${projectId}/skeleton`, {
    method: "POST",
    body: JSON.stringify({
      entityType: "structureBeat",
      payload: {
        type: "MIDPOINT",
        label: "Mara sees the tool shape back",
        description: "The collaboration stops feeling one-directional and becomes a genuine test of authorship.",
        notes: "Midpoint pressure",
        status: "PLANNED",
        chapterId,
        orderIndex: 3,
      },
    }),
  });

  await request(`/api/projects/${projectId}/skeleton`, {
    method: "POST",
    body: JSON.stringify({
      entityType: "sceneCard",
      payload: {
        title: "First real copilot moment",
        summary: "Mara stops treating the system as a toy and starts negotiating with it.",
        goal: "Get unstuck without losing control.",
        conflict: "The faster solution feels dangerously seductive.",
        outcome: "She discovers a more selective way to collaborate.",
        outcomeType: "DECISION",
        chapterId,
        orderIndex: 1,
        frozen: false,
      },
    }),
  });

  await request(`/api/projects/${projectId}/generate/plan`, { method: "POST" });

  await request(`/api/chapters/${chapterId}`, {
    method: "PATCH",
    body: JSON.stringify({
      title: "Pressure Test",
      purpose: "Show Mara using StoryForge across the full spectrum.",
      currentBeat: "She drafts alone, then asks for help when the scene stalls.",
      targetWordCount: 2200,
      keyBeats: ["Solo writing", "Inline assist", "Continuity pass"],
      requiredInclusions: ["Night Office", "Mara Quill"],
      forbiddenElements: ["Instant mastery"],
      desiredMood: "Focused, tense, slightly intimate with the work",
      sceneList: ["Opening draft", "Assist preview", "Continuity pass"],
      outline:
        "Mara opens with a determined draft, uses StoryForge for a targeted lift, and ends by deciding what kind of collaborator the system can be.",
      draft:
        "Mara stared at the blinking cursor until it felt like a dare. Rain tapped the window in the same rhythm as the clock above the shelf, and every note she had pinned to the corkboard looked more certain than she did. She wrote the first sentence anyway, because movement was better than dread.",
      notes: "Smoke test chapter.",
      povCharacterId: characterId,
      status: "DRAFTING",
    }),
  });

  const draftRun = await request(`/api/chapters/${chapterId}/generate/draft`, { method: "POST" });
  await request(`/api/assist-runs/${draftRun.data.run.id}/apply`, {
    method: "POST",
    body: JSON.stringify({
      applyMode: "replace-draft",
      draft: "placeholder",
      selectionStart: 0,
      selectionEnd: 0,
    }),
  });

  const reviseRun = await request(`/api/chapters/${chapterId}/revise`, {
    method: "POST",
    body: JSON.stringify({
      actionType: "IMPROVE_PROSE",
      instruction: "Make the prose more vivid without losing clarity.",
    }),
  });

  await request(`/api/assist-runs/${reviseRun.data.run.id}/apply`, {
    method: "POST",
    body: JSON.stringify({
      applyMode: "append",
      draft: project.chapters[0]?.draft ?? "",
      selectionStart: 0,
      selectionEnd: 0,
    }),
  });

  const assistRun = await request(`/api/chapters/${chapterId}/assist`, {
    method: "POST",
    body: JSON.stringify({
      mode: "CO_WRITE",
      actionType: "ADD_TENSION",
      selectionText: "Mara wrote the first sentence anyway.",
      instruction: "Add more tension and interior pressure.",
      contextNote: "Early scene",
      beforeSelection: "Mara stared at the blinking cursor until it felt like a dare. ",
      afterSelection: " Rain tapped the window while she kept going.",
    }),
  });

  await request(`/api/assist-runs/${assistRun.data.run.id}/apply`, {
    method: "POST",
    body: JSON.stringify({
      applyMode: "replace-selection",
      draft:
        "Mara stared at the blinking cursor until it felt like a dare. Mara wrote the first sentence anyway. Rain tapped the window while she kept going.",
      selectionStart: 54,
      selectionEnd: 89,
    }),
  });

  await request(`/api/chapters/${chapterId}/assist`, {
    method: "POST",
    body: JSON.stringify({
      mode: "COACH",
      actionType: "COACH",
      selectionText: "",
      instruction: "How should chapter two build on this collaboration theme?",
      contextNote: "Bridge to next chapter",
      beforeSelection: "",
      afterSelection: "",
    }),
  });

  await request(`/api/chapters/${chapterId}/summary`, { method: "POST" });
  await request(`/api/chapters/${chapterId}/extract-memory`, { method: "POST" });

  await request(`/api/projects/${projectId}/assistant`, {
    method: "POST",
    body: JSON.stringify({
      message: "Add this as an idea vault note: Mara may eventually trust the tool only after it refuses to flatter her.",
      role: "BRAINSTORM_PARTNER",
      scope: "IDEA_LAB",
      chapterId,
      applyChanges: true,
    }),
  });

  const refreshed = await request(`/api/projects/${projectId}`);
  const shortTermId = refreshed.data.project.shortTermMemoryItems[0]?.id;

  if (shortTermId) {
    await request(`/api/projects/${projectId}/memory/promote`, {
      method: "POST",
      body: JSON.stringify({ memoryItemId: shortTermId }),
    });
  }

  await request(`/api/chapters/${chapterId}/continuity`, {
    method: "POST",
    body: JSON.stringify({
      draft: "Mara suddenly had a broken arm that was never introduced, which should raise a continuity flag.",
      mode: "CHAPTER",
    }),
  });

  const exportMd = await fetch(`${base}/api/projects/${projectId}/export?format=md`);
  if (!exportMd.ok) {
    throw new Error("Markdown export failed.");
  }

  const exportTxt = await fetch(`${base}/api/projects/${projectId}/export?format=txt`);
  if (!exportTxt.ok) {
    throw new Error("TXT export failed.");
  }

  const exportJson = await fetch(`${base}/api/projects/${projectId}/export?format=json`);
  if (!exportJson.ok) {
    throw new Error("JSON export failed.");
  }

  await request("/api/settings/providers");

  console.log("SMOKE_API_OK");
}

main().catch((error) => {
  console.error("SMOKE_API_FAIL");
  console.error(error);
  process.exit(1);
});
