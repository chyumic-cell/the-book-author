import { BetaShell } from "@/components/beta/beta-shell";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import type { BetaUserRecord, BetaUserRole } from "@/lib/beta-auth";
import { canManageTargetUser, canManageUsers, listBetaUsers, requireBetaSession } from "@/lib/beta-auth";
import type { ExportMirrorRecord } from "@/lib/beta-export-mirror";
import { listMirroredExports } from "@/lib/beta-export-mirror";
import type { FeedbackRecord } from "@/lib/beta-feedback";
import { listFeedbackSubmissions } from "@/lib/beta-feedback";
import { APP_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

const OWNER_ROLE_OPTIONS: BetaUserRole[] = ["OWNER", "MANAGER", "VIEWER", "CUSTOMER"];
const MANAGER_ROLE_OPTIONS: BetaUserRole[] = ["VIEWER", "CUSTOMER"];

function formatDate(value: string) {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function roleOptionsFor(role: BetaUserRole) {
  return role === "OWNER" ? OWNER_ROLE_OPTIONS : MANAGER_ROLE_OPTIONS;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; success?: string }>;
}) {
  const session = await requireBetaSession({ minimumRole: "VIEWER" });
  const [users, feedback, exports] = await Promise.all([
    listBetaUsers(),
    listFeedbackSubmissions(),
    listMirroredExports(),
  ]);
  const messages = (await searchParams) ?? {};
  const managementEnabled = canManageUsers(session.user);
  const roleOptions = roleOptionsFor(session.user.role);

  return (
    <BetaShell
      intro={`This admin view is the ${APP_NAME} private-beta operations console. It shows user accounts, roles, plans, bans, feedback submissions, and mirrored export records.`}
      session={session}
      title={`${APP_NAME} Admin`}
    >
      <Card className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Chip>{session.user.role.toLowerCase()}</Chip>
          <Chip>{session.user.planTier.toLowerCase()}</Chip>
          <Chip>@{session.user.username}</Chip>
        </div>
        {messages.success ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {messages.success}
          </div>
        ) : null}
        {messages.error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {messages.error}
          </div>
        ) : null}
        <p className="text-sm leading-7 text-[var(--muted)]">
          {managementEnabled
            ? "Your account can create users, set roles, ban accounts, and reset passwords from this page."
            : "Your account is read-only in the admin console. You can review users, feedback, and exports, but you cannot change accounts."}
        </p>
      </Card>

      {managementEnabled ? (
        <Card className="grid gap-4">
          <h2 className="text-2xl font-semibold">Create a user manually</h2>
          <form action="/api/admin/users/create" className="grid gap-4 md:grid-cols-2" method="post">
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-[var(--text)]">Display name</span>
              <input name="displayName" placeholder="Michael Polevoy" required />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-[var(--text)]">Username</span>
              <input autoCapitalize="none" autoCorrect="off" name="username" placeholder="michaelpolevoy" required />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-[var(--text)]">Password</span>
              <input name="password" required type="password" />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-[var(--text)]">Role</span>
              <select defaultValue={session.user.role === "OWNER" ? "CUSTOMER" : "VIEWER"} name="role">
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-[var(--text)]">Customer plan</span>
              <select defaultValue="FREE" name="planTier">
                <option value="FREE">Free customer</option>
                <option value="PAID">Paid customer</option>
                <option value="INTERNAL">Internal staff</option>
              </select>
            </label>
            <div className="flex items-end">
              <button className="inline-flex items-center justify-center rounded-md border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-ink)] shadow-[0_8px_18px_rgba(var(--accent-rgb),0.18)] hover:bg-[var(--accent-strong)] hover:border-[var(--accent-strong)]">
                Create user
              </button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card className="grid gap-4">
        <h2 className="text-2xl font-semibold">Users</h2>
        <div className="grid gap-4">
          {users.map((user: BetaUserRecord) => {
            const editableRoleOptions = roleOptionsFor(session.user.role);
            const canManageThisUser = managementEnabled && canManageTargetUser(session.user, user);

            return (
              <div
                key={user.id}
                className="grid gap-4 rounded-2xl border border-[color:var(--line)] bg-[color:var(--panel-soft)]/72 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Chip>{user.role.toLowerCase()}</Chip>
                  <Chip>{user.planTier.toLowerCase()}</Chip>
                  <Chip>{user.status.toLowerCase()}</Chip>
                  <span className="text-sm font-semibold text-[var(--text)]">{user.displayName}</span>
                  <span className="text-xs text-[var(--muted)]">@{user.username}</span>
                </div>
                <p className="text-xs text-[var(--muted)]">
                  Created {formatDate(user.createdAt)}
                  {user.lastLoginAt ? ` | Last login ${formatDate(user.lastLoginAt)}` : ""}
                </p>
                {user.status === "BANNED" && user.banReason ? (
                  <p className="text-sm text-rose-700">Ban reason: {user.banReason}</p>
                ) : null}

                {canManageThisUser ? (
                  <div className="grid gap-4 lg:grid-cols-3">
                    <form action={`/api/admin/users/${user.id}/manage`} className="grid gap-3" method="post">
                      <label className="grid gap-2 text-sm">
                        <span className="font-medium text-[var(--text)]">Display name</span>
                        <input defaultValue={user.displayName} name="displayName" required />
                      </label>
                      <label className="grid gap-2 text-sm">
                        <span className="font-medium text-[var(--text)]">Role</span>
                        <select defaultValue={user.role} name="role">
                          {editableRoleOptions.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm">
                        <span className="font-medium text-[var(--text)]">Customer plan</span>
                        <select defaultValue={user.planTier} name="planTier">
                          <option value="FREE">Free customer</option>
                          <option value="PAID">Paid customer</option>
                          <option value="INTERNAL">Internal staff</option>
                        </select>
                      </label>
                      <button className="inline-flex items-center justify-center rounded-md border border-[color:var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text)] hover:border-[color:rgba(var(--accent-rgb),0.35)] hover:bg-[color:var(--panel-soft)]">
                        Save role and plan
                      </button>
                    </form>

                    <form action={`/api/admin/users/${user.id}/reset-password`} className="grid gap-3" method="post">
                      <label className="grid gap-2 text-sm">
                        <span className="font-medium text-[var(--text)]">Reset password</span>
                        <input name="password" placeholder="New password" required type="password" />
                      </label>
                      <button className="inline-flex items-center justify-center rounded-md border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-ink)] shadow-[0_8px_18px_rgba(var(--accent-rgb),0.18)] hover:bg-[var(--accent-strong)] hover:border-[var(--accent-strong)]">
                        Reset password
                      </button>
                    </form>

                    <form action={`/api/admin/users/${user.id}/ban`} className="grid gap-3" method="post">
                      <label className="grid gap-2 text-sm">
                        <span className="font-medium text-[var(--text)]">Moderation note</span>
                        <input name="reason" placeholder="Reason for ban or unban note" />
                      </label>
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
                ) : (
                  <p className="text-sm text-[var(--muted)]">
                    {managementEnabled
                      ? "You can view this account, but only an owner can change it."
                      : "Read-only account: management controls are hidden."}
                  </p>
                )}
              </div>
            );
          })}
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
