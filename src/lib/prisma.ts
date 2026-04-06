import "server-only";

import path from "node:path";

import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
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

export const prisma =
  global.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
