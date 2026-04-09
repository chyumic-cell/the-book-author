import "server-only";

import path from "node:path";

import { PrismaClient as LocalPrismaClient } from "@prisma/client";
import { PrismaClient as HostedPrismaClient } from "@/generated/hosted-prisma";

type AppPrismaClient = LocalPrismaClient;

declare global {
  var prisma: AppPrismaClient | undefined;
}

function normalizeSqliteUrl(databaseUrl: string | undefined) {
  if (!databaseUrl?.startsWith("file:")) {
    return databaseUrl;
  }

  const rawPath = databaseUrl.slice("file:".length);
  if (!rawPath) {
    return databaseUrl;
  }

  const normalizedRawPath = rawPath.replace(/\\/g, "/");
  if (/^[A-Za-z]:\//.test(normalizedRawPath)) {
    return `file:${normalizedRawPath}`;
  }

  return `file:${path.resolve(process.cwd(), rawPath).replace(/\\/g, "/")}`;
}

process.env.DATABASE_URL = normalizeSqliteUrl(process.env.DATABASE_URL);

function isHostedDatabaseUrl(databaseUrl: string | undefined) {
  return /^postgres(ql)?:\/\//i.test((databaseUrl ?? "").trim());
}

function createPrismaClient(): AppPrismaClient {
  if (isHostedDatabaseUrl(process.env.DATABASE_URL)) {
    return new HostedPrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    }) as unknown as AppPrismaClient;
  }

  return new LocalPrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma =
  global.prisma ??
  createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
