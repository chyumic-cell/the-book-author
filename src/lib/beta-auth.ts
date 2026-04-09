import "server-only";

import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { APP_NAME } from "@/lib/brand";
import { getStoryForgeTermsVersion } from "@/lib/beta-legal";
import { getStoryForgeOwnerUsernames, isHostedBetaEnabled } from "@/lib/hosted-beta-config";
import { runHostedBetaQuery } from "@/lib/hosted-beta-db";

export type BetaUserRecord = {
  id: string;
  username: string;
  displayName: string;
  role: "ADMIN" | "USER";
  status: "ACTIVE" | "BANNED";
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

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("hex");
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function parseUserRow(row: Record<string, unknown>): BetaUserRecord {
  return {
    id: String(row.id),
    username: String(row.username),
    displayName: String(row.display_name),
    role: row.role === "ADMIN" ? "ADMIN" : "USER",
    status: row.status === "BANNED" ? "BANNED" : "ACTIVE",
    termsVersion: String(row.terms_version ?? ""),
    termsAcceptedAt: String(row.terms_accepted_at ?? ""),
    banReason: String(row.ban_reason ?? ""),
    bannedAt: String(row.banned_at ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    lastLoginAt: String(row.last_login_at ?? ""),
  };
}

function asRowArray(value: unknown) {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
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

function isOwnerUsername(username: string) {
  return getStoryForgeOwnerUsernames().includes(normalizeUsername(username));
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
  const displayName = input.displayName.trim() || username;
  const salt = randomBytes(16).toString("hex");
  const passwordHash = hashPassword(input.password, salt);
  const role = isOwnerUsername(username) ? "ADMIN" : "USER";
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

  const user = await runHostedBetaQuery(async (sql) => {
    const rows = asRowArray(await sql`
      SELECT * FROM beta_users WHERE username = ${username} LIMIT 1
    `);
    return rows[0] ? (rows[0] as Record<string, unknown>) : null;
  });

  if (!user) {
    throw new Error("Invalid username or password.");
  }

  if (String(user.status) === "BANNED") {
    const reason = String(user.ban_reason ?? "").trim();
    throw new Error(reason ? `This account has been banned. Reason: ${reason}` : "This account has been banned.");
  }

  const expectedHash = String(user.password_hash);
  const actualHash = hashPassword(input.password, String(user.password_salt));
  const matches = timingSafeEqual(Buffer.from(expectedHash, "hex"), Buffer.from(actualHash, "hex"));

  if (!matches) {
    throw new Error("Invalid username or password.");
  }

  await runHostedBetaQuery(async (sql) => {
    await sql`
      UPDATE beta_users
      SET last_login_at = NOW(), updated_at = NOW()
      WHERE id = ${String(user.id)}
    `;
  });

  const { token, expiresAt } = await createSession(String(user.id));
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

export async function requireBetaSession(options?: { admin?: boolean }) {
  const session = await getOptionalBetaSession();
  if (!session) {
    redirect("/sign-in");
  }

  if (options?.admin && session.user.role !== "ADMIN") {
    redirect("/account");
  }

  return session;
}

export async function listBetaUsers() {
  await requireBetaSession({ admin: true });

  return runHostedBetaQuery(async (sql) => {
    const rows = asRowArray(await sql`
      SELECT * FROM beta_users
      ORDER BY created_at DESC
    `);
    return rows.map((row) => parseUserRow(row as Record<string, unknown>));
  });
}

export async function updateBetaUserBan(userId: string, input: { banned: boolean; reason: string }) {
  const session = await requireBetaSession({ admin: true });

  if (session.user.id === userId && input.banned) {
    throw new Error("You cannot ban the currently signed-in admin account.");
  }

  await runHostedBetaQuery(async (sql) => {
    await sql`
      UPDATE beta_users
      SET
        status = ${input.banned ? "BANNED" : "ACTIVE"},
        ban_reason = ${input.banned ? input.reason.trim() : ""},
        banned_at = ${input.banned ? new Date().toISOString() : null}::timestamptz,
        updated_at = NOW()
      WHERE id = ${userId}
    `;
  });
}
