import { BetaShell } from "@/components/beta/beta-shell";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import type { BetaUserRecord } from "@/lib/beta-auth";
import type { ExportMirrorRecord } from "@/lib/beta-export-mirror";
import type { FeedbackRecord } from "@/lib/beta-feedback";
import { listFeedbackSubmissions } from "@/lib/beta-feedback";
import { listMirroredExports } from "@/lib/beta-export-mirror";
import { listBetaUsers, requireBetaSession } from "@/lib/beta-auth";
import { APP_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

function formatDate(value: string) {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function AdminPage() {
  const session = await requireBetaSession({ admin: true });
  const [users, feedback, exports] = await Promise.all([
    listBetaUsers(),
    listFeedbackSubmissions(),
    listMirroredExports(),
  ]);

  return (
      <BetaShell
        intro={`This admin view is the ${APP_NAME} private-beta moderation and oversight console. It shows registered users, bans, feedback submissions, and mirrored export records.`}
        session={session}
        title={`${APP_NAME} Admin`}
      >
      <Card className="grid gap-4">
        <h2 className="text-2xl font-semibold">Users</h2>
        <div className="grid gap-3">
          {users.map((user: BetaUserRecord) => (
            <div
              key={user.id}
              className="grid gap-3 rounded-2xl border border-[color:var(--line)] bg-[color:var(--panel-soft)]/72 p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Chip>{user.role.toLowerCase()}</Chip>
                <Chip>{user.status.toLowerCase()}</Chip>
                <span className="text-sm font-semibold text-[var(--text)]">{user.displayName}</span>
                <span className="text-xs text-[var(--muted)]">@{user.username}</span>
              </div>
              <p className="text-xs text-[var(--muted)]">
                Created {formatDate(user.createdAt)}{user.lastLoginAt ? ` • Last login ${formatDate(user.lastLoginAt)}` : ""}
              </p>
              {user.status === "BANNED" && user.banReason ? (
                <p className="text-sm text-rose-700">Ban reason: {user.banReason}</p>
              ) : null}
              <form action={`/api/admin/users/${user.id}/ban`} className="grid gap-2" method="post">
                <input
                  className="rounded-xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm outline-none"
                  name="reason"
                  placeholder="Reason for ban or unban note"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    className="inline-flex items-center justify-center rounded-md border border-rose-700 bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800"
                    name="action"
                    type="submit"
                    value="ban"
                  >
                    Ban user
                  </button>
                  <button
                    className="inline-flex items-center justify-center rounded-md border border-[color:var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text)] hover:border-[color:rgba(var(--accent-rgb),0.35)] hover:bg-[color:var(--panel-soft)]"
                    name="action"
                    type="submit"
                    value="unban"
                  >
                    Unban user
                  </button>
                </div>
              </form>
            </div>
          ))}
        </div>
      </Card>

      <Card className="grid gap-4">
        <h2 className="text-2xl font-semibold">Feedback inbox</h2>
        <div className="grid gap-3">
          {feedback.length === 0 ? <p className="text-sm text-[var(--muted)]">No feedback yet.</p> : null}
          {feedback.map((item: FeedbackRecord) => (
            <div key={item.id} className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--panel-soft)]/72 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Chip>{item.status.toLowerCase()}</Chip>
                <span className="text-sm font-semibold text-[var(--text)]">{item.subject}</span>
                <span className="text-xs text-[var(--muted)]">from @{item.username}</span>
              </div>
              <p className="mt-2 text-xs text-[var(--muted)]">{formatDate(item.createdAt)}</p>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{item.message}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="grid gap-4">
        <h2 className="text-2xl font-semibold">Mirrored exports</h2>
        <div className="grid gap-3">
          {exports.length === 0 ? <p className="text-sm text-[var(--muted)]">No mirrored exports yet.</p> : null}
          {exports.map((item: ExportMirrorRecord) => (
            <div key={item.id} className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--panel-soft)]/72 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Chip>{item.format.toUpperCase()}</Chip>
                <span className="text-sm font-semibold text-[var(--text)]">{item.bookTitle}</span>
                <span className="text-xs text-[var(--muted)]">by {item.authorName}</span>
                <span className="text-xs text-[var(--muted)]">exported by @{item.username}</span>
              </div>
              <p className="mt-2 text-xs text-[var(--muted)]">{formatDate(item.createdAt)}</p>
            </div>
          ))}
        </div>
      </Card>
    </BetaShell>
  );
}
