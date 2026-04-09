import { randomBytes, randomUUID, scryptSync } from "node:crypto";

import { neon } from "@neondatabase/serverless";

type SeedUser = {
  username: string;
  password: string;
  displayName: string;
  role: "OWNER" | "MANAGER" | "VIEWER" | "CUSTOMER";
  planTier: "INTERNAL" | "FREE" | "PAID";
};

const TERMS_VERSION = "2026-04-06-private-beta-v1";

const USERS: SeedUser[] = [
  {
    username: "MichaelPolevoy",
    password: "0525786222",
    displayName: "Michael Polevoy",
    role: "OWNER",
    planTier: "INTERNAL",
  },
  {
    username: "MichaelPolevoy1",
    password: "0525786222",
    displayName: "Michael Polevoy 1",
    role: "CUSTOMER",
    planTier: "FREE",
  },
];

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("hex");
}

async function main() {
  const databaseUrl =
    process.env.THE_BOOK_AUTHOR_BETA_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    "";

  if (!databaseUrl) {
    throw new Error("Missing THE_BOOK_AUTHOR_BETA_DATABASE_URL or DATABASE_URL.");
  }

  const sql = neon(databaseUrl);

  await sql`
    CREATE TABLE IF NOT EXISTS beta_users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'CUSTOMER',
      plan_tier TEXT NOT NULL DEFAULT 'FREE',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      terms_version TEXT NOT NULL,
      terms_accepted_at TIMESTAMPTZ NOT NULL,
      ban_reason TEXT,
      banned_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS beta_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES beta_users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE beta_users ADD COLUMN IF NOT EXISTS plan_tier TEXT NOT NULL DEFAULT 'FREE'`;
  await sql`UPDATE beta_users SET role = 'OWNER' WHERE role = 'ADMIN'`;
  await sql`UPDATE beta_users SET role = 'CUSTOMER' WHERE role = 'USER'`;
  await sql`
    UPDATE beta_users
    SET plan_tier = CASE
      WHEN role = 'CUSTOMER' THEN COALESCE(NULLIF(plan_tier, ''), 'FREE')
      ELSE 'INTERNAL'
    END
  `;

  for (const user of USERS) {
    const normalizedUsername = user.username.trim().toLowerCase();
    const salt = randomBytes(16).toString("hex");
    const passwordHash = hashPassword(user.password, salt);
    const existing = await sql`
      SELECT id
      FROM beta_users
      WHERE username = ${normalizedUsername}
      LIMIT 1
    `;

    if (Array.isArray(existing) && existing.length > 0) {
      const userId = String(existing[0].id);
      await sql`
        UPDATE beta_users
        SET
          display_name = ${user.displayName},
          password_hash = ${passwordHash},
          password_salt = ${salt},
          role = ${user.role},
          plan_tier = ${user.planTier},
          status = 'ACTIVE',
          terms_version = ${TERMS_VERSION},
          terms_accepted_at = NOW(),
          ban_reason = '',
          banned_at = NULL,
          updated_at = NOW()
        WHERE id = ${userId}
      `;
      await sql`DELETE FROM beta_sessions WHERE user_id = ${userId}`;
      continue;
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
        ${normalizedUsername},
        ${user.displayName},
        ${passwordHash},
        ${salt},
        ${user.role},
        ${user.planTier},
        'ACTIVE',
        ${TERMS_VERSION},
        NOW()
      )
    `;
  }

  console.log(`Seeded ${USERS.length} hosted beta users.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
