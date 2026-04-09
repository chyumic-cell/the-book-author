import "server-only";

import path from "node:path";

import { PrismaClient as LocalPrismaClient } from "@prisma/client";
import { PrismaClient as HostedPrismaClient } from "@/generated/hosted-prisma";
import { getHostedBetaDatabaseUrl } from "@/lib/hosted-beta-config";

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

const effectiveDatabaseUrl = normalizeSqliteUrl(process.env.DATABASE_URL ?? getHostedBetaDatabaseUrl());

if (effectiveDatabaseUrl) {
  process.env.DATABASE_URL = effectiveDatabaseUrl;
}

function isHostedDatabaseUrl(databaseUrl: string | undefined) {
  return /^postgres(ql)?:\/\//i.test((databaseUrl ?? "").trim());
}

function createPrismaClient(): AppPrismaClient {
  if (isHostedDatabaseUrl(effectiveDatabaseUrl)) {
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
