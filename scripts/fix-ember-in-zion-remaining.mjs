const PROJECT_ID = "cmncxfjtu0000u8iw4betdpmg";
const BASE_URL = "http://localhost:3000";

async function getProject() {
  const response = await fetch(`${BASE_URL}/api/projects/${PROJECT_ID}`);
  const payload = await response.json();
  if (!payload?.ok) {
    throw new Error(payload?.error || "Could not load project.");
  }
  return payload.data.project;
}

async function reviseChapter(chapterId, instruction) {
  const response = await fetch(`${BASE_URL}/api/chapters/${chapterId}/revise`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      actionType: "REVISE",
      instruction,
    }),
  });
  const payload = await response.json();
  if (!payload?.ok) {
    throw new Error(payload?.error || `Revision failed for ${chapterId}.`);
  }
  return payload.data.run.suggestion;
}

async function updateChapterDraft(chapterId, draft) {
  const response = await fetch(`${BASE_URL}/api/chapters/${chapterId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      draft,
      status: "REVISED",
    }),
  });
  const payload = await response.json();
  if (!payload?.ok) {
    throw new Error(payload?.error || `Could not update chapter ${chapterId}.`);
  }
}

async function syncChapter(chapterId) {
  const response = await fetch(`${BASE_URL}/api/chapters/${chapterId}/sync`, {
    method: "POST",
  });
  const payload = await response.json();
  if (!payload?.ok) {
    throw new Error(payload?.error || `Could not sync chapter ${chapterId}.`);
  }
  return payload.data.report;
}

async function syncProject() {
  const response = await fetch(`${BASE_URL}/api/projects/${PROJECT_ID}/sync`, {
    method: "POST",
  });
  const payload = await response.json();
  if (!payload?.ok) {
    throw new Error(payload?.error || "Could not sync project.");
  }
  return payload.data;
}

function chapterInstruction(chapter) {
  switch (chapter.number) {
    case 3:
      return [
        `Rewrite chapter ${chapter.number}, "${chapter.title}", as a full polished historical-fiction chapter.`,
        "Keep all canon facts, chapter events, chronology, cast, and outline purpose intact.",
        "Fix the repeated-setup problem: give this chapter a clearly different opening image, motion, and first paragraph from Chapter 1. Do not begin with dust, ash, a ridge, or a broad city-overlook opener.",
        "Start inside a new on-page situation tied to survival, bargaining, street pressure, or informant-building.",
        "Preserve the chapter's core function: Lucius tries to build an informant network and sees the city's desperation.",
        "Return only the final clean chapter prose.",
      ].join("\n");
    case 9:
      return [
        `Rewrite chapter ${chapter.number}, "${chapter.title}", as a full polished historical-fiction chapter.`,
        "Keep all canon facts, chronology, and existing chapter purpose intact.",
        "Integrate explicit on-page dialogue that reveals the Zealots' motivations and their distrust of Rome.",
        "Make the dialogue materially dramatic and character-specific, not summary or exposition alone.",
        "Preserve Lucius's POV and the existing emotional lane.",
        "Return only the final clean chapter prose.",
      ].join("\n");
    case 11:
      return [
        `Rewrite chapter ${chapter.number}, "${chapter.title}", as a full polished historical-fiction chapter.`,
        "Keep all canon facts, chronology, and existing chapter purpose intact.",
        "Make the starvation physically vivid on the page: bodily weakness, hunger pain, smell, sickness, exhaustion, and visible effects on the people.",
        "Show concrete examples of the Zealots' rationing system and its unfairness through scene action, observation, and dialogue.",
        "Do not just summarize these things; stage them in the manuscript itself.",
        "Return only the final clean chapter prose.",
      ].join("\n");
    case 13:
      return [
        `Rewrite chapter ${chapter.number}, "${chapter.title}", as a full polished historical-fiction chapter.`,
        "Keep all canon facts, chronology, and existing chapter purpose intact.",
        "Strengthen Lucius's immediate emotional reaction to the depravity he witnesses. Put that reaction on the page through bodily response, internal thought, moral recoil, and changed behavior.",
        "Do not merely imply the reaction from atmosphere; make his response unmistakable without melodrama.",
        "Return only the final clean chapter prose.",
      ].join("\n");
    case 14:
      return [
        `Rewrite chapter ${chapter.number}, "${chapter.title}", as a full polished historical-fiction chapter.`,
        "Keep all canon facts, chronology, and existing chapter purpose intact.",
        "Make the doctored intelligence concrete: show what is altered, omitted, or falsified.",
        "Add subtle hints about the Zealots' intentions without turning it into blunt exposition.",
        "Strengthen Lucius's internal monologue about paranoia, calculation, and planning so the chapter's covert tension is clearly on the page.",
        "Return only the final clean chapter prose.",
      ].join("\n");
    default:
      return `Revise chapter ${chapter.number} while preserving canon and fixing its known continuity gap.`;
  }
}

async function main() {
  const project = await getProject();
  const targets = new Set([3, 9, 11, 13, 14]);
  const chapters = project.chapters.filter((chapter) => targets.has(chapter.number));
  const results = [];

  for (const chapter of chapters) {
    const instruction = chapterInstruction(chapter);
    console.log(`Revising chapter ${chapter.number}: ${chapter.title}`);
    const suggestion = await reviseChapter(chapter.id, instruction);
    await updateChapterDraft(chapter.id, suggestion);
    const report = await syncChapter(chapter.id);
    results.push({
      number: chapter.number,
      title: chapter.title,
      verdict: report.verdict,
      issueCount: report.issues.length,
    });
  }

  await syncProject();
  const refreshed = await getProject();
  const issueSummary = refreshed.project
    ? refreshed.project.continuityIssues
    : refreshed.continuityIssues ?? [];

  console.log(
    JSON.stringify(
      {
        revised: results,
        continuityIssueCount: issueSummary.length,
        remainingIssues: issueSummary.map((issue) => ({
          chapterId: issue.chapterId,
          title: issue.title,
          description: issue.description,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
