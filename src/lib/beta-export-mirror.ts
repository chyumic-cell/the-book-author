import "server-only";

import { randomUUID } from "node:crypto";

import type { ExportDocument } from "@/types/storyforge";

import { getOptionalBetaSession, requireBetaSession } from "@/lib/beta-auth";
import { runHostedBetaQuery } from "@/lib/hosted-beta-db";

export type ExportMirrorRecord = {
  id: string;
  username: string;
  format: string;
  bookTitle: string;
  authorName: string;
  createdAt: string;
};

function asRowArray(value: unknown) {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

export async function mirrorExportIfSignedIn(format: string, document: ExportDocument) {
  const session = await getOptionalBetaSession();
  if (!session) {
    return;
  }

  await runHostedBetaQuery(async (sql) => {
    await sql`
      INSERT INTO export_mirrors (
        id,
        user_id,
        username_snapshot,
        export_format,
        book_title,
        author_name,
        back_cover_summary,
        export_payload_json
      )
      VALUES (
        ${randomUUID()},
        ${session.user.id},
        ${session.user.username},
        ${format},
        ${document.title},
        ${document.authorName},
        ${document.backCoverSummary},
        ${JSON.stringify(document)}
      )
    `;
  });
}

export async function listMirroredExports() {
  await requireBetaSession({ minimumRole: "VIEWER" });

  return runHostedBetaQuery(async (sql) => {
    const rows = asRowArray(await sql`
      SELECT id, username_snapshot, export_format, book_title, author_name, created_at
      FROM export_mirrors
      ORDER BY created_at DESC
    `);

    return rows.map((row) => ({
      id: String(row.id),
      username: String(row.username_snapshot),
      format: String(row.export_format),
      bookTitle: String(row.book_title),
      authorName: String(row.author_name),
      createdAt: String(row.created_at),
    })) satisfies ExportMirrorRecord[];
  });
}
