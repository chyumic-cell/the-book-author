import path from "node:path";

process.env.DATABASE_URL ??= `file:${path.resolve(process.cwd(), "prisma/dev.db").replace(/\\/g, "/")}`;

import { prisma } from "@/lib/prisma";
import { resyncProjectStoryState } from "@/lib/story-sync";

async function main() {
  const idOrSlug = process.argv[2] ?? process.env.STORYFORGE_PROJECT ?? "ember-in-zion";

  const project = await prisma.project.findFirst({
    where: {
      OR: [{ id: idOrSlug }, { slug: idOrSlug }, { title: idOrSlug }],
    },
    select: {
      id: true,
      slug: true,
      title: true,
    },
  });

  if (!project) {
    throw new Error(`Project not found for identifier: ${idOrSlug}`);
  }

  const refreshed = await resyncProjectStoryState(project.id);
  const chapterCount = refreshed.chapters.length;
  const longTermCount = refreshed.longTermMemoryItems.length;
  const shortTermCount = refreshed.shortTermMemoryItems.length;
  const continuityCount = refreshed.continuityIssues.length;

  console.log(
    JSON.stringify(
      {
        projectId: refreshed.id,
        slug: refreshed.slug,
        title: refreshed.title,
        chapterCount,
        longTermCount,
        shortTermCount,
        continuityCount,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
