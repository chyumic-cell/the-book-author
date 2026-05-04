import "server-only";

import { prisma } from "@/lib/prisma";
import {
  createEmptyCharacterDossier,
  createEmptyCharacterQuickProfile,
  createEmptyCharacterState,
} from "@/lib/character-dossier";
import { cleanGeneratedText, cleanInlineSuggestionText, cleanStructuredText, sanitizeManuscriptText } from "@/lib/ai-output";
import { getProjectWorkspace } from "@/lib/project-data";
import { syncChapterToStoryState } from "@/lib/story-sync";
import { toSlug } from "@/lib/utils";
import { ensureBookRuleTags, isBookRuleNote } from "@/lib/book-rules";

import type { z } from "zod";

import {
  applyAssistSchema,
  chapterPatchSchema,
  ideaLabMutationSchema,
  projectCreateSchema,
  projectPatchSchema,
  skeletonMutationSchema,
  storyBibleMutationSchema,
} from "@/lib/schemas";

type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
type ProjectPatchInput = z.infer<typeof projectPatchSchema>;
type ChapterPatchInput = z.infer<typeof chapterPatchSchema>;
type StoryBibleMutation = z.infer<typeof storyBibleMutationSchema>;
type IdeaLabMutation = z.infer<typeof ideaLabMutationSchema>;
type SkeletonMutation = z.infer<typeof skeletonMutationSchema>;
type ApplyAssistInput = z.infer<typeof applyAssistSchema>;

const manuscriptAssistActions = new Set([
  "CONTINUE",
  "EXPAND",
  "TIGHTEN",
  "REPHRASE",
  "IMPROVE_PROSE",
  "SHARPEN_VOICE",
  "ADD_TENSION",
  "ADD_DIALOGUE",
  "DESCRIPTION_TO_DIALOGUE",
  "CUSTOM_EDIT",
  "DRAFT",
  "REVISE",
]);

const inlineAssistActions = new Set([
  "CONTINUE",
  "EXPAND",
  "TIGHTEN",
  "REPHRASE",
  "IMPROVE_PROSE",
  "SHARPEN_VOICE",
  "ADD_TENSION",
  "ADD_DIALOGUE",
  "DESCRIPTION_TO_DIALOGUE",
  "CUSTOM_EDIT",
]);

function splitLines(value: string) {
  return value
    .split(/\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function ensureUniqueSlug(baseTitle: string) {
  const base = toSlug(baseTitle);
  const existing = await prisma.project.count({
    where: {
      slug: {
        startsWith: base,
      },
    },
  });

  return existing === 0 ? base : `${base}-${existing + 1}`;
}

async function ensureUniqueSeriesSlug(baseName: string) {
  const base = toSlug(baseName);
  const existing = await prisma.series.count({
    where: {
      slug: {
        startsWith: base,
      },
    },
  });

  return existing === 0 ? base : `${base}-${existing + 1}`;
}

async function resolveSeriesAssignment(seriesName: string | null | undefined) {
  const trimmed = (seriesName ?? "").trim();
  if (!trimmed) {
    return null;
  }

  const slug = toSlug(trimmed);
  const existing = await prisma.series.findFirst({
    where: {
      OR: [{ slug }, { name: trimmed }],
    },
    select: { id: true },
  });

  if (existing) {
    return existing.id;
  }

  const created = await prisma.series.create({
    data: {
      name: trimmed,
      slug: await ensureUniqueSeriesSlug(trimmed),
    },
    select: { id: true },
  });

  return created.id;
}

export async function createProject(input: ProjectCreateInput) {
  const slug = await ensureUniqueSlug(input.title);
  const seriesId = await resolveSeriesAssignment(input.seriesName);

  const project = await prisma.project.create({
    data: {
      seriesId,
      seriesOrder: input.seriesName?.trim() ? input.seriesOrder ?? null : null,
      title: input.title,
      slug,
      premise: input.premise,
      oneLineHook: input.oneLineHook,
      bookSettings: {
        create: {
          authorName: "",
          seriesName: input.seriesName ?? "",
          seriesOrder: input.seriesName?.trim() ? input.seriesOrder ?? null : null,
          genre: input.genre,
          tone: input.tone,
          audience: input.audience,
          themes: [],
          pointOfView: input.pointOfView,
          tense: input.tense,
          targetChapterLength: 2400,
          targetBookLength: 90000,
          storyBrief: input.storyBrief,
          plotDirection: input.plotDirection,
          pacingNotes: "",
          romanceLevel: 2,
          darknessLevel: 2,
          proseStyle: "",
          comparableTitles: [],
        },
      },
      styleProfile: {
        create: {
          guidanceIntensity: "STRONG",
          proseDensity: 3,
          pacing: 3,
          darkness: 2,
          romanceIntensity: 2,
          humorLevel: 2,
          actionFrequency: 3,
          mysteryDensity: 3,
          dialogueDescriptionRatio: 5,
          literaryCommercialBalance: 6,
          aestheticGuide: "",
          styleGuide: "",
          voiceRules: [],
        },
      },
      generationPresets: {
        create: [
          {
            name: input.genre,
            description: "Starter preset generated from project setup.",
            genre: input.genre,
            proseDensity: 3,
            pacing: 3,
            darkness: 2,
            romanceIntensity: 2,
            humorLevel: 2,
            actionFrequency: 3,
            mysteryDensity: 3,
            dialogueDescriptionRatio: 5,
            literaryCommercialBalance: 6,
            guidanceIntensity: "STRONG",
            isBuiltIn: false,
          },
        ],
      },
      chapters: {
        create: [
          {
            number: 1,
            title: "Chapter 1",
            purpose: "Establish the opening movement of the story.",
            currentBeat: "Inciting movement",
            targetWordCount: 2400,
            keyBeats: [],
            requiredInclusions: [],
            forbiddenElements: [],
            desiredMood: input.tone,
            sceneList: [],
            outline: "",
            draft: "",
            notes: "",
            status: "PLANNED",
          },
        ],
      },
    },
    select: { id: true },
  });

  return project.id;
}

export async function updateProject(projectId: string, input: ProjectPatchInput) {
  const seriesName = input.bookSettings?.seriesName ?? undefined;
  const shouldTouchSeries = seriesName !== undefined;
  const seriesId = shouldTouchSeries ? await resolveSeriesAssignment(seriesName) : undefined;

  await prisma.project.update({
    where: { id: projectId },
    data: {
      seriesId,
      seriesOrder: shouldTouchSeries
        ? (seriesName?.trim() ? (input.bookSettings?.seriesOrder ?? null) : null)
        : undefined,
      title: input.title,
      premise: input.premise,
      oneLineHook: input.oneLineHook,
      bookSettings: input.bookSettings
        ? {
            update: {
              authorName: input.bookSettings.authorName,
              seriesName: input.bookSettings.seriesName ?? "",
              seriesOrder: input.bookSettings.seriesName?.trim()
                ? (input.bookSettings.seriesOrder ?? null)
                : null,
              genre: input.bookSettings.genre,
              tone: input.bookSettings.tone,
              audience: input.bookSettings.audience,
              themes: input.bookSettings.themes,
              pointOfView: input.bookSettings.pointOfView,
              tense: input.bookSettings.tense,
              targetChapterLength: input.bookSettings.targetChapterLength,
              targetBookLength: input.bookSettings.targetBookLength,
              storyBrief: input.bookSettings.storyBrief,
              plotDirection: input.bookSettings.plotDirection,
              pacingNotes: input.bookSettings.pacingNotes,
              romanceLevel: input.bookSettings.romanceLevel,
              darknessLevel: input.bookSettings.darknessLevel,
              proseStyle: input.bookSettings.proseStyle,
              comparableTitles: input.bookSettings.comparableTitles,
            },
          }
        : undefined,
      styleProfile: input.styleProfile
        ? {
            update: {
              guidanceIntensity: input.styleProfile.guidanceIntensity,
              proseDensity: input.styleProfile.proseDensity,
              pacing: input.styleProfile.pacing,
              darkness: input.styleProfile.darkness,
              romanceIntensity: input.styleProfile.romanceIntensity,
              humorLevel: input.styleProfile.humorLevel,
              actionFrequency: input.styleProfile.actionFrequency,
              mysteryDensity: input.styleProfile.mysteryDensity,
              dialogueDescriptionRatio: input.styleProfile.dialogueDescriptionRatio,
              literaryCommercialBalance: input.styleProfile.literaryCommercialBalance,
              aestheticGuide: input.styleProfile.aestheticGuide,
              styleGuide: input.styleProfile.styleGuide,
              voiceRules: input.styleProfile.voiceRules,
            },
          }
        : undefined,
    },
  });
}

export async function deleteProject(projectId: string) {
  await prisma.project.delete({
    where: { id: projectId },
  });
}

export async function createChapter(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      bookSettings: true,
      chapters: {
        orderBy: { number: "desc" },
        take: 1,
      },
    },
  });

  if (!project || !project.bookSettings) {
    throw new Error("Project not found.");
  }

  const nextNumber = (project.chapters[0]?.number ?? 0) + 1;

  return prisma.chapter.create({
    data: {
      projectId,
      number: nextNumber,
      title: `Chapter ${nextNumber}`,
      purpose: "Advance the next major movement of the story.",
      currentBeat: "Fresh pressure enters the chapter.",
      targetWordCount: project.bookSettings.targetChapterLength,
      keyBeats: [],
      requiredInclusions: [],
      forbiddenElements: [],
      desiredMood: project.bookSettings.tone,
      sceneList: [],
      outline: "",
      draft: "",
      notes: "",
      status: "PLANNED",
    },
    select: { id: true },
  });
}

function pickString(payload: Record<string, unknown>, key: string) {
  return typeof payload[key] === "string" ? (payload[key] as string) : "";
}

function pickArray(payload: Record<string, unknown>, key: string) {
  return Array.isArray(payload[key]) ? payload[key] : [];
}

function pickNullableString(payload: Record<string, unknown>, key: string) {
  if (payload[key] === null || payload[key] === undefined || payload[key] === "") {
    return null;
  }

  return String(payload[key]);
}

const validChapterStatuses = new Set(["PLANNED", "OUTLINED", "DRAFTING", "COMPLETE", "REVISED"]);

function normalizeChapterStatus(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const normalized = String(value).trim().toUpperCase();
  if (normalized === "DRAFTED") {
    return "DRAFTING" as const;
  }

  if (validChapterStatuses.has(normalized)) {
    return normalized as "PLANNED" | "OUTLINED" | "DRAFTING" | "COMPLETE" | "REVISED";
  }

  return undefined;
}

async function ensureProjectExists(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });

  if (!project) {
    throw new Error("Project not found.");
  }
}

async function resolveProjectChapterId(projectId: string, chapterId: string | null) {
  if (!chapterId) {
    return null;
  }

  const chapter = await prisma.chapter.findFirst({
    where: {
      id: chapterId,
      projectId,
    },
    select: { id: true },
  });

  return chapter?.id ?? null;
}

async function resolveProjectCharacterId(projectId: string, characterId: string | null) {
  if (!characterId) {
    return null;
  }

  const character = await prisma.character.findFirst({
    where: {
      id: characterId,
      projectId,
    },
    select: { id: true },
  });

  return character?.id ?? null;
}

async function ensureStructureBeatBelongsToProject(projectId: string, structureBeatId: string) {
  const beat = await prisma.structureBeat.findFirst({
    where: {
      id: structureBeatId,
      projectId,
    },
    select: { id: true },
  });

  if (!beat) {
    throw new Error("That structure beat could not be found in this book.");
  }
}

async function ensureSceneCardBelongsToProject(projectId: string, sceneCardId: string) {
  const sceneCard = await prisma.sceneCard.findFirst({
    where: {
      id: sceneCardId,
      projectId,
    },
    select: { id: true },
  });

  if (!sceneCard) {
    throw new Error("That scene card could not be found in this book.");
  }
}

export async function mutateStoryBible(projectId: string, mutation: StoryBibleMutation, method: "POST" | "PATCH" | "DELETE") {
  const payload = mutation.payload;

  switch (mutation.entityType) {
    case "character":
      if (method === "DELETE" && mutation.id) {
        return prisma.character.delete({ where: { id: mutation.id } });
      }

      return mutation.id
        ? prisma.character.update({
            where: { id: mutation.id },
            data: {
              name: pickString(payload, "name"),
              role: pickString(payload, "role"),
              archetype: pickString(payload, "archetype"),
              summary: pickString(payload, "summary"),
              goal: pickString(payload, "goal"),
              fear: pickString(payload, "fear"),
              secret: pickString(payload, "secret"),
              wound: pickString(payload, "wound"),
              quirks: pickArray(payload, "quirks"),
              notes: pickString(payload, "notes"),
              tags: pickArray(payload, "tags"),
              quickProfile: (payload.quickProfile as object | undefined) ?? undefined,
              dossier: (payload.dossier as object | undefined) ?? undefined,
              currentState: (payload.currentState as object | undefined) ?? undefined,
              customFields: (payload.customFields as object[] | undefined) ?? undefined,
              pinnedFields: pickArray(payload, "pinnedFields"),
              povEligible: Boolean(payload.povEligible),
            },
          })
        : prisma.character.create({
            data: {
              projectId,
              name: pickString(payload, "name") || "New Character",
              role: pickString(payload, "role"),
              archetype: pickString(payload, "archetype"),
              summary: pickString(payload, "summary") || "Add character summary.",
              goal: pickString(payload, "goal"),
              fear: pickString(payload, "fear"),
              secret: pickString(payload, "secret"),
              wound: pickString(payload, "wound"),
              quirks: pickArray(payload, "quirks"),
              notes: pickString(payload, "notes"),
              tags: pickArray(payload, "tags"),
              quickProfile: (payload.quickProfile as object | undefined) ?? createEmptyCharacterQuickProfile(),
              dossier:
                (payload.dossier as object | undefined) ?? createEmptyCharacterDossier(pickString(payload, "name") || "New Character"),
              currentState: (payload.currentState as object | undefined) ?? createEmptyCharacterState(),
              customFields: (payload.customFields as object[] | undefined) ?? [],
              pinnedFields: pickArray(payload, "pinnedFields"),
              povEligible: Boolean(payload.povEligible),
            },
          });

    case "relationship":
      if (method === "DELETE" && mutation.id) {
        return prisma.relationship.delete({ where: { id: mutation.id } });
      }

      return mutation.id
        ? prisma.relationship.update({
            where: { id: mutation.id },
            data: {
              sourceCharacterId: pickNullableString(payload, "sourceCharacterId") ?? undefined,
              targetCharacterId: pickNullableString(payload, "targetCharacterId") ?? undefined,
              kind: (pickString(payload, "kind") || "ALLY") as never,
              description: pickString(payload, "description"),
              tension: pickString(payload, "tension"),
              status: pickString(payload, "status"),
            },
          })
        : prisma.relationship.create({
            data: {
              projectId,
              sourceCharacterId: pickNullableString(payload, "sourceCharacterId") ?? "",
              targetCharacterId: pickNullableString(payload, "targetCharacterId") ?? "",
              kind: (pickString(payload, "kind") || "ALLY") as never,
              description: pickString(payload, "description") || "Describe the relationship dynamic.",
              tension: pickString(payload, "tension"),
              status: pickString(payload, "status") || "ACTIVE",
            },
          });

    case "plotThread":
      if (method === "DELETE" && mutation.id) {
        return prisma.plotThread.delete({ where: { id: mutation.id } });
      }

      return mutation.id
        ? prisma.plotThread.update({
            where: { id: mutation.id },
            data: {
              title: pickString(payload, "title"),
              summary: pickString(payload, "summary"),
              status: (pickString(payload, "status") || "ACTIVE") as never,
              heat: Number(payload.heat) || 3,
              promisedPayoff: pickString(payload, "promisedPayoff"),
              progressMarkers: Array.isArray(payload.progressMarkers) ? payload.progressMarkers : undefined,
              lastTouchedChapter:
                payload.lastTouchedChapter === null || payload.lastTouchedChapter === undefined
                  ? null
                  : Number(payload.lastTouchedChapter),
            },
          })
        : prisma.plotThread.create({
            data: {
              projectId,
              title: pickString(payload, "title") || "New Plot Thread",
              summary: pickString(payload, "summary") || "Describe the unresolved thread.",
              status: (pickString(payload, "status") || "ACTIVE") as never,
              heat: Number(payload.heat) || 3,
              promisedPayoff: pickString(payload, "promisedPayoff"),
              progressMarkers: Array.isArray(payload.progressMarkers) ? payload.progressMarkers : [],
              lastTouchedChapter: null,
            },
          });

    case "location":
      if (method === "DELETE" && mutation.id) {
        return prisma.location.delete({ where: { id: mutation.id } });
      }

      return mutation.id
        ? prisma.location.update({
            where: { id: mutation.id },
            data: {
              name: pickString(payload, "name"),
              summary: pickString(payload, "summary"),
              atmosphere: pickString(payload, "atmosphere"),
              rules: pickString(payload, "rules"),
              notes: pickString(payload, "notes"),
              tags: pickArray(payload, "tags"),
            },
          })
        : prisma.location.create({
            data: {
              projectId,
              name: pickString(payload, "name") || "New Location",
              summary: pickString(payload, "summary") || "Describe the location.",
              atmosphere: pickString(payload, "atmosphere"),
              rules: pickString(payload, "rules"),
              notes: pickString(payload, "notes"),
              tags: pickArray(payload, "tags"),
            },
          });

    case "faction":
      if (method === "DELETE" && mutation.id) {
        return prisma.faction.delete({ where: { id: mutation.id } });
      }

      return mutation.id
        ? prisma.faction.update({
            where: { id: mutation.id },
            data: {
              name: pickString(payload, "name"),
              summary: pickString(payload, "summary"),
              agenda: pickString(payload, "agenda"),
              resources: pickString(payload, "resources"),
              notes: pickString(payload, "notes"),
              tags: pickArray(payload, "tags"),
            },
          })
        : prisma.faction.create({
            data: {
              projectId,
              name: pickString(payload, "name") || "New Faction",
              summary: pickString(payload, "summary") || "Describe the faction.",
              agenda: pickString(payload, "agenda"),
              resources: pickString(payload, "resources"),
              notes: pickString(payload, "notes"),
              tags: pickArray(payload, "tags"),
            },
          });

    case "timelineEvent":
      if (method === "DELETE" && mutation.id) {
        return prisma.timelineEvent.delete({ where: { id: mutation.id } });
      }

      return mutation.id
        ? prisma.timelineEvent.update({
            where: { id: mutation.id },
            data: {
              label: pickString(payload, "label"),
              description: pickString(payload, "description"),
              orderIndex: Number(payload.orderIndex) || 1,
              occursAtChapter:
                payload.occursAtChapter === null || payload.occursAtChapter === undefined
                  ? null
                  : Number(payload.occursAtChapter),
            },
          })
        : prisma.timelineEvent.create({
            data: {
              projectId,
              label: pickString(payload, "label") || "New Event",
              description: pickString(payload, "description") || "Describe the event.",
              orderIndex: Number(payload.orderIndex) || 1,
              occursAtChapter:
                payload.occursAtChapter === null || payload.occursAtChapter === undefined
                  ? null
                  : Number(payload.occursAtChapter),
            },
          });

    case "workingNote":
      if (method === "DELETE" && mutation.id) {
        return prisma.workingNote.delete({ where: { id: mutation.id } });
      }

      return mutation.id
        ? prisma.workingNote.update({
            where: { id: mutation.id },
            data: {
              linkedChapterId: pickNullableString(payload, "linkedChapterId"),
              title: pickString(payload, "title"),
              content: pickString(payload, "content"),
              type: "RESEARCH",
              status: (pickString(payload, "status") || "ACTIVE") as never,
              tags: ensureBookRuleTags(pickArray(payload, "tags")),
            },
          })
        : prisma.workingNote.create({
            data: {
              projectId,
              linkedChapterId: pickNullableString(payload, "linkedChapterId"),
              title: pickString(payload, "title") || "New book rule",
              content:
                pickString(payload, "content") ||
                "Explain the world rule, organizational logic, or off-page canon here.",
              type: "RESEARCH",
              status: (pickString(payload, "status") || "ACTIVE") as never,
              tags: ensureBookRuleTags(pickArray(payload, "tags")),
            },
          });

    default:
      throw new Error("Unsupported story bible entity.");
  }
}

export async function mutateIdeaLab(projectId: string, mutation: IdeaLabMutation, method: "POST" | "PATCH" | "DELETE") {
  const payload = mutation.payload;

  switch (mutation.entityType) {
    case "ideaEntry":
      if (method === "DELETE" && mutation.id) {
        return prisma.ideaEntry.delete({ where: { id: mutation.id } });
      }

      return mutation.id
        ? prisma.ideaEntry.update({
            where: { id: mutation.id },
            data: {
              title: pickString(payload, "title"),
              content: pickString(payload, "content"),
              type: (pickString(payload, "type") || "CONCEPT") as never,
              status: (pickString(payload, "status") || "ACTIVE") as never,
              source: pickString(payload, "source"),
              tags: pickArray(payload, "tags"),
              isFavorite: Boolean(payload.isFavorite),
            },
          })
        : prisma.ideaEntry.create({
            data: {
              projectId,
              title: pickString(payload, "title") || "New idea",
              content: pickString(payload, "content") || "Capture the spark here.",
              type: (pickString(payload, "type") || "CONCEPT") as never,
              status: (pickString(payload, "status") || "ACTIVE") as never,
              source: pickString(payload, "source"),
              tags: pickArray(payload, "tags"),
              isFavorite: Boolean(payload.isFavorite),
            },
          });

    case "workingNote":
      if (method === "DELETE" && mutation.id) {
        return prisma.workingNote.delete({ where: { id: mutation.id } });
      }

      return mutation.id
        ? prisma.workingNote.update({
            where: { id: mutation.id },
            data: {
              linkedChapterId: pickNullableString(payload, "linkedChapterId"),
              title: pickString(payload, "title"),
              content: pickString(payload, "content"),
              type: (pickString(payload, "type") || "SANDBOX") as never,
              status: (pickString(payload, "status") || "ACTIVE") as never,
              tags: isBookRuleNote({ tags: pickArray(payload, "tags") })
                ? ensureBookRuleTags(pickArray(payload, "tags"))
                : pickArray(payload, "tags"),
            },
          })
        : prisma.workingNote.create({
            data: {
              projectId,
              linkedChapterId: pickNullableString(payload, "linkedChapterId"),
              title: pickString(payload, "title") || "Sandbox note",
              content: pickString(payload, "content") || "Try alternate ideas here without committing them to canon.",
              type: (pickString(payload, "type") || "SANDBOX") as never,
              status: (pickString(payload, "status") || "ACTIVE") as never,
              tags: isBookRuleNote({ tags: pickArray(payload, "tags") })
                ? ensureBookRuleTags(pickArray(payload, "tags"))
                : pickArray(payload, "tags"),
            },
          });

    default:
      throw new Error("Unsupported idea lab entity.");
  }
}

export async function mutateSkeleton(projectId: string, mutation: SkeletonMutation, method: "POST" | "PATCH" | "DELETE") {
  const payload = mutation.payload;
  await ensureProjectExists(projectId);

  switch (mutation.entityType) {
    case "structureBeat":
      if (method === "DELETE" && mutation.id) {
        await ensureStructureBeatBelongsToProject(projectId, mutation.id);
        return prisma.structureBeat.delete({ where: { id: mutation.id } });
      }

      if (mutation.id) {
        await ensureStructureBeatBelongsToProject(projectId, mutation.id);
      }

      return mutation.id
        ? prisma.structureBeat.update({
            where: { id: mutation.id },
            data: {
              chapterId: await resolveProjectChapterId(projectId, pickNullableString(payload, "chapterId")),
              type: (pickString(payload, "type") || "OPENING_DISTURBANCE") as never,
              label: pickString(payload, "label"),
              description: pickString(payload, "description"),
              notes: pickString(payload, "notes"),
              status: (pickString(payload, "status") || "PLANNED") as never,
              orderIndex: Number(payload.orderIndex) || 1,
            },
          })
        : prisma.structureBeat.create({
            data: {
              projectId,
              chapterId: await resolveProjectChapterId(projectId, pickNullableString(payload, "chapterId")),
              type: (pickString(payload, "type") || "OPENING_DISTURBANCE") as never,
              label: pickString(payload, "label") || "New structure beat",
              description: pickString(payload, "description") || "Define the turning point this beat should deliver.",
              notes: pickString(payload, "notes"),
              status: (pickString(payload, "status") || "PLANNED") as never,
              orderIndex: Number(payload.orderIndex) || 1,
            },
          });

    case "sceneCard":
      if (method === "DELETE" && mutation.id) {
        await ensureSceneCardBelongsToProject(projectId, mutation.id);
        return prisma.sceneCard.delete({ where: { id: mutation.id } });
      }

      if (mutation.id) {
        await ensureSceneCardBelongsToProject(projectId, mutation.id);
      }

      return mutation.id
        ? prisma.sceneCard.update({
            where: { id: mutation.id },
            data: {
              chapterId: await resolveProjectChapterId(projectId, pickNullableString(payload, "chapterId")),
              povCharacterId: await resolveProjectCharacterId(projectId, pickNullableString(payload, "povCharacterId")),
              title: pickString(payload, "title"),
              summary: pickString(payload, "summary"),
              goal: pickString(payload, "goal"),
              conflict: pickString(payload, "conflict"),
              outcome: pickString(payload, "outcome"),
              outcomeType: pickString(payload, "outcomeType")
                ? (pickString(payload, "outcomeType") as never)
                : null,
              locationHint: pickString(payload, "locationHint"),
              orderIndex: Number(payload.orderIndex) || 1,
              frozen: Boolean(payload.frozen),
            },
          })
        : prisma.sceneCard.create({
            data: {
              projectId,
              chapterId: await resolveProjectChapterId(projectId, pickNullableString(payload, "chapterId")),
              povCharacterId: await resolveProjectCharacterId(projectId, pickNullableString(payload, "povCharacterId")),
              title: pickString(payload, "title") || "New scene",
              summary: pickString(payload, "summary"),
              goal: pickString(payload, "goal"),
              conflict: pickString(payload, "conflict"),
              outcome: pickString(payload, "outcome"),
              outcomeType: pickString(payload, "outcomeType")
                ? (pickString(payload, "outcomeType") as never)
                : null,
              locationHint: pickString(payload, "locationHint"),
              orderIndex: Number(payload.orderIndex) || 1,
              frozen: Boolean(payload.frozen),
            },
          });

    default:
      throw new Error("Unsupported skeleton entity.");
  }
}

export async function deleteChapter(chapterId: string) {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: {
      id: true,
      projectId: true,
    },
  });

  if (!chapter) {
    throw new Error("Chapter not found.");
  }

  const chapterCount = await prisma.chapter.count({
    where: { projectId: chapter.projectId },
  });

  if (chapterCount <= 1) {
    throw new Error("A project must keep at least one chapter.");
  }

  await prisma.chapter.delete({
    where: { id: chapterId },
  });

  return chapter.projectId;
}

export async function updateChapter(chapterId: string, input: ChapterPatchInput) {
  return prisma.chapter.update({
    where: { id: chapterId },
    data: {
      title: input.title,
      purpose: input.purpose,
      currentBeat: input.currentBeat,
      targetWordCount: input.targetWordCount,
      keyBeats: input.keyBeats,
      requiredInclusions: input.requiredInclusions,
      forbiddenElements: input.forbiddenElements,
      desiredMood: input.desiredMood,
      sceneList: input.sceneList,
      outline: input.outline,
      draft: input.draft,
      notes: input.notes,
      povCharacterId: input.povCharacterId ?? undefined,
      status: normalizeChapterStatus(input.status) as never,
    },
  });
}

export async function createAssistRun(input: {
  projectId: string;
  chapterId: string;
  mode: string;
  role: string;
  actionType: string;
  selectionText?: string;
  instruction?: string;
  contextNote?: string;
  suggestion: string;
}) {
  const project = manuscriptAssistActions.has(input.actionType)
    ? await getProjectWorkspace(input.projectId)
    : null;
  const chapter = project?.chapters.find((entry) => entry.id === input.chapterId);
  const suggestion =
    input.actionType === "COACH"
      ? cleanStructuredText(input.suggestion)
      : input.actionType === "OUTLINE"
        ? cleanStructuredText(input.suggestion)
        : inlineAssistActions.has(input.actionType)
          ? cleanInlineSuggestionText(input.suggestion)
        : manuscriptAssistActions.has(input.actionType)
        ? sanitizeManuscriptText(input.suggestion, {
            chapterTitle: chapter?.title,
            chapterNumber: chapter?.number,
            previousChapterDrafts:
              chapter && project
                ? project.chapters.filter((entry) => entry.number < chapter.number).map((entry) => entry.draft).filter(Boolean)
                : [],
          }).text
        : cleanGeneratedText(input.suggestion);

  return prisma.aiAssistRun.create({
    data: {
      projectId: input.projectId,
      chapterId: input.chapterId,
      mode: input.mode as never,
      role: input.role as never,
      actionType: input.actionType as never,
      selectionText: input.selectionText ?? "",
      instruction: input.instruction ?? "",
      contextNote: input.contextNote ?? "",
      suggestion,
      status: "PREVIEW",
    },
  });
}

export async function applyAssistRun(assistRunId: string, input: ApplyAssistInput) {
  const run = await prisma.aiAssistRun.findUnique({
    where: { id: assistRunId },
    include: { chapter: true },
  });

  if (!run) {
    throw new Error("Assist run not found.");
  }

  const fieldKey = input.fieldKey ?? "draft";
  const chapterFieldContentRaw =
    fieldKey === "draft"
      ? run.chapter.draft
      : fieldKey === "outline"
        ? run.chapter.outline
        : fieldKey === "title"
          ? run.chapter.title
          : fieldKey === "purpose"
            ? run.chapter.purpose
            : fieldKey === "currentBeat"
              ? run.chapter.currentBeat
              : fieldKey === "desiredMood"
                ? run.chapter.desiredMood
                : fieldKey === "notes"
                ? run.chapter.notes
                  : (run.chapter[fieldKey] as string[] | undefined)?.join("\n") ?? "";
  const chapterFieldContent = chapterFieldContentRaw ?? "";
  const providedContent = input.content ?? input.draft ?? "";
  const selectedText = run.selectionText ?? "";
  const currentContent =
    input.applyMode === "replace-selection" &&
    providedContent.trim() &&
    selectedText.trim() &&
    providedContent.trim() === selectedText.trim() &&
    chapterFieldContent.trim().length > providedContent.trim().length
      ? chapterFieldContent
      : providedContent || chapterFieldContent;
  let nextContent = currentContent;
  const rawSelectionStart = input.selectionStart ?? currentContent.length;
  const rawSelectionEnd = input.selectionEnd ?? currentContent.length;
  let selectionStart = Math.max(0, Math.min(rawSelectionStart, currentContent.length));
  let selectionEnd = Math.max(selectionStart, Math.min(rawSelectionEnd, currentContent.length));

  if (
    input.applyMode === "replace-selection" &&
    currentContent === chapterFieldContent &&
    selectedText.trim() &&
    selectionEnd - selectionStart <= selectedText.trim().length &&
    currentContent.slice(selectionStart, selectionEnd).trim() !== selectedText.trim()
  ) {
    const locatedSelectionStart = currentContent.indexOf(selectedText);
    if (locatedSelectionStart >= 0) {
      selectionStart = locatedSelectionStart;
      selectionEnd = locatedSelectionStart + selectedText.length;
    }
  }

  if (input.applyMode === "replace-selection") {
    nextContent = `${currentContent.slice(0, selectionStart)}${run.suggestion}${currentContent.slice(selectionEnd)}`;
  } else if (input.applyMode === "replace-draft") {
    nextContent = run.suggestion;
  } else if (input.applyMode === "append") {
    nextContent = `${currentContent.trimEnd()}\n\n${run.suggestion}`.trim();
  } else {
    nextContent = `${currentContent.slice(0, selectionStart)}${run.suggestion}${currentContent.slice(selectionStart)}`;
  }

  if (fieldKey === "draft") {
    const project = await getProjectWorkspace(run.chapter.projectId);
    const chapter = project?.chapters.find((entry) => entry.id === run.chapterId);
    nextContent = sanitizeManuscriptText(nextContent, {
      chapterTitle: run.chapter.title,
      chapterNumber: run.chapter.number,
      previousChapterDrafts:
        chapter && project
          ? project.chapters.filter((entry) => entry.number < chapter.number).map((entry) => entry.draft).filter(Boolean)
          : [],
    }).text;
  }

  const chapterUpdate =
    fieldKey === "draft"
      ? {
          draft: nextContent,
          status: "REVISED" as const,
        }
      : fieldKey === "outline" ||
          fieldKey === "title" ||
          fieldKey === "purpose" ||
          fieldKey === "currentBeat" ||
          fieldKey === "desiredMood" ||
          fieldKey === "notes"
        ? {
            [fieldKey]: nextContent,
          }
        : {
            [fieldKey]: splitLines(nextContent),
          };

  await prisma.chapter.update({
    where: { id: run.chapterId },
    data: chapterUpdate,
  });

  await prisma.aiAssistRun.update({
    where: { id: assistRunId },
    data: {
      status: "APPLIED",
      appliedAt: new Date(),
    },
  });

  if (fieldKey === "draft" && nextContent.trim().length >= 120) {
    try {
      await syncChapterToStoryState(run.chapter.projectId, run.chapterId, {
        draftOverride: nextContent,
        continuityMode: "POST_GENERATION",
      });
    } catch {
      // Applying a suggestion should still succeed even if the follow-on sync misses.
    }
  }

  return nextContent;
}
