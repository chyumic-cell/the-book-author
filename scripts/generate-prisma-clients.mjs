import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function runGenerate(schemaPath, extraEnv = {}) {
  const absoluteSchemaPath = path.resolve(repoRoot, schemaPath);
  const prismaCliPath = path.resolve(repoRoot, "node_modules", "prisma", "build", "index.js");
  const result = spawnSync(process.execPath, [prismaCliPath, "generate", "--schema", absoluteSchemaPath], {
    cwd: repoRoot,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const currentDatabaseUrl = (process.env.DATABASE_URL ?? "").trim();
const hostedDatabaseUrl =
  (process.env.HOSTED_DATABASE_URL ?? process.env.THE_BOOK_AUTHOR_BETA_DATABASE_URL ?? "").trim() ||
  (/^postgres(ql)?:\/\//i.test(currentDatabaseUrl)
    ? currentDatabaseUrl
    : "postgresql://placeholder:placeholder@localhost:5432/the_book_author");

runGenerate("prisma/schema.prisma");
runGenerate("prisma/hosted.schema.prisma", {
  DATABASE_URL: hostedDatabaseUrl,
});
