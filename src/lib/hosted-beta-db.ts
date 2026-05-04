import "server-only";

import { neon } from "@neondatabase/serverless";

import { getHostedBetaDatabaseUrl, isHostedBetaEnabled } from "@/lib/hosted-beta-config";

type HostedBetaSql = ReturnType<typeof neon>;

let sqlSingleton: HostedBetaSql | null = null;
let initPromise: Promise<void> | null = null;

function getSql() {
  const url = getHostedBetaDatabaseUrl();
  if (!url) {
    throw new Error(
      "Hosted beta database is not configured. Set THE_BOOK_AUTHOR_BETA_DATABASE_URL to a Neon Postgres connection string.",
    );
  }

  if (!sqlSingleton) {
    sqlSingleton = neon(url);
  }

  return sqlSingleton;
}

export async function ensureHostedBetaSchema() {
  if (!isHostedBetaEnabled()) {
    return;
  }

  if (!initPromise) {
    initPromise = (async () => {
      const sql = getSql();

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

      await sql`ALTER TABLE beta_users ADD COLUMN IF NOT EXISTS plan_tier TEXT NOT NULL DEFAULT 'FREE'`;
      await sql`ALTER TABLE beta_users ADD COLUMN IF NOT EXISTS provider_settings_json TEXT NOT NULL DEFAULT ''`;
      await sql`UPDATE beta_users SET role = 'OWNER' WHERE role = 'ADMIN'`;
      await sql`UPDATE beta_users SET role = 'CUSTOMER' WHERE role = 'USER'`;
      await sql`
        UPDATE beta_users
        SET plan_tier = CASE
          WHEN role = 'CUSTOMER' THEN COALESCE(NULLIF(plan_tier, ''), 'FREE')
          ELSE 'INTERNAL'
        END
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

      await sql`
        CREATE TABLE IF NOT EXISTS feedback_submissions (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES beta_users(id) ON DELETE SET NULL,
          username_snapshot TEXT NOT NULL,
          subject TEXT NOT NULL,
          message TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'OPEN',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS export_mirrors (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES beta_users(id) ON DELETE SET NULL,
          username_snapshot TEXT NOT NULL,
          export_format TEXT NOT NULL,
          book_title TEXT NOT NULL,
          author_name TEXT NOT NULL,
          back_cover_summary TEXT NOT NULL,
          export_payload_json TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`CREATE INDEX IF NOT EXISTS idx_beta_sessions_user_id ON beta_sessions(user_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_feedback_submissions_user_id ON feedback_submissions(user_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_export_mirrors_user_id ON export_mirrors(user_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_beta_users_status ON beta_users(status)`;
    })();
  }

  await initPromise;
}

export async function runHostedBetaQuery<T>(callback: (sql: HostedBetaSql) => Promise<T>) {
  await ensureHostedBetaSchema();
  return callback(getSql());
}
