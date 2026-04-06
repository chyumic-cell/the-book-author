"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { OpenRouterModelBadges } from "@/components/storyforge/openrouter-model-badges";
import { requestJson } from "@/components/storyforge/workspace-helpers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { APP_NAME } from "@/lib/brand";
import { getOpenRouterOptionLabel } from "@/lib/openrouter-model-display";

import type { SetupDraft } from "@/components/storyforge/workspace-helpers";
import type { OpenRouterModelRecord, ProviderSettingsRecord } from "@/types/storyforge";

export function SettingsTab({
  draft,
  busy,
  projectId,
  onChange,
  onSave,
}: {
  draft: SetupDraft;
  busy: boolean;
  projectId: string;
  onChange: (patch: Partial<SetupDraft>) => void;
  onSave: () => void;
}) {
  const [providerSettings, setProviderSettings] = useState<ProviderSettingsRecord | null>(null);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [savingProviders, setSavingProviders] = useState(false);
  const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModelRecord[]>([]);
  const [loadingOpenRouterModels, setLoadingOpenRouterModels] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [providerDraft, setProviderDraft] = useState({
    activeProvider: "OPENROUTER" as ProviderSettingsRecord["activeProvider"],
    useMockFallback: false,
    openaiApiKey: "",
    openaiModel: "gpt-4.1-mini",
    clearOpenAiKey: false,
    openrouterApiKey: "",
    openrouterModel: "openrouter/auto",
    openrouterBaseUrl: "https://openrouter.ai/api/v1",
    openrouterSiteUrl: "http://localhost:3000",
    openrouterAppName: APP_NAME,
    clearOpenRouterKey: false,
    customApiKey: "",
    customLabel: "Custom compatible API",
    customBaseUrl: "",
    customModel: "",
    clearCustomKey: false,
  });

  useEffect(() => {
    async function loadProviders() {
      try {
        const data = await requestJson<{ settings: ProviderSettingsRecord }>("/api/settings/providers");
        setProviderSettings(data.settings);
        setProviderDraft({
          activeProvider: data.settings.activeProvider,
          useMockFallback: data.settings.useMockFallback,
          openaiApiKey: "",
          openaiModel: data.settings.openai.model,
          clearOpenAiKey: false,
          openrouterApiKey: "",
          openrouterModel: data.settings.openrouter.model,
          openrouterBaseUrl: data.settings.openrouter.baseUrl,
          openrouterSiteUrl: data.settings.openrouter.siteUrl,
          openrouterAppName: data.settings.openrouter.appName,
          clearOpenRouterKey: false,
          customApiKey: "",
          customLabel: data.settings.custom.label,
          customBaseUrl: data.settings.custom.baseUrl,
          customModel: data.settings.custom.model,
          clearCustomKey: false,
        });
      } finally {
        setLoadingProviders(false);
      }
    }

    void loadProviders();
  }, []);

  async function loadOpenRouterModels(forceRefresh = false) {
    setLoadingOpenRouterModels(true);

    try {
      const query = new URLSearchParams();
      if (forceRefresh) {
        query.set("refresh", "1");
      }

      const data = await requestJson<{ models: OpenRouterModelRecord[] }>(
        `/api/settings/providers/openrouter-models${query.toString() ? `?${query.toString()}` : ""}`,
      );
      setOpenRouterModels(data.models);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load OpenRouter models.");
    } finally {
      setLoadingOpenRouterModels(false);
    }
  }

  useEffect(() => {
    if (openRouterModels.length === 0 && !loadingOpenRouterModels) {
      void loadOpenRouterModels(false);
    }
  }, [loadingOpenRouterModels, openRouterModels.length]);

  async function handleProviderSave() {
    setSavingProviders(true);

    try {
      const data = await requestJson<{ settings: ProviderSettingsRecord }>("/api/settings/providers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activeProvider: providerDraft.activeProvider,
          useMockFallback: providerDraft.useMockFallback,
          openai: {
            apiKey: providerDraft.openaiApiKey,
            clearKey: providerDraft.clearOpenAiKey,
            model: providerDraft.openaiModel,
          },
          openrouter: {
            apiKey: providerDraft.openrouterApiKey,
            clearKey: providerDraft.clearOpenRouterKey,
            model: providerDraft.openrouterModel,
            baseUrl: providerDraft.openrouterBaseUrl,
            siteUrl: providerDraft.openrouterSiteUrl,
            appName: providerDraft.openrouterAppName,
          },
          custom: {
            apiKey: providerDraft.customApiKey,
            clearKey: providerDraft.clearCustomKey,
            label: providerDraft.customLabel,
            baseUrl: providerDraft.customBaseUrl,
            model: providerDraft.customModel,
          },
        }),
      });

      setProviderSettings(data.settings);
      setProviderDraft((current) => ({
        ...current,
        openaiApiKey: "",
        clearOpenAiKey: false,
        openrouterApiKey: "",
        clearOpenRouterKey: false,
        customApiKey: "",
        clearCustomKey: false,
      }));
      toast.success("AI provider saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save AI provider.");
    } finally {
      setSavingProviders(false);
    }
  }

  async function handleQuickOpenRouterModelSelect(modelId: string) {
    setProviderDraft((current) => ({
      ...current,
      activeProvider: "OPENROUTER",
      openrouterModel: modelId,
    }));

    try {
      const data = await requestJson<{ settings: ProviderSettingsRecord }>("/api/settings/providers/model", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "OPENROUTER",
          model: modelId,
          activate: true,
        }),
      });
      setProviderSettings(data.settings);
      toast.success(`OpenRouter model set to ${modelId}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not switch OpenRouter model.");
    }
  }

  const filteredOpenRouterModels = openRouterModels
    .filter((model) =>
      !modelSearch.trim()
        ? true
        : [model.id, model.name, model.description].some((value) =>
            value.toLowerCase().includes(modelSearch.trim().toLowerCase()),
          ),
    )
    .slice(0, 18);

  return (
    <div className="grid gap-4">
      <Card className="grid gap-4" data-testid="settings-ai-providers" id="ai-providers">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-3xl">AI providers</h3>
            <p className="text-sm text-[var(--muted)]">
              Each install keeps its own AI key. {APP_NAME} never needs your personal key baked into the installer to run on another device.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {providerSettings ? <Chip>{providerSettings.activeProvider}</Chip> : null}
            <Button disabled={loadingProviders || savingProviders} onClick={handleProviderSave}>
              {savingProviders ? "Saving provider..." : "Save AI provider"}
            </Button>
          </div>
        </div>

        <div className="rounded-[24px] border border-[color:rgba(var(--accent-rgb),0.18)] bg-[rgba(var(--accent-rgb),0.05)] p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="grid gap-1">
              <p className="text-sm font-semibold text-[var(--text)]">
                {providerSettings?.setupMessage || "Add your own AI key on this device before using the writing tools."}
              </p>
              <p className="text-sm text-[var(--muted)]">
                OpenRouter is the easiest path because it lets you switch models later without changing the app.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {providerSettings?.requiresPersonalKey ? <Chip>Per-device key required</Chip> : null}
              <Link
                className="inline-flex items-center justify-center rounded-md border border-[color:var(--line)] bg-white px-3 py-2 text-sm font-medium text-[var(--text)] transition hover:border-[color:rgba(var(--accent-rgb),0.28)] hover:bg-[color:var(--panel-soft)]"
                href={providerSettings?.openRouterSetupUrl || "https://openrouter.ai/keys"}
                rel="noreferrer"
                target="_blank"
              >
                Get OpenRouter key
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Active provider">
            <select
              value={providerDraft.activeProvider}
              onChange={(event) =>
                setProviderDraft((current) => ({
                  ...current,
                  activeProvider: event.target.value as ProviderSettingsRecord["activeProvider"],
                }))
              }
            >
              <option value="MOCK">Mock</option>
              <option value="OPENAI">OpenAI</option>
              <option value="OPENROUTER">OpenRouter</option>
              <option value="CUSTOM">Custom compatible</option>
            </select>
          </Field>
          <Field label="Mock fallback">
            <label className="inline-flex items-center gap-3 rounded-2xl border border-[color:var(--line)] bg-white/70 px-4 py-3">
              <input
                disabled={providerSettings?.requiresPersonalKey}
                checked={providerDraft.useMockFallback}
                type="checkbox"
                onChange={(event) =>
                  setProviderDraft((current) => ({
                    ...current,
                    useMockFallback: event.target.checked,
                  }))
                }
              />
              <span className="text-sm text-[var(--muted)]">
                {providerSettings?.requiresPersonalKey
                  ? "Disabled on transferred installs so each device uses its own key"
                  : "Use mock AI when no live provider is configured"}
              </span>
            </label>
          </Field>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <div className="grid gap-3 rounded-[24px] border border-[color:var(--line)]/90 bg-white/55 p-4">
            <div className="flex items-center justify-between">
              <strong>OpenAI</strong>
              <Chip>{providerSettings?.openai.maskedKey || "Not configured"}</Chip>
            </div>
            <Field label="Model">
              <input
                type="text"
                value={providerDraft.openaiModel}
                onChange={(event) => setProviderDraft((current) => ({ ...current, openaiModel: event.target.value }))}
              />
            </Field>
            <Field label="API key">
              <input
                type="password"
                placeholder="Leave blank to keep the current key"
                value={providerDraft.openaiApiKey}
                onChange={(event) => setProviderDraft((current) => ({ ...current, openaiApiKey: event.target.value }))}
              />
            </Field>
            <label className="inline-flex items-center gap-3 text-sm text-[var(--muted)]">
              <input
                checked={providerDraft.clearOpenAiKey}
                type="checkbox"
                onChange={(event) =>
                  setProviderDraft((current) => ({
                    ...current,
                    clearOpenAiKey: event.target.checked,
                  }))
                }
              />
              Clear stored OpenAI key
            </label>
          </div>

          <div className="grid gap-3 rounded-[24px] border border-[color:var(--line)]/90 bg-white/55 p-4">
            <div className="flex items-center justify-between">
              <strong>OpenRouter</strong>
              <Chip>{providerSettings?.openrouter.maskedKey || "Not configured"}</Chip>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Chip>Live OpenRouter catalog</Chip>
              <Chip>{openRouterModels.length} models</Chip>
              <Button disabled={loadingOpenRouterModels} onClick={() => void loadOpenRouterModels(true)} variant="ghost">
                {loadingOpenRouterModels ? "Refreshing..." : "Refresh model list"}
              </Button>
            </div>
            <Field label="Model">
              <input
                list="storyforge-openrouter-model-options"
                type="text"
                value={providerDraft.openrouterModel}
                onChange={(event) => setProviderDraft((current) => ({ ...current, openrouterModel: event.target.value }))}
              />
            </Field>
            <datalist id="storyforge-openrouter-model-options">
              {openRouterModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {getOpenRouterOptionLabel(model)}
                </option>
              ))}
            </datalist>
            <Field label="Base URL">
              <input
                type="text"
                value={providerDraft.openrouterBaseUrl}
                onChange={(event) => setProviderDraft((current) => ({ ...current, openrouterBaseUrl: event.target.value }))}
              />
            </Field>
            <Field label="Site URL">
              <input
                type="text"
                value={providerDraft.openrouterSiteUrl}
                onChange={(event) => setProviderDraft((current) => ({ ...current, openrouterSiteUrl: event.target.value }))}
              />
            </Field>
            <Field label="App name">
              <input
                type="text"
                value={providerDraft.openrouterAppName}
                onChange={(event) => setProviderDraft((current) => ({ ...current, openrouterAppName: event.target.value }))}
              />
            </Field>
            <Field label="API key">
              <input
                type="password"
                placeholder="Leave blank to keep the current key"
                value={providerDraft.openrouterApiKey}
                onChange={(event) => setProviderDraft((current) => ({ ...current, openrouterApiKey: event.target.value }))}
              />
            </Field>
            <Field label="Search OpenRouter models">
              <input
                type="text"
                placeholder="Search Claude, GPT, Gemini, Llama, free models..."
                value={modelSearch}
                onChange={(event) => setModelSearch(event.target.value)}
              />
            </Field>
            <div className="grid gap-2 rounded-[20px] border border-[color:var(--line)] bg-[color:var(--panel-soft)]/75 p-3">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-sm">Pick from OpenRouter</strong>
                <span className="text-xs text-[var(--muted)]">Click once to use it</span>
              </div>
              <div className="max-h-[320px] overflow-auto">
                <div className="grid gap-2">
                  {filteredOpenRouterModels.map((model) => (
                    <button
                      key={model.id}
                      className="rounded-[18px] border border-[color:var(--line)] bg-white/70 px-3 py-3 text-left transition hover:bg-white"
                      onClick={() => void handleQuickOpenRouterModelSelect(model.id)}
                      type="button"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong className="text-sm text-[var(--text)]">{model.name}</strong>
                        <OpenRouterModelBadges model={model} selected={providerDraft.openrouterModel === model.id} />
                      </div>
                      <p className="mt-1 text-xs text-[var(--muted)]">{model.id}</p>
                      <p className="mt-2 line-clamp-3 text-xs text-[var(--muted)]">{model.description}</p>
                      {model.fictionRecommended ? (
                        <p className="mt-2 text-xs text-emerald-800/90">{APP_NAME} note: {model.fictionReason}</p>
                      ) : null}
                    </button>
                  ))}
                  {!loadingOpenRouterModels && filteredOpenRouterModels.length === 0 ? (
                    <div className="rounded-[18px] border border-dashed border-[color:var(--line)] px-3 py-4 text-sm text-[var(--muted)]">
                      No models matched that search.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <label className="inline-flex items-center gap-3 text-sm text-[var(--muted)]">
              <input
                checked={providerDraft.clearOpenRouterKey}
                type="checkbox"
                onChange={(event) =>
                  setProviderDraft((current) => ({
                    ...current,
                    clearOpenRouterKey: event.target.checked,
                  }))
                }
              />
              Clear stored OpenRouter key
            </label>
          </div>

          <div className="grid gap-3 rounded-[24px] border border-[color:var(--line)]/90 bg-white/55 p-4">
            <div className="flex items-center justify-between">
              <strong>Custom compatible API</strong>
              <Chip>{providerSettings?.custom.maskedKey || "Not configured"}</Chip>
            </div>
            <Field label="Provider label">
              <input
                type="text"
                value={providerDraft.customLabel}
                onChange={(event) => setProviderDraft((current) => ({ ...current, customLabel: event.target.value }))}
              />
            </Field>
            <Field label="Base URL">
              <input
                type="text"
                value={providerDraft.customBaseUrl}
                onChange={(event) => setProviderDraft((current) => ({ ...current, customBaseUrl: event.target.value }))}
              />
            </Field>
            <Field label="Model">
              <input
                type="text"
                value={providerDraft.customModel}
                onChange={(event) => setProviderDraft((current) => ({ ...current, customModel: event.target.value }))}
              />
            </Field>
            <Field label="API key">
              <input
                type="password"
                placeholder="Leave blank to keep the current key"
                value={providerDraft.customApiKey}
                onChange={(event) => setProviderDraft((current) => ({ ...current, customApiKey: event.target.value }))}
              />
            </Field>
            <label className="inline-flex items-center gap-3 text-sm text-[var(--muted)]">
              <input
                checked={providerDraft.clearCustomKey}
                type="checkbox"
                onChange={(event) =>
                  setProviderDraft((current) => ({
                    ...current,
                    clearCustomKey: event.target.checked,
                  }))
                }
              />
              Clear stored custom key
            </label>
          </div>
        </div>
      </Card>

      <Card className="grid gap-4" data-testid="settings-style-export" id="project-backups">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-3xl">Style & export settings</h3>
            <p className="text-sm text-[var(--muted)]">
              Tune commercial pressure, prose density, and other sliders without flattening the story&apos;s own identity.
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              These are guidance dials for future AI outlining, drafting, revision, and advice. They do not rewrite existing text by themselves.
              Most number fields run on a simple 0 to 10 scale.
            </p>
          </div>
          <Button disabled={busy} onClick={onSave}>
            {busy ? "Saving..." : "Save settings"}
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Guidance intensity">
            <select
              value={draft.guidanceIntensity}
              onChange={(event) =>
                onChange({
                  guidanceIntensity: event.target.value as SetupDraft["guidanceIntensity"],
                })
              }
            >
              <option value="LIGHT">Light</option>
              <option value="STRONG">Strong</option>
              <option value="AGGRESSIVE">Aggressive commercial pacing</option>
            </select>
          </Field>
          {[
            ["proseDensity", "Prose density"],
            ["pacing", "Pacing"],
            ["darkness", "Darkness"],
            ["romanceIntensity", "Romance intensity"],
            ["humorLevel", "Humor level"],
            ["actionFrequency", "Action frequency"],
            ["mysteryDensity", "Mystery density"],
            ["dialogueDescriptionRatio", "Dialogue / description"],
            ["literaryCommercialBalance", "Literary / commercial"],
          ].map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                inputMode="numeric"
                max={10}
                min={0}
                step={1}
                type="number"
                value={Number(draft[key as keyof SetupDraft] ?? 0)}
                onChange={(event) => onChange({ [key]: Number(event.target.value) } as Partial<SetupDraft>)}
              />
            </Field>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Aesthetic guide">
            <textarea rows={4} value={draft.aestheticGuide} onChange={(event) => onChange({ aestheticGuide: event.target.value })} />
          </Field>
          <Field label="Style guide">
            <textarea rows={4} value={draft.styleGuide} onChange={(event) => onChange({ styleGuide: event.target.value })} />
          </Field>
          <Field className="md:col-span-2" label="Voice rules">
            <textarea rows={4} value={draft.voiceRules} onChange={(event) => onChange({ voiceRules: event.target.value })} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            className="inline-flex items-center rounded-full border border-[color:var(--line)] bg-white/70 px-4 py-2 text-sm font-semibold text-[var(--text)] hover:bg-white"
            href={`/api/projects/${projectId}/export?format=pdf`}
          >
            Export PDF
          </Link>
          <Link
            className="inline-flex items-center rounded-full border border-[color:var(--line)] bg-white/70 px-4 py-2 text-sm font-semibold text-[var(--text)] hover:bg-white"
            href={`/api/projects/${projectId}/export?format=epub`}
          >
            Export EPUB
          </Link>
          <Link
            className="inline-flex items-center rounded-full border border-[color:var(--line)] bg-white/70 px-4 py-2 text-sm font-semibold text-[var(--text)] hover:bg-white"
            href={`/api/projects/${projectId}/export?format=md`}
          >
            Export Markdown
          </Link>
          <Link
            className="inline-flex items-center rounded-full border border-[color:var(--line)] bg-white/70 px-4 py-2 text-sm font-semibold text-[var(--text)] hover:bg-white"
            href={`/api/projects/${projectId}/export?format=txt`}
          >
            Export TXT
          </Link>
          <Link
            className="inline-flex items-center rounded-full border border-[color:var(--line)] bg-white/70 px-4 py-2 text-sm font-semibold text-[var(--text)] hover:bg-white"
            href={`/api/projects/${projectId}/export?format=json`}
          >
            Save Project Backup
          </Link>
        </div>
      </Card>
    </div>
  );
}
