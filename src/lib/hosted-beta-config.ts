import "server-only";

export const STORYFORGE_TERMS_VERSION = "2026-04-06-private-beta-v1";
export const STORYFORGE_TERMS_LAST_UPDATED = "April 6, 2026";

function splitCsv(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isHostedBetaEnabled() {
  return (process.env.THE_BOOK_AUTHOR_HOSTED_BETA ?? process.env.STORYFORGE_HOSTED_BETA)?.trim() === "true";
}

export function getHostedBetaDatabaseUrl() {
  const explicit = (process.env.THE_BOOK_AUTHOR_BETA_DATABASE_URL ?? process.env.STORYFORGE_BETA_DATABASE_URL)?.trim();
  if (explicit) {
    return explicit;
  }

  const shared = process.env.DATABASE_URL?.trim();
  if (shared && /^postgres(ql)?:\/\//i.test(shared)) {
    return shared;
  }

  return "";
}

export function getStoryForgeOwnerName() {
  return (process.env.THE_BOOK_AUTHOR_OWNER_NAME ?? process.env.STORYFORGE_OWNER_NAME)?.trim() || "Michael William Polevoy";
}

export function getStoryForgeOwnerUsernames() {
  const configured = splitCsv(process.env.THE_BOOK_AUTHOR_OWNER_USERNAMES ?? process.env.STORYFORGE_OWNER_USERNAMES);
  const defaults = ["michael", "michaelpolevoy", "mwpolevoy", "the-book-author-owner"];
  return Array.from(new Set([...configured, ...defaults]));
}

export function getHostedSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.THE_BOOK_AUTHOR_APP_URL?.trim() ||
    process.env.STORYFORGE_APP_URL?.trim() ||
    "http://localhost:3000"
  );
}

export function getOpenRouterKeysUrl() {
  return process.env.OPENROUTER_SETUP_URL?.trim() || "https://openrouter.ai/keys";
}

export function getSupportEmailAddress() {
  return (process.env.THE_BOOK_AUTHOR_SUPPORT_EMAIL ?? process.env.STORYFORGE_SUPPORT_EMAIL)?.trim() || "";
}

export function getDesktopInstallerDownloadUrl() {
  return (
    process.env.THE_BOOK_AUTHOR_INSTALLER_URL?.trim() ||
    process.env.STORYFORGE_INSTALLER_URL?.trim() ||
    ""
  );
}
