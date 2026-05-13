"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";

import type { SetupDraft } from "@/components/storyforge/workspace-helpers";

const STYLE_FIELD_HINTS: Record<
  | "guidanceIntensity"
  | "proseDensity"
  | "pacing"
  | "darkness"
  | "romanceIntensity"
  | "humorLevel"
  | "actionFrequency"
  | "mysteryDensity"
  | "dialogueDescriptionRatio"
  | "literaryCommercialBalance"
  | "aestheticGuide"
  | "styleGuide"
  | "voiceRules",
  { low?: string; high?: string; effect: string }
> = {
  guidanceIntensity: {
    low: "Lower settings make the AI follow your existing material more lightly and intervene less aggressively.",
    high: "Higher settings make the AI push harder toward the requested style and structure, even when revising weak material.",
    effect: "This controls how forcefully the AI applies your craft and commercial-writing instructions.",
  },
  proseDensity: {
    low: "Lower numbers produce leaner, cleaner prose with fewer descriptive layers and less lyrical phrasing.",
    high: "Higher numbers produce richer, more textured prose with more imagery, interiority, and sentence layering.",
    effect: "This changes how sparse or lush the writing feels on the page.",
  },
  pacing: {
    low: "Lower numbers slow scenes down, linger longer, and allow more breathing room between beats.",
    high: "Higher numbers speed scenes up, tighten transitions, and push events to move more quickly.",
    effect: "This controls how fast the story feels as the AI outlines, drafts, and revises.",
  },
  darkness: {
    low: "Lower numbers keep the tone lighter, safer, and less emotionally punishing.",
    high: "Higher numbers allow heavier dread, cruelty, pain, moral damage, and darker consequences.",
    effect: "This sets how grim or emotionally harsh the story is allowed to become.",
  },
  romanceIntensity: {
    low: "Lower numbers keep romance faint, secondary, or mostly implied.",
    high: "Higher numbers make attraction, longing, chemistry, and romantic stakes more central.",
    effect: "This controls how strongly romantic material shows up in the story.",
  },
  humorLevel: {
    low: "Lower numbers keep the tone serious and use very little wit or comic relief.",
    high: "Higher numbers give the AI permission to add more banter, irony, playfulness, and relief.",
    effect: "This changes how often the writing uses humor to color scenes and character voice.",
  },
  actionFrequency: {
    low: "Lower numbers keep action rare and give more space to setup, psychology, and aftermath.",
    high: "Higher numbers make conflict, movement, danger, and physical events happen more often.",
    effect: "This controls how action-heavy the book feels overall.",
  },
  mysteryDensity: {
    low: "Lower numbers keep fewer questions hanging over scenes and reveal things more directly.",
    high: "Higher numbers layer in more uncertainty, hidden motives, withheld facts, and unresolved questions.",
    effect: "This sets how much suspense, curiosity, and revelation-pressure the AI should build.",
  },
  dialogueDescriptionRatio: {
    low: "Lower numbers tilt the book more toward description, narration, and interior writing than spoken lines.",
    high: "Higher numbers tilt the book more toward spoken interaction, back-and-forth exchanges, and voiced conflict.",
    effect: "This changes the balance between characters talking and the prose describing or narrating.",
  },
  literaryCommercialBalance: {
    low: "Lower numbers lean more literary: more atmosphere, ambiguity, style, and patience.",
    high: "Higher numbers lean more commercial: stronger hooks, cleaner momentum, bigger beats, and easier readability.",
    effect: "This tells the AI where to sit between artistic/literary writing and page-turning commercial writing.",
  },
  aestheticGuide: {
    effect: "Use this to describe the visual, emotional, and atmospheric feel you want the writing to create.",
  },
  styleGuide: {
    effect: "Use this to give specific craft instructions about prose habits, structure, tone, and what the AI should or should not do.",
  },
  voiceRules: {
    effect: "Use this to define how the narrative voice and character voices should sound, behave, and stay distinct.",
  },
};

function buildHint(key: keyof typeof STYLE_FIELD_HINTS) {
  const hint = STYLE_FIELD_HINTS[key];
  if (!hint.low && !hint.high) {
    return hint.effect;
  }

  return [hint.low, hint.high, hint.effect].filter(Boolean).join(" ");
}

export function StyleExportSettingsCard({
  busy,
  draft,
  onChange,
  onSave,
  projectId,
}: {
  busy: boolean;
  draft: SetupDraft;
  onChange: (patch: Partial<SetupDraft>) => void;
  onSave: () => void;
  projectId: string;
}) {
  return (
    <Card className="grid gap-4" data-testid="settings-style-export" id="project-backups">
      <div className="flex items-center justify-between gap-4">
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
          <span className="text-xs text-[var(--muted)]">{buildHint("guidanceIntensity")}</span>
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
          <Field key={key} hint={buildHint(key as keyof typeof STYLE_FIELD_HINTS)} label={label}>
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
        <Field hint={buildHint("aestheticGuide")} label="Aesthetic guide">
          <textarea rows={4} value={draft.aestheticGuide} onChange={(event) => onChange({ aestheticGuide: event.target.value })} />
        </Field>
        <Field hint={buildHint("styleGuide")} label="Style guide">
          <textarea rows={4} value={draft.styleGuide} onChange={(event) => onChange({ styleGuide: event.target.value })} />
        </Field>
        <Field className="md:col-span-2" hint={buildHint("voiceRules")} label="Voice rules">
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
  );
}
