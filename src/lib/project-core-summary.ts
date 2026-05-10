import "server-only";

import { createHash } from "node:crypto";

import { cleanSummaryText } from "@/lib/ai-output";
import { generateTextWithProvider } from "@/lib/openai";
import { getProjectWorkspace } from "@/lib/project-data";
import { prisma } from "@/lib/prisma";
import type { ProjectWorkspace } from "@/types/storyforge";

function compact(value: string, max = 700) {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function listRows(rows: string[], maxRows = 10) {
  return rows.filter(Boolean).slice(0, maxRows).join("\n");
}

function buildProjectSummarySource(project: ProjectWorkspace) {
  const setup = [
    `Title: ${project.title}`,
    `Hook: ${project.oneLineHook}`,
    `Premise: ${project.premise}`,
    `Genre: ${project.bookSettings.genre}`,
    `Tone: ${project.bookSettings.tone}`,
    `Audience: ${project.bookSettings.audience}`,
    `POV: ${project.bookSettings.pointOfView}`,
    `Tense: ${project.bookSettings.tense}`,
    `Themes: ${project.bookSettings.themes.join(" | ")}`,
    `Story brief: ${project.bookSettings.storyBrief}`,
    `Plot direction: ${project.bookSettings.plotDirection}`,
    `Pacing notes: ${project.bookSettings.pacingNotes}`,
    `Prose style: ${project.bookSettings.proseStyle}`,
  ].join("\n");

  const bible = listRows(
    [
      ...project.characters.map((character) =>
        `Character: ${character.name} | ${character.role} | ${compact([character.summary, character.goal, character.fear, character.secret, character.wound, character.quickProfile.speechPattern, character.quickProfile.accent, character.currentState.emotionalState].filter(Boolean).join(" | "), 520)}`,
      ),
      ...project.plotThreads.map((thread) =>
        `Arc/thread: ${thread.title} | ${compact([thread.summary, thread.promisedPayoff, thread.status].filter(Boolean).join(" | "), 420)}`,
      ),
      ...project.locations.map((location) =>
        `Location: ${location.name} | ${compact([location.summary, location.atmosphere, location.rules].filter(Boolean).join(" | "), 360)}`,
      ),
      ...project.factions.map((faction) =>
        `Faction: ${faction.name} | ${compact([faction.summary, faction.agenda, faction.resources].filter(Boolean).join(" | "), 360)}`,
      ),
      ...project.workingNotes
        .filter((note) => note.tags.includes("book-rule"))
        .map((note) => `Book rule: ${note.title} | ${compact(note.content, 420)}`),
    ],
    24,
  );

  const skeleton = listRows(
    [
      ...project.structureBeats.map((beat) =>
        `Structure: ${beat.type} | ${beat.label} | ${compact([beat.description, beat.notes].filter(Boolean).join(" | "), 380)}`,
      ),
      ...project.chapters.map((chapter) =>
        `Chapter ${chapter.number}: ${chapter.title} | purpose: ${compact(chapter.purpose, 180)} | beat: ${compact(chapter.currentBeat, 180)} | outline: ${compact(chapter.outline, 360)}`,
      ),
    ],
    30,
  );

  const memory = listRows(
    [
      ...project.longTermMemoryItems.map((item) => `Long memory: ${item.title} | ${compact(item.content, 360)}`),
      ...project.shortTermMemoryItems.map((item) => `Recent memory: ${item.title} | ${compact(item.content, 260)}`),
      ...project.chapters.flatMap((chapter) =>
        chapter.summaries.slice(0, 1).map((summary) => `Chapter ${chapter.number} summary: ${compact(summary.summary, 280)}`),
      ),
    ],
    24,
  );

  return [
    "BOOK SETUP",
    setup,
    "STORY BIBLE",
    bible || "No story bible entries yet.",
    "STORY SKELETON",
    skeleton || "No skeleton entries yet.",
    "MEMORY",
    memory || "No memory entries yet.",
  ].join("\n\n");
}

function sourceHash(source: string) {
  return createHash("sha256").update(source).digest("hex");
}

function normalizeCoreSummary(value: string) {
  const cleaned = cleanSummaryText(value)
    .replace(/^(?:project\s+summary|summary)\s*:\s*/i, "")
    .trim();
  const sentences = cleaned.match(/[^.!?]+[.!?]+(?:["']+)?/g) ?? [cleaned];
  return sentences
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 10)
    .join(" ")
    .trim();
}

export async function generateProjectCoreSummary(projectId: string) {
  const project = await getProjectWorkspace(projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  const source = buildProjectSummarySource(project);
  const hash = sourceHash(source);
  if (project.coreSummary.trim() && project.coreSummaryUpdatedAt && project.coreSummary === project.coreSummary.trim()) {
    const existing = await prisma.project.findUnique({
      where: { id: projectId },
      select: { coreSummaryHash: true },
    });
    if (existing?.coreSummaryHash === hash) {
      return {
        project,
        summary: project.coreSummary,
        generated: false,
      };
    }
  }

  const prompt = [
    "Write a clear project compass summary for the author.",
    "Use only the setup, story bible, story skeleton, and memory below.",
    "Return 5 to 10 complete sentences.",
    "Explain what the book is truly about: central promise, protagonist pressure, conflict engine, world rules, emotional direction, and likely reader expectation.",
    "Do not write marketing copy. Do not spoil more than the planning materials already state. Do not add new canon.",
    "Return only the summary paragraph.",
    source,
  ].join("\n\n");

  const raw = await generateTextWithProvider(prompt, { maxOutputTokens: 520 });
  const summary = normalizeCoreSummary(raw || "");
  if (!summary) {
    throw new Error("AI did not return a project summary.");
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      coreSummary: summary,
      coreSummaryHash: hash,
      coreSummaryUpdatedAt: new Date(),
    },
  });

  const nextProject = await getProjectWorkspace(projectId);
  return {
    project: nextProject ?? project,
    summary,
    generated: true,
  };
}
