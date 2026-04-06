import "server-only";

import { sanitizeManuscriptText } from "@/lib/ai-output";
import { APP_NAME } from "@/lib/brand";
import { getProjectWorkspace } from "@/lib/project-data";
import { createZipArchive } from "@/lib/zip";
import type { ExportDocument, ProjectWorkspace } from "@/types/storyforge";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function renderInlineMarkupHtml(value: string) {
  return escapeHtml(value)
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br />");
}

function toSentence(value: string, maxLength = 230) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return "";
  }

  if (normalized.length <= maxLength) {
    return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
  }

  const sliced = normalized.slice(0, maxLength);
  const shortened = sliced.slice(0, Math.max(sliced.lastIndexOf(" "), 0)).trim() || sliced.trim();
  return `${shortened.replace(/[,:;–—-]+$/, "")}.`;
}

function soundsSpoilery(value: string) {
  return /\b(killer|culprit|revealed?|reveal|final(?:ly)?|ending|in the end|turns out|destroy(?:ed|s|ing)?|destruction|burn(?:ed|s|ing)?|aftermath|posthumous(?:ly)?|culminat(?:e|es|ed|ing|ion)|ultimately|last battle|final battle|true culprit|secretly was)\b/i.test(
    value,
  );
}

function soundsLikePlanningLanguage(value: string) {
  return /^(establish|introduce|show|depict|build|set up|reveal|track|explore|follow|open with|stage|present)\b/i.test(
    normalizeWhitespace(value),
  );
}

function buildGenreTease(project: ProjectWorkspace) {
  const genre = `${project.bookSettings.genre} ${project.bookSettings.tone}`.toLowerCase();

  if (genre.includes("mystery") || genre.includes("thriller") || genre.includes("crime")) {
    return "Every new clue tightens the net around the wrong suspect, and the closer the investigation gets to the truth, the more lethal the truth becomes.";
  }

  if (genre.includes("fantasy") || genre.includes("war") || genre.includes("history")) {
    return "Armies, faith, and old powers are moving toward the same breaking point, and survival will demand choices that leave no one untouched.";
  }

  if (genre.includes("romance")) {
    return "Desire opens the door, but what follows threatens reputation, loyalty, and the fragile life each heart thought it could protect.";
  }

  return "What starts as one dangerous turn becomes a chain of escalating choices, hidden motives, and consequences that refuse to stay buried.";
}

function getExportAuthorName(project: ProjectWorkspace) {
  return normalizeWhitespace(project.bookSettings.authorName) || "Uncredited Author";
}

function buildCopyrightNotice(project: ProjectWorkspace) {
  const authorName = getExportAuthorName(project);
  const year = new Date().getFullYear();
  return `Copyright (c) ${year} ${authorName}. All rights reserved. This book was written using the ${APP_NAME} app. It is illegal to copy, reproduce, distribute, store, share, or transmit any part or all of this book in any form without prior written permission from the copyright holder. This notice does not cancel, replace, waive, or limit any separate agreement between the author and the app owners, including accepted credit, revenue-sharing, licensing, or other platform terms.`;
}

export function buildSpoilerFreeBackCoverSummary(project: ProjectWorkspace) {
  const firstChapter = [...project.chapters].sort((left, right) => left.number - right.number)[0];
  const candidates = [
    firstChapter?.purpose ?? "",
    firstChapter?.currentBeat ?? "",
    project.bookSettings.storyBrief.split(/(?<=[.!?])\s+/)[0] ?? "",
    project.oneLineHook,
    project.premise.split(/(?<=[.!?])\s+/)[0] ?? "",
  ]
    .map((value) => normalizeWhitespace(value))
    .filter(Boolean);

  const lead =
    candidates.find((candidate) => !soundsSpoilery(candidate) && !soundsLikePlanningLanguage(candidate)) ??
    candidates.find((candidate) => !soundsSpoilery(candidate)) ??
    candidates[0] ??
    `${project.title} opens with a crisis that changes everything.`;
  const summary = toSentence(lead);
  const tease = buildGenreTease(project);

  return [summary, tease].filter(Boolean).join(" ");
}

function renderHtmlParagraphs(content: string) {
  return content
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${renderInlineMarkupHtml(paragraph)}</p>`)
    .join("");
}

function renderXhtmlParagraphs(content: string) {
  return content
    .split(/\n{2,}/)
    .map((paragraph) => {
      let rendered = escapeXml(paragraph).replace(/\n/g, "<br />");
      rendered = rendered.replace(/\*(.+?)\*/g, "<em>$1</em>");
      return `<p>${rendered}</p>`;
    })
    .join("\n");
}

function buildChapterXhtml(chapter: ExportDocument["chapters"][number]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en" xml:lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Chapter ${chapter.number}: ${escapeXml(chapter.title)}</title>
    <link rel="stylesheet" type="text/css" href="../styles.css" />
  </head>
  <body>
    <section class="chapter">
      <h2>Chapter ${chapter.number}: ${escapeXml(chapter.title)}</h2>
      ${renderXhtmlParagraphs(chapter.content)}
    </section>
  </body>
</html>`;
}

function buildTitlePageXhtml(document: ExportDocument) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en" xml:lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeXml(document.title)}</title>
    <link rel="stylesheet" type="text/css" href="styles.css" />
  </head>
  <body>
    <section class="frontmatter">
      <h1>${escapeXml(document.title)}</h1>
      <p class="author">by ${escapeXml(document.authorName)}</p>
      <p class="blurb">${escapeXml(document.backCoverSummary)}</p>
      <p class="copyright">${escapeXml(document.copyrightNotice)}</p>
    </section>
  </body>
</html>`;
}

function buildNavXhtml(document: ExportDocument) {
  const items = [
    `<li><a href="title.xhtml">About This Book</a></li>`,
    ...document.chapters.map(
      (chapter) =>
        `<li><a href="text/chapter-${String(chapter.number).padStart(3, "0")}.xhtml">Chapter ${chapter.number}: ${escapeXml(chapter.title)}</a></li>`,
    ),
  ].join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeXml(document.title)} - Contents</title>
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>Contents</h1>
      <ol>
        ${items}
      </ol>
    </nav>
  </body>
</html>`;
}

function buildNcx(document: ExportDocument, identifier: string) {
  const points = [
    `<navPoint id="nav-title" playOrder="1"><navLabel><text>About This Book</text></navLabel><content src="title.xhtml"/></navPoint>`,
    ...document.chapters.map(
      (chapter, index) =>
        `<navPoint id="nav-${chapter.number}" playOrder="${index + 2}"><navLabel><text>Chapter ${chapter.number}: ${escapeXml(chapter.title)}</text></navLabel><content src="text/chapter-${String(chapter.number).padStart(3, "0")}.xhtml"/></navPoint>`,
    ),
  ].join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeXml(identifier)}"/>
  </head>
  <docTitle><text>${escapeXml(document.title)}</text></docTitle>
  <navMap>${points}</navMap>
</ncx>`;
}

function buildContentOpf(document: ExportDocument, identifier: string) {
  const manifestItems = [
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
    `<item id="styles" href="styles.css" media-type="text/css"/>`,
    `<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>`,
    ...document.chapters.map(
      (chapter) =>
        `<item id="chapter-${chapter.number}" href="text/chapter-${String(chapter.number).padStart(3, "0")}.xhtml" media-type="application/xhtml+xml"/>`,
    ),
  ].join("\n      ");

  const spineItems = [
    `<itemref idref="title"/>`,
    ...document.chapters.map((chapter) => `<itemref idref="chapter-${chapter.number}"/>`),
  ].join("\n      ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${escapeXml(identifier)}</dc:identifier>
    <dc:title>${escapeXml(document.title)}</dc:title>
    <dc:language>en</dc:language>
    <dc:creator>${escapeXml(document.authorName)}</dc:creator>
    <dc:description>${escapeXml(document.backCoverSummary)}</dc:description>
    <dc:rights>${escapeXml(document.copyrightNotice)}</dc:rights>
  </metadata>
  <manifest>
      ${manifestItems}
  </manifest>
  <spine toc="ncx">
      ${spineItems}
  </spine>
</package>`;
}

function buildEpub(document: ExportDocument, identifier: string) {
  const stylesheet = `
body {
  font-family: Georgia, "Times New Roman", serif;
  line-height: 1.58;
  color: #1f1f1f;
  margin: 5%;
}
h1, h2 {
  font-family: "Times New Roman", Georgia, serif;
  text-align: left;
}
h1 {
  margin-bottom: 1rem;
}
.frontmatter p,
.frontmatter h1,
.frontmatter .author,
.frontmatter .blurb,
.frontmatter .copyright {
  text-align: left;
  text-indent: 0;
}
.blurb {
  font-style: italic;
  margin-bottom: 2rem;
}
.author {
  font-weight: 600;
  margin-bottom: 0.75rem;
}
.copyright {
  font-size: 0.9rem;
  color: #4f4f4f;
  text-indent: 0;
  margin-top: 2rem;
}
p {
  margin: 0 0 0.25rem 0;
  text-indent: 1.25em;
  text-align: justify;
  text-justify: inter-word;
  hyphens: auto;
  -epub-hyphens: auto;
  orphans: 2;
  widows: 2;
}
p:first-of-type {
  text-indent: 0;
}
`;

  const entries = [
    { name: "mimetype", data: "application/epub+zip", store: true },
    {
      name: "META-INF/container.xml",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
    },
    { name: "OEBPS/styles.css", data: stylesheet },
    { name: "OEBPS/title.xhtml", data: buildTitlePageXhtml(document) },
    { name: "OEBPS/nav.xhtml", data: buildNavXhtml(document) },
    { name: "OEBPS/toc.ncx", data: buildNcx(document, identifier) },
    { name: "OEBPS/content.opf", data: buildContentOpf(document, identifier) },
    ...document.chapters.map((chapter) => ({
      name: `OEBPS/text/chapter-${String(chapter.number).padStart(3, "0")}.xhtml`,
      data: buildChapterXhtml(chapter),
    })),
  ];

  return createZipArchive(entries);
}

export async function buildExportDocument(projectId: string): Promise<ExportDocument> {
  const project = await getProjectWorkspace(projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  const previousChapterDrafts: string[] = [];

  return {
    title: project.title,
    authorName: getExportAuthorName(project),
    copyrightNotice: buildCopyrightNotice(project),
    backCoverSummary: buildSpoilerFreeBackCoverSummary(project),
    chapters: project.chapters.map((chapter) => {
      const content =
        chapter.draft
          ? sanitizeManuscriptText(chapter.draft, {
              chapterTitle: chapter.title,
              chapterNumber: chapter.number,
              previousChapterDrafts,
            }).text
          : chapter.outline || chapter.purpose;

      if (content) {
        previousChapterDrafts.push(content);
      }

      return {
        number: chapter.number,
        title: chapter.title,
        content,
      };
    }),
  };
}

export function buildExportHtml(document: ExportDocument) {
  const chapterHtml = document.chapters
    .map(
      (chapter) => `
        <section class="chapter">
          <h2>Chapter ${chapter.number}: ${escapeHtml(chapter.title)}</h2>
          ${renderHtmlParagraphs(chapter.content)}
        </section>
      `,
    )
    .join("");

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(document.title)}</title>
        <style>
          @page { size: A4; margin: 0.85in; }
          body {
            font-family: Georgia, "Times New Roman", serif;
            color: #1f1f1f;
            line-height: 1.58;
            font-size: 12pt;
          }
          h1, h2 {
            font-family: "Times New Roman", Georgia, serif;
            page-break-after: avoid;
            text-align: left;
          }
          h1 {
            font-size: 24pt;
            margin-bottom: 0.3in;
          }
          h2 {
            font-size: 16pt;
            margin-top: 0;
            margin-bottom: 0.2in;
          }
          .blurb {
            font-style: italic;
            margin-bottom: 0.5in;
            text-align: left;
          }
          .chapter {
            page-break-before: always;
          }
          .chapter:first-of-type {
            page-break-before: auto;
          }
          p {
            margin: 0 0 0.15in 0;
            text-indent: 0.25in;
            text-align: justify;
            text-justify: inter-word;
            hyphens: auto;
            orphans: 2;
            widows: 2;
          }
          p:first-of-type {
            text-indent: 0;
          }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(document.title)}</h1>
        <p><strong>by ${escapeHtml(document.authorName)}</strong></p>
        <p class="blurb">${escapeHtml(document.backCoverSummary)}</p>
        <p>${escapeHtml(document.copyrightNotice)}</p>
        ${chapterHtml}
      </body>
    </html>
  `;
}

export async function exportProject(projectId: string, format: "md" | "txt" | "json" | "pdf" | "epub") {
  const project = await getProjectWorkspace(projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  if (format === "json") {
    return JSON.stringify(project, null, 2);
  }

  const document = await buildExportDocument(projectId);

  if (format === "pdf") {
    const html = buildExportHtml(document);
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ channel: "msedge", headless: true });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: {
          top: "0.85in",
          right: "0.85in",
          bottom: "0.85in",
          left: "0.85in",
        },
      });
      return pdf;
    } finally {
      await browser.close();
    }
  }

  if (format === "epub") {
    return buildEpub(document, project.slug || project.id);
  }

  if (format === "txt") {
    return [
      document.title,
      "",
      `by ${document.authorName}`,
      "",
      document.backCoverSummary,
      "",
      document.copyrightNotice,
      "",
      ...document.chapters.flatMap((chapter) => [
        `Chapter ${chapter.number}: ${chapter.title}`,
        "",
        chapter.content,
        "",
      ]),
    ].join("\n");
  }

  return [
    `# ${document.title}`,
    "",
    `by ${document.authorName}`,
    "",
    document.backCoverSummary,
    "",
    document.copyrightNotice,
    "",
    ...document.chapters.flatMap((chapter) => [
      `## Chapter ${chapter.number}: ${chapter.title}`,
      "",
      chapter.content,
      "",
    ]),
  ].join("\n");
}
