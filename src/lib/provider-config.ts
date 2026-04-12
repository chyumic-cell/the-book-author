import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import type { ProviderKind, ProviderSettingsRecord } from "@/types/storyforge";

import { APP_NAME } from "@/lib/brand";
import { isHostedBetaEnabled } from "@/lib/hosted-beta-config";
import { providerModelSwitchSchema, providerSettingsSchema } from "@/lib/schemas";

const providerConfigRoot = process.env.THE_BOOK_AUTHOR_CONFIG_DIR || process.env.STORYFORGE_CONFIG_DIR || process.cwd();
const providerConfigPath = path.join(providerConfigRoot, ".the-book-author.providers.json");
const useHostedReadOnlyProviderConfig = isHostedBetaEnabled();
const hostedOpenRouterModel = "openrouter/auto";

export const OPENROUTER_SETUP_URL = process.env.OPENROUTER_SETUP_URL ?? "https://openrouter.ai/keys";
const REQUIRE_PERSONAL_AI_KEY =
  (process.env.THE_BOOK_AUTHOR_REQUIRE_PERSONAL_AI_KEY ?? process.env.STORYFORGE_REQUIRE_PERSONAL_AI_KEY) === "true";

type ProviderSecrets = {
  activeProvider: ProviderKind;
  useMockFallback: boolean;
  openai: {
    apiKey: string;
    model: string;
  };
  openrouter: {
    apiKey: string;
    model: string;
    baseUrl: string;
    siteUrl: string;
    appName: string;
  };
  custom: {
    apiKey: string;
    label: string;
    baseUrl: string;
    model: string;
  };
};

export type ResolvedProviderConfig = {
  kind: Exclude<ProviderKind, "MOCK">;
  label: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
};

export type ProviderSetupStatus = {
  activeProvider: ProviderKind;
  openRouterSetupUrl: string;
  providerReady: boolean;
  requiresPersonalKey: boolean;
  setupMessage: string;
  useMockFallback: boolean;
};

function normalizeProviderKind(value: string | undefined | null): ProviderKind | null {
  switch ((value ?? "").trim().toUpperCase()) {
    case "OPENAI":
      return "OPENAI";
    case "OPENROUTER":
      return "OPENROUTER";
    case "CUSTOM":
      return "CUSTOM";
    case "MOCK":
      return "MOCK";
    default:
      return null;
  }
}

const envDefaultProvider = normalizeProviderKind(
  process.env.THE_BOOK_AUTHOR_DEFAULT_PROVIDER ?? process.env.STORYFORGE_DEFAULT_PROVIDER,
);
const envUseMockValue = (process.env.USE_MOCK_AI ?? "").trim().toLowerCase();

const defaultSecrets: ProviderSecrets = {
  activeProvider: envDefaultProvider ?? (REQUIRE_PERSONAL_AI_KEY ? "OPENROUTER" : "MOCK"),
  useMockFallback:
    envUseMockValue === "true"
      ? true
      : envUseMockValue === "false"
        ? false
        : !REQUIRE_PERSONAL_AI_KEY,
  openai: {
    apiKey: (process.env.OPENAI_API_KEY ?? "").trim(),
    model: (process.env.OPENAI_MODEL ?? "gpt-4.1-mini").trim(),
  },
  openrouter: {
    apiKey: (process.env.OPENROUTER_API_KEY ?? "").trim(),
    model: (useHostedReadOnlyProviderConfig ? hostedOpenRouterModel : process.env.OPENROUTER_MODEL ?? "openrouter/auto").trim(),
    baseUrl: (process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").trim(),
    siteUrl: (process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000").trim(),
    appName: (process.env.OPENROUTER_APP_NAME ?? APP_NAME).trim(),
  },
  custom: {
    apiKey: (process.env.CUSTOM_AI_API_KEY ?? "").trim(),
    label: (process.env.CUSTOM_AI_LABEL ?? "Custom compatible API").trim(),
    baseUrl: (process.env.CUSTOM_AI_BASE_URL ?? "").trim(),
    model: (process.env.CUSTOM_AI_MODEL ?? "").trim(),
  },
};

function maskKey(value: string) {
  if (!value) {
    return "";
  }

  if (value.length <= 8) {
    return "********";
  }

  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

async function readProviderSecrets(): Promise<ProviderSecrets> {
  if (useHostedReadOnlyProviderConfig) {
    return defaultSecrets;
  }

  try {
    const raw = await fs.readFile(providerConfigPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<ProviderSecrets>;

    return {
      ...defaultSecrets,
      ...parsed,
      openai: { ...defaultSecrets.openai, ...(parsed.openai ?? {}) },
      openrouter: { ...defaultSecrets.openrouter, ...(parsed.openrouter ?? {}) },
      custom: { ...defaultSecrets.custom, ...(parsed.custom ?? {}) },
    };
  } catch {
    return defaultSecrets;
  }
}

async function writeProviderSecrets(nextSecrets: ProviderSecrets) {
  if (useHostedReadOnlyProviderConfig) {
    throw new Error("Provider settings are managed by the hosted deployment right now and cannot be edited from the web app.");
  }

  await fs.writeFile(providerConfigPath, JSON.stringify(nextSecrets, null, 2));
}

function buildResolvedProvider(secrets: ProviderSecrets): ResolvedProviderConfig | null {
  if (secrets.activeProvider === "OPENAI" && secrets.openai.apiKey) {
    return {
      kind: "OPENAI",
      label: "OpenAI",
      apiKey: secrets.openai.apiKey,
      model: secrets.openai.model,
    };
  }

  if (secrets.activeProvider === "OPENROUTER" && secrets.openrouter.apiKey) {
    return {
      kind: "OPENROUTER",
      label: "OpenRouter",
      apiKey: secrets.openrouter.apiKey,
      model: secrets.openrouter.model,
      baseUrl: secrets.openrouter.baseUrl,
      defaultHeaders: {
        "HTTP-Referer": secrets.openrouter.siteUrl,
        "X-Title": secrets.openrouter.appName,
      },
    };
  }

  if (secrets.activeProvider === "CUSTOM" && secrets.custom.apiKey && secrets.custom.baseUrl && secrets.custom.model) {
    return {
      kind: "CUSTOM",
      label: secrets.custom.label || "Custom compatible API",
      apiKey: secrets.custom.apiKey,
      model: secrets.custom.model,
      baseUrl: secrets.custom.baseUrl,
    };
  }

  return null;
}

function buildSetupMessage(status: { providerReady: boolean; activeProvider: ProviderKind; useMockFallback: boolean }) {
  if (status.providerReady) {
    return "AI is configured and ready on this device.";
  }

  if (REQUIRE_PERSONAL_AI_KEY) {
    return "This install does not include an AI key. Add your own OpenRouter, OpenAI, or compatible API key on this device before using AI writing tools.";
  }

  if (status.useMockFallback) {
    return `No live AI key is configured. ${APP_NAME} can still fall back to mock mode until you add your own provider key.`;
  }

  return "No live AI provider is configured yet. Add your own OpenRouter, OpenAI, or compatible API key to enable AI features.";
}

export async function getProviderSetupStatus(): Promise<ProviderSetupStatus> {
  const secrets = await readProviderSecrets();
  const providerReady = Boolean(buildResolvedProvider(secrets) || (!REQUIRE_PERSONAL_AI_KEY && defaultSecrets.openai.apiKey));

  return {
    activeProvider: secrets.activeProvider,
    openRouterSetupUrl: OPENROUTER_SETUP_URL,
    providerReady,
    requiresPersonalKey: REQUIRE_PERSONAL_AI_KEY,
    setupMessage: buildSetupMessage({
      providerReady,
      activeProvider: secrets.activeProvider,
      useMockFallback: secrets.useMockFallback,
    }),
    useMockFallback: secrets.useMockFallback,
  };
}

export async function getProviderSettingsRecord(): Promise<ProviderSettingsRecord> {
  const secrets = await readProviderSecrets();
  const setupStatus = await getProviderSetupStatus();

  return {
    activeProvider: secrets.activeProvider,
    useMockFallback: secrets.useMockFallback,
    requiresPersonalKey: setupStatus.requiresPersonalKey,
    providerReady: setupStatus.providerReady,
    setupMessage: setupStatus.setupMessage,
    openRouterSetupUrl: setupStatus.openRouterSetupUrl,
    openai: {
      configured: Boolean(secrets.openai.apiKey),
      maskedKey: maskKey(secrets.openai.apiKey),
      model: secrets.openai.model,
    },
    openrouter: {
      configured: Boolean(secrets.openrouter.apiKey),
      maskedKey: maskKey(secrets.openrouter.apiKey),
      model: secrets.openrouter.model,
      baseUrl: secrets.openrouter.baseUrl,
      siteUrl: secrets.openrouter.siteUrl,
      appName: secrets.openrouter.appName,
    },
    custom: {
      configured: Boolean(secrets.custom.apiKey && secrets.custom.baseUrl && secrets.custom.model),
      maskedKey: maskKey(secrets.custom.apiKey),
      label: secrets.custom.label,
      baseUrl: secrets.custom.baseUrl,
      model: secrets.custom.model,
    },
  };
}

export async function saveProviderSettings(input: unknown) {
  const parsed = providerSettingsSchema.parse(input);
  const existing = await readProviderSecrets();

  const nextSecrets: ProviderSecrets = {
    activeProvider: parsed.activeProvider,
    useMockFallback: parsed.useMockFallback,
    openai: {
      apiKey: parsed.openai.clearKey
        ? ""
        : parsed.openai.apiKey?.trim()
          ? parsed.openai.apiKey.trim()
          : existing.openai.apiKey,
      model: parsed.openai.model,
    },
    openrouter: {
      apiKey: parsed.openrouter.clearKey
        ? ""
        : parsed.openrouter.apiKey?.trim()
          ? parsed.openrouter.apiKey.trim()
          : existing.openrouter.apiKey,
      model: parsed.openrouter.model,
      baseUrl: parsed.openrouter.baseUrl,
      siteUrl: parsed.openrouter.siteUrl,
      appName: parsed.openrouter.appName,
    },
    custom: {
      apiKey: parsed.custom.clearKey
        ? ""
        : parsed.custom.apiKey?.trim()
          ? parsed.custom.apiKey.trim()
          : existing.custom.apiKey,
      label: parsed.custom.label,
      baseUrl: parsed.custom.baseUrl,
      model: parsed.custom.model,
    },
  };

  await writeProviderSecrets(nextSecrets);
  return getProviderSettingsRecord();
}

export async function updateProviderModel(input: unknown) {
  const parsed = providerModelSwitchSchema.parse(input);
  const existing = await readProviderSecrets();

  const nextSecrets: ProviderSecrets = {
    ...existing,
    activeProvider: parsed.activate ? parsed.provider : existing.activeProvider,
    openai:
      parsed.provider === "OPENAI"
        ? {
            ...existing.openai,
            model: parsed.model.trim(),
          }
        : existing.openai,
    openrouter:
      parsed.provider === "OPENROUTER"
        ? {
            ...existing.openrouter,
            model: parsed.model.trim(),
          }
        : existing.openrouter,
    custom:
      parsed.provider === "CUSTOM"
        ? {
            ...existing.custom,
            model: parsed.model.trim(),
          }
        : existing.custom,
  };

  await writeProviderSecrets(nextSecrets);
  return getProviderSettingsRecord();
}

export async function resolveProviderRuntime(): Promise<ResolvedProviderConfig | null> {
  const secrets = await readProviderSecrets();
  const resolved = buildResolvedProvider(secrets);

  if (resolved) {
    return resolved;
  }

  if (secrets.useMockFallback) {
    return null;
  }

  if (defaultSecrets.openai.apiKey) {
    return {
      kind: "OPENAI",
      label: "OpenAI",
      apiKey: defaultSecrets.openai.apiKey,
      model: defaultSecrets.openai.model,
    };
  }

  return null;
}

export async function getDefaultProviderSecrets() {
  return structuredClone(defaultSecrets);
}
