import "server-only";

import { randomUUID } from "node:crypto";

import { requireBetaSession } from "@/lib/beta-auth";
import { runHostedBetaQuery } from "@/lib/hosted-beta-db";

export type FeedbackRecord = {
  id: string;
  username: string;
  subject: string;
  message: string;
  status: string;
  createdAt: string;
};

function asRowArray(value: unknown) {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

export async function createFeedbackSubmission(input: { subject: string; message: string }) {
  const session = await requireBetaSession();
  const subject = input.subject.trim();
  const message = input.message.trim();

  if (subject.length < 3) {
    throw new Error("Please add a short subject.");
  }

  if (message.length < 10) {
    throw new Error("Please add a more detailed feedback message.");
  }

  await runHostedBetaQuery(async (sql) => {
    await sql`
      INSERT INTO feedback_submissions (id, user_id, username_snapshot, subject, message)
      VALUES (
        ${randomUUID()},
        ${session.user.id},
        ${session.user.username},
        ${subject},
        ${message}
      )
    `;
  });
}

export async function listFeedbackSubmissions() {
  await requireBetaSession({ minimumRole: "VIEWER" });

  return runHostedBetaQuery(async (sql) => {
    const rows = asRowArray(await sql`
      SELECT * FROM feedback_submissions
      ORDER BY created_at DESC
    `);

    return rows.map((row) => ({
      id: String(row.id),
      username: String(row.username_snapshot),
      subject: String(row.subject),
      message: String(row.message),
      status: String(row.status),
      createdAt: String(row.created_at),
    })) satisfies FeedbackRecord[];
  });
}
