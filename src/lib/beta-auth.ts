import "server-only";

import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { APP_NAME } from "@/lib/brand";
import { getStoryForgeTermsVersion } from "@/lib/beta-legal";
import { getStoryForgeOwnerUsernames, isHostedBetaEnabled } from "@/lib/hosted-beta-config";
import { runHostedBetaQuery } from "@/lib/hosted-beta-db";

export type BetaUserRole = "OWNER" | "MANAGER" | "VIEWER" | "CUSTOMER";
export type BetaUserPlanTier = "INTERNAL" | "FREE" | "PAID";
export type BetaUserStatus = "ACTIVE" | "BANNED";

export type BetaUserRecord = {
  id: string;
  username: string;
  displayName: string;
  role: BetaUserRole;
  planTier: BetaUserPlanTier;
  status: BetaUserStatus;
  termsVersion: string;
  termsAcceptedAt: string;
  banReason: string;
  bannedAt: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
};

export type BetaSessionRecord = {
  user: BetaUserRecord;
  sessionId: string;
  expiresAt: string;
};

const SESSION_COOKIE_NAME = "the_book_author_beta_session";
const SESSION_TTL_DAYS = 30;

const ROLE_ORDER: Record<BetaUserRole, number> = {
  CUSTOMER: 0,
  VIEWER: 1,
  MANAGER: 2,
  OWNER: 3,
};

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("hex");
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function asRowArray(value: unknown) {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function normalizeRole(value: unknown): BetaUserRole {
  switch (String(value ?? "").trim().toUpperCase()) {
    case "OWNER":
    case "ADMIN":
      return "OWNER";
    case "MANAGER":
      return "MANAGER";
    case "VIEWER":
      return "VIEWER";
    case "CUSTOMER":
    case "USER":
    default:
      return "CUSTOMER";
  }
}

function normalizePlanTier(value: unknown, role: BetaUserRole): BetaUserPlanTier {
  if (role !== "CUSTOMER") {
    return "INTERNAL";
  }

  return String(value ?? "").trim().toUpperCase() === "PAID" ? "PAID" : "FREE";
}

function normalizeStatus(value: unknown): BetaUserStatus {
  return String(value ?? "").trim().toUpperCase() === "BANNED" ? "BANNED" : "ACTIVE";
}

function parseUserRow(row: Record<string, unknown>): BetaUserRecord {
  const role = normalizeRole(row.role);
  return {
    id: String(row.id),
    username: String(row.username),
    displayName: String(row.display_name),
    role,
    planTier: normalizePlanTier(row.plan_tier, role),
    status: normalizeStatus(row.status),
    termsVersion: String(row.terms_version ?? ""),
    termsAcceptedAt: String(row.terms_accepted_at ?? ""),
    banReason: String(row.ban_reason ?? ""),
    bannedAt: String(row.banned_at ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    lastLoginAt: String(row.last_login_at ?? ""),
  };
}

function validateUsername(username: string) {
  const normalized = normalizeUsername(username);
  if (!/^[a-z0-9._-]{3,32}$/.test(normalized)) {
    throw new Error("Usernames must be 3 to 32 characters and use only letters, numbers, dots, dashes, or underscores.");
  }

  return normalized;
}

function validatePassword(password: string) {
  if (password.length < 8) {
    throw new Error("Passwords must be at least 8 characters long.");
  }
}

function validateDisplayName(value: string, fallback: string) {
  const trimmed = value.trim();
  return trimmed || fallback;
}

function isOwnerUsername(username: string) {
  return getStoryForgeOwnerUsernames().includes(normalizeUsername(username));
}

function hasMinimumRole(user: BetaUserRecord, minimumRole: BetaUserRole) {
  return ROLE_ORDER[user.role] >= ROLE_ORDER[minimumRole];
}

export function canViewAdminConsole(user: BetaUserRecord) {
  return hasMinimumRole(user, "VIEWER");
}

export function canManageUsers(user: BetaUserRecord) {
  return hasMinimumRole(user, "MANAGER");
}

export function canManageTargetUser(actor: BetaUserRecord, target: BetaUserRecord) {
  return canManageTarget(actor, target);
}

function canAssignRole(actor: BetaUserRecord, nextRole: BetaUserRole) {
  if (actor.role === "OWNER") {
    return true;
  }

  if (actor.role === "MANAGER") {
    return nextRole === "VIEWER" || nextRole === "CUSTOMER";
  }

  return false;
}

function canManageTarget(actor: BetaUserRecord, target: BetaUserRecord) {
  if (actor.role === "OWNER") {
    return true;
  }

  if (actor.role === "MANAGER") {
    return target.role === "VIEWER" || target.role === "CUSTOMER";
  }

  return false;
}

function normalizeRequestedRole(value: string) {
  return normalizeRole(value);
}

function normalizeRequestedPlanTier(value: string, role: BetaUserRole) {
  return normalizePlanTier(value, role);
}

async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashSessionToken(token);
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await runHostedBetaQuery(async (sql) => {
    await sql`
      INSERT INTO beta_sessions (id, user_id, token_hash, expires_at)
      VALUES (${sessionId}, ${userId}, ${tokenHash}, ${expiresAt.toISOString()}::timestamptz)
    `;
  });

  return { token, expiresAt };
}

async function findUserByUsername(username: string) {
  return runHostedBetaQuery(async (sql) => {
    const rows = asRowArray(await sql`
      SELECT * FROM beta_users WHERE username = ${username} LIMIT 1
    `);
    return rows[0] ? parseUserRow(rows[0] as Record<string, unknown>) : null;
  });
}

async function findUserById(userId: string) {
  return runHostedBetaQuery(async (sql) => {
    const rows = asRowArray(await sql`
      SELECT * FROM beta_users WHERE id = ${userId} LIMIT 1
    `);
    return rows[0] ? parseUserRow(rows[0] as Record<string, unknown>) : null;
  });
}

async function countOwners() {
  return runHostedBetaQuery(async (sql) => {
    const rows = asRowArray(await sql`
      SELECT COUNT(*)::int AS count
      FROM beta_users
      WHERE role IN ('OWNER', 'ADMIN')
        AND status = 'ACTIVE'
    `);
    return Number(rows[0]?.count ?? 0);
  });
}

async function assertCanManageTarget(actor: BetaUserRecord, target: BetaUserRecord, nextRole?: BetaUserRole) {
  if (!canManageUsers(actor)) {
    throw new Error("Your account does not have permission to manage users.");
  }

  if (!canManageTarget(actor, target)) {
    throw new Error("You do not have permission to manage this account.");
  }

  if (nextRole && !canAssignRole(actor, nextRole)) {
    throw new Error("You do not have permission to assign that role.");
  }

  if (target.id === actor.id && nextRole && nextRole !== actor.role) {
    throw new Error("Change your own role from a different owner account to avoid locking yourself out.");
  }
}

async function upsertBetaUserRecord(input: {
  username: string;
  password: string;
  displayName: string;
  role: BetaUserRole;
  planTier: BetaUserPlanTier;
}) {
  const username = validateUsername(input.username);
  validatePassword(input.password);
  const displayName = validateDisplayName(input.displayName, username);
  const role = normalizeRequestedRole(input.role);
  const planTier = normalizeRequestedPlanTier(input.planTier, role);
  const salt = randomBytes(16).toString("hex");
  const passwordHash = hashPassword(input.password, salt);
  const termsVersion = getStoryForgeTermsVersion();
  const existing = await findUserByUsername(username);

  await runHostedBetaQuery(async (sql) => {
    if (existing) {
      await sql`
        UPDATE beta_users
        SET
          display_name = ${displayName},
          password_hash = ${passwordHash},
          password_salt = ${salt},
          role = ${role},
          plan_tier = ${planTier},
          status = 'ACTIVE',
          terms_version = ${termsVersion},
          terms_accepted_at = NOW(),
          ban_reason = '',
          banned_at = NULL,
          updated_at = NOW()
        WHERE id = ${existing.id}
      `;
      return;
    }

    await sql`
      INSERT INTO beta_users (
        id,
        username,
        display_name,
        password_hash,
        password_salt,
        role,
        plan_tier,
        status,
        terms_version,
        terms_accepted_at
      )
      VALUES (
        ${randomUUID()},
        ${username},
        ${displayName},
        ${passwordHash},
        ${salt},
        ${role},
        ${planTier},
        'ACTIVE',
        ${termsVersion},
        NOW()
      )
    `;
  });
}

export async function seedBetaUserAccount(input: {
  username: string;
  password: string;
  displayName: string;
  role: BetaUserRole;
  planTier?: BetaUserPlanTier;
}) {
  if (!isHostedBetaEnabled()) {
    throw new Error("Hosted beta mode is not enabled.");
  }

  await upsertBetaUserRecord({
    ...input,
    planTier: input.planTier ?? (input.role === "CUSTOMER" ? "FREE" : "INTERNAL"),
  });
}

export async function setBetaSessionCookie(token: string, expiresAt: Date) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearBetaSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
}

export async function signUpBetaUser(input: {
  username: string;
  password: string;
  displayName: string;
  agreedToTerms: boolean;
}) {
  if (!isHostedBetaEnabled()) {
    throw new Error("Hosted beta mode is not enabled.");
  }

  if (!input.agreedToTerms) {
    throw new Error(`You must agree to the ${APP_NAME} Terms and Publishing Policy before creating an account.`);
  }

  const username = validateUsername(input.username);
  validatePassword(input.password);
  const displayName = validateDisplayName(input.displayName, username);
  const role: BetaUserRole = isOwnerUsername(username) ? "OWNER" : "CUSTOMER";
  const planTier: BetaUserPlanTier = role === "CUSTOMER" ? "FREE" : "INTERNAL";
  const salt = randomBytes(16).toString("hex");
  const passwordHash = hashPassword(input.password, salt);
  const userId = randomUUID();
  const termsVersion = getStoryForgeTermsVersion();

  await runHostedBetaQuery(async (sql) => {
    const existing = asRowArray(await sql`
      SELECT id FROM beta_users WHERE username = ${username} LIMIT 1
    `);
    if (existing.length > 0) {
      throw new Error("That username is already taken.");
    }

    await sql`
      INSERT INTO beta_users (
        id,
        username,
        display_name,
        password_hash,
        password_salt,
        role,
        plan_tier,
        status,
        terms_version,
        terms_accepted_at
      )
      VALUES (
        ${userId},
        ${username},
        ${displayName},
        ${passwordHash},
        ${salt},
        ${role},
        ${planTier},
        'ACTIVE',
        ${termsVersion},
        NOW()
      )
    `;
  });

  const { token, expiresAt } = await createSession(userId);
  await setBetaSessionCookie(token, expiresAt);
}

export async function signInBetaUser(input: { username: string; password: string }) {
  if (!isHostedBetaEnabled()) {
    throw new Error("Hosted beta mode is not enabled.");
  }

  const username = validateUsername(input.username);
  validatePassword(input.password);

  const userRow = await runHostedBetaQuery(async (sql) => {
    const rows = asRowArray(await sql`
      SELECT * FROM beta_users WHERE username = ${username} LIMIT 1
    `);
    return rows[0] ? (rows[0] as Record<string, unknown>) : null;
  });

  if (!userRow) {
    throw new Error("Invalid username or password.");
  }

  const user = parseUserRow(userRow);

  if (user.status === "BANNED") {
    const reason = user.banReason.trim();
    throw new Error(reason ? `This account has been banned. Reason: ${reason}` : "This account has been banned.");
  }

  const expectedHash = String(userRow.password_hash);
  const actualHash = hashPassword(input.password, String(userRow.password_salt));
  const matches = timingSafeEqual(Buffer.from(expectedHash, "hex"), Buffer.from(actualHash, "hex"));

  if (!matches) {
    throw new Error("Invalid username or password.");
  }

  await runHostedBetaQuery(async (sql) => {
    await sql`
      UPDATE beta_users
      SET last_login_at = NOW(), updated_at = NOW()
      WHERE id = ${user.id}
    `;
  });

  const { token, expiresAt } = await createSession(user.id);
  await setBetaSessionCookie(token, expiresAt);
}

export async function signOutBetaUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? "";

  if (token) {
    const tokenHash = hashSessionToken(token);
    await runHostedBetaQuery(async (sql) => {
      await sql`
        DELETE FROM beta_sessions WHERE token_hash = ${tokenHash}
      `;
    });
  }

  await clearBetaSessionCookie();
}

export async function getOptionalBetaSession() {
  if (!isHostedBetaEnabled()) {
    return null;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? "";
  if (!token) {
    return null;
  }

  const tokenHash = hashSessionToken(token);

  const row = await runHostedBetaQuery(async (sql) => {
    const rows = asRowArray(await sql`
      SELECT
        s.id AS session_id,
        s.expires_at,
        u.*
      FROM beta_sessions s
      JOIN beta_users u ON u.id = s.user_id
      WHERE s.token_hash = ${tokenHash}
        AND s.expires_at > NOW()
      LIMIT 1
    `);
    return rows[0] ? (rows[0] as Record<string, unknown>) : null;
  });

  if (!row) {
    await clearBetaSessionCookie();
    return null;
  }

  const user = parseUserRow(row);
  if (user.status === "BANNED") {
    await clearBetaSessionCookie();
    return null;
  }

  await runHostedBetaQuery(async (sql) => {
    await sql`
      UPDATE beta_sessions
      SET last_seen_at = NOW()
      WHERE id = ${String(row.session_id)}
    `;
  });

  return {
    sessionId: String(row.session_id),
    expiresAt: String(row.expires_at ?? ""),
    user,
  } satisfies BetaSessionRecord;
}

export async function requireBetaSession(options?: { admin?: boolean; minimumRole?: BetaUserRole }) {
  const session = await getOptionalBetaSession();
  if (!session) {
    redirect("/sign-in");
  }

  const minimumRole = options?.minimumRole ?? (options?.admin ? "VIEWER" : "CUSTOMER");
  if (!hasMinimumRole(session.user, minimumRole)) {
    redirect("/account");
  }

  return session;
}

export async function listBetaUsers() {
  await requireBetaSession({ minimumRole: "VIEWER" });

  return runHostedBetaQuery(async (sql) => {
    const rows = asRowArray(await sql`
      SELECT * FROM beta_users
      ORDER BY
        CASE role
          WHEN 'OWNER' THEN 0
          WHEN 'ADMIN' THEN 0
          WHEN 'MANAGER' THEN 1
          WHEN 'VIEWER' THEN 2
          ELSE 3
        END,
        created_at ASC
    `);
    return rows.map((row) => parseUserRow(row as Record<string, unknown>));
  });
}

export async function createBetaUserByAdmin(input: {
  username: string;
  password: string;
  displayName: string;
  role: string;
  planTier: string;
}) {
  const session = await requireBetaSession({ minimumRole: "MANAGER" });
  const role = normalizeRequestedRole(input.role);
  const username = validateUsername(input.username);

  if (!canAssignRole(session.user, role)) {
    throw new Error("You do not have permission to create that account type.");
  }

  const existing = await findUserByUsername(username);
  if (existing) {
    throw new Error("That username is already taken.");
  }

  await upsertBetaUserRecord({
    username,
    password: input.password,
    displayName: input.displayName,
    role,
    planTier: normalizeRequestedPlanTier(input.planTier, role),
  });
}

export async function updateBetaUserProfile(
  userId: string,
  input: {
    displayName: string;
    role: string;
    planTier: string;
  },
) {
  const session = await requireBetaSession({ minimumRole: "MANAGER" });
  const target = await findUserById(userId);
  if (!target) {
    throw new Error("That account no longer exists.");
  }

  const nextRole = normalizeRequestedRole(input.role);
  const nextPlanTier = normalizeRequestedPlanTier(input.planTier, nextRole);
  await assertCanManageTarget(session.user, target, nextRole);

  if (target.role === "OWNER" && nextRole !== "OWNER") {
    const owners = await countOwners();
    if (owners <= 1) {
      throw new Error("The last owner account cannot be demoted.");
    }
  }

  const displayName = validateDisplayName(input.displayName, target.username);

  await runHostedBetaQuery(async (sql) => {
    await sql`
      UPDATE beta_users
      SET
        display_name = ${displayName},
        role = ${nextRole},
        plan_tier = ${nextPlanTier},
        updated_at = NOW()
      WHERE id = ${target.id}
    `;
  });
}

export async function resetBetaUserPassword(userId: string, nextPassword: string) {
  const session = await requireBetaSession({ minimumRole: "MANAGER" });
  const target = await findUserById(userId);
  if (!target) {
    throw new Error("That account no longer exists.");
  }

  await assertCanManageTarget(session.user, target);
  validatePassword(nextPassword);

  const salt = randomBytes(16).toString("hex");
  const passwordHash = hashPassword(nextPassword, salt);

  await runHostedBetaQuery(async (sql) => {
    await sql`
      UPDATE beta_users
      SET
        password_hash = ${passwordHash},
        password_salt = ${salt},
        updated_at = NOW()
      WHERE id = ${target.id}
    `;
    await sql`
      DELETE FROM beta_sessions
      WHERE user_id = ${target.id}
    `;
  });
}

export async function updateBetaUserBan(userId: string, input: { banned: boolean; reason: string }) {
  const session = await requireBetaSession({ minimumRole: "MANAGER" });
  const target = await findUserById(userId);
  if (!target) {
    throw new Error("That account no longer exists.");
  }

  if (session.user.id === userId && input.banned) {
    throw new Error("You cannot ban the currently signed-in account.");
  }

  await assertCanManageTarget(session.user, target);

  if (target.role === "OWNER" && input.banned) {
    const owners = await countOwners();
    if (owners <= 1) {
      throw new Error("The last owner account cannot be banned.");
    }
  }

  await runHostedBetaQuery(async (sql) => {
    await sql`
      UPDATE beta_users
      SET
        status = ${input.banned ? "BANNED" : "ACTIVE"},
        ban_reason = ${input.banned ? input.reason.trim() : ""},
        banned_at = ${input.banned ? new Date().toISOString() : null}::timestamptz,
        updated_at = NOW()
      WHERE id = ${target.id}
    `;

    if (input.banned) {
      await sql`
        DELETE FROM beta_sessions
        WHERE user_id = ${target.id}
      `;
    }
  });
}
