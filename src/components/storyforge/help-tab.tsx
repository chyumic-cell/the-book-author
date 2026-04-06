"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { APP_NAME } from "@/lib/brand";

import type { StoryForgeTab } from "@/types/storyforge";

const QUICK_START_STEPS = [
  "Create or open a book from the Library.",
  "Fill in Book Setup so the AI has genre, tone, audience, POV, and direction before it writes.",
  "Use Story Bible to define people, places, factions, timelines, and relationship logic.",
  "Use Story Skeleton to set book length, chapter count, scene structure, and major arcs.",
  "Write in the Manuscript Page or use AI Engine tools to outline, draft, revise, and sync.",
  "Run Review checks often so continuity, memory, and canon stay aligned with the manuscript.",
];

const RIBBON_SECTIONS = [
  {
    title: "File",
    items: [
      ["Open Library", "Returns to the project library so you can open another book."],
      ["New Book", `Starts a new ${APP_NAME} project from scratch.`],
      ["Save", "Saves the current project state to the local database."],
      ["Save As Backup", "Exports a full JSON backup of the project."],
      ["PDF / EPUB / Markdown / TXT / Backup JSON", "Exports the current book in the selected format."],
    ],
  },
  {
    title: "Home",
    items: [
      ["Save", "Quick-save for the current book."],
      ["Backup", "Creates a backup export without leaving the workspace."],
      ["Sync Chapter", "Reads the manuscript and updates summary, memory, arcs, and continuity without rewriting the chapter."],
      ["Undo / Redo", "Steps backward or forward through recent manual manuscript edits."],
      ["Zoom -, current %, Zoom +", "Shrinks or enlarges the manuscript page for comfortable reading and drafting."],
      ["Writing / Outline / Planning / Context", "Keeps the main drafting surface clean while letting you open the side tools when needed."],
    ],
  },
  {
    title: "Edit",
    items: [
      ["Undo / Redo", "Same writing-history controls, available from the Edit ribbon as well."],
      ["Chapter View", "Returns to the main writing workspace."],
      ["Notes", "Opens Idea Lab for brainstorming, vault notes, and loose concepts."],
      ["Book Setup", "Opens the setup form for durable book-wide direction."],
      ["Story Skeleton", "Opens the structural planning view for arcs, beats, scenes, and chapter targets."],
    ],
  },
  {
    title: "Review",
    items: [
      ["Sync Chapter", "Refreshes derived story systems from the manuscript source of truth."],
      ["Summarize", "Creates or refreshes the editable chapter summary."],
      ["Extract Memory", "Pulls short-term and long-term memory candidates from the chapter."],
      ["Run Continuity", "Checks the chapter for contradictions, drift, and missing planned beats."],
      ["Continuity View", "Opens the full continuity panel."],
      ["Show Context Pane", "Opens the inspector-style pane with story state and retrieved context."],
    ],
  },
  {
    title: "AI Engine",
    items: [
      ["AI Engine / Model Settings", "Opens provider configuration so this device can use its own API key and model."],
      ["Show AI Bar", "Opens the bottom command bar for plain-language AI instructions."],
      ["Generate Outline", "Creates a chapter outline from the chapter plan and book context."],
      ["Generate Chapter", "Drafts the chapter toward its target word count."],
      ["Rewrite Pacing / Improve Prose / Sharpen Voice", "Revises a whole chapter with a focused craft goal."],
      ["Chapter Guide / Whole Book Guide", "Checks the writing against the bestseller guide and can prepare AI fixes."],
      ["Write Current Chapter / AI Do The Rest / Resume Paused Run", "Runs the resumable autopilot writer for a chapter or the whole book."],
    ],
  },
  {
    title: "View",
    items: [
      ["Writing View", "Returns to the chapter workspace."],
      ["Show or Hide Chapters", "Toggles the left chapter navigation pane."],
      ["Show or Hide Context", "Toggles the right Smart Context pane inside chapter view."],
      ["Show or Hide Outline", "Opens or closes the chapter outline panel."],
      ["Show or Hide Planning", "Opens or closes the chapter planning panel."],
      ["Show or Hide AI Bar", "Toggles the bottom command bar."],
      ["Show or Hide Inspector", "Toggles the outer context inspector for non-chapter tabs."],
      ["Character Master / Arc Master / Idea Lab", "Jumps directly to the major planning surfaces."],
    ],
  },
  {
    title: "Settings",
    items: [
      ["Open Settings", "Opens style, export, and provider settings."],
      ["AI Providers", "Jumps directly to the per-device AI key configuration."],
    ],
  },
  {
    title: "About Us",
    items: [
      ["Open About Us", `Shows the ${APP_NAME} guide and product overview.`],
      ["Open Terms Page", `Opens the formal ${APP_NAME} Terms and Publishing Policy.`],
      ["AI Key Setup", "Jumps straight to provider settings so the current device can add its own key."],
      ["Open Writing View", "Returns to drafting when you are done reading the guide."],
    ],
  },
];

const SETUP_FIELDS = [
  ["Project title", `The working name of the book inside ${APP_NAME} and in exports.`],
  ["Author name", "The credited author used on exported title pages and copyright lines."],
  ["One-line hook", "A compact pitch line that helps the AI preserve the book's central promise."],
  ["Premise", "The core dramatic situation of the novel."],
  ["Genre", "The market lane and reading expectations the book should satisfy."],
  ["Tone", "The emotional feel of the prose and story world."],
  ["Audience", "The intended readership, such as adult, YA, thriller readers, romance readers, and so on."],
  ["POV", "The primary point-of-view style the book should follow."],
  ["Tense", "The verb tense for the manuscript."],
  ["Prose style", "A short description of the desired writing texture."],
  ["Themes", "Major ideas the story should return to and deepen."],
  ["Comparable titles", "Market references that help position pacing, voice, and reader expectation."],
  ["Story brief", "The broader book summary the AI uses as durable context."],
  ["Desired plot direction", "Where the story should be heading emotionally and structurally."],
  ["Pacing notes", "Specific notes about speed, momentum, scene weight, or restraint."],
];

const WRITING_AREAS = [
  ["Manuscript Page", "The primary drafting area. This is the source of truth for sync, memory, and continuity."],
  ["Chapter outline", "A compact roadmap for the chapter. Useful for planning before drafting or revising after a draft exists."],
  ["Chapter planning", "Purpose, current beat, required inclusions, forbidden elements, mood, and scene list."],
  ["Smart Context pane", "Shows chapter-relevant characters, arcs, summary, continuity, and unresolved threads."],
  ["Bottom AI bar", "Takes plain-language instructions and can edit project material directly when change permission is enabled."],
];

const AI_COMMANDS = [
  ["Expand", "Rewrites the selected text into a longer, richer version without simply tacking on a sentence."],
  ["Tighten", "Condenses the selected text while preserving meaning, continuity, and voice."],
  ["Improve Prose", "Refines rhythm, image clarity, specificity, and line-level readability."],
  ["Sharpen Voice", "Pushes the selection toward a more character-specific speech or narrative voice."],
  ["Add Tension", "Raises uncertainty, pressure, or threat in the selected moment."],
  ["Add Dialogue", "Introduces spoken exchange using dossier data, scene context, and relationship pressure."],
  ["Description to Dialogue", "Converts descriptive or explanatory prose into spoken exchange where appropriate."],
  ["Continue", "Writes forward from the cursor without repeating the existing paragraph."],
  ["Next Beats", "Suggests what should happen next without drafting a full scene."],
  ["Coach", "Explains strengths, weaknesses, and options in plain language."],
  ["Custom AI instruction", "Lets you tell the AI exactly what to do to the selected text."],
];

const SETTINGS_GUIDE = [
  ["Guidance intensity", `How strongly ${APP_NAME} pushes its built-in craft framework when the AI writes or revises.`],
  ["Prose density", "Lean and simple versus rich and descriptive prose."],
  ["Pacing", "Slower and more reflective versus faster and more momentum-heavy scenes."],
  ["Darkness", "How harsh, grim, or emotionally heavy the material should feel."],
  ["Romance intensity", "How strongly romance should matter in the story and on the page."],
  ["Humor level", "How often wit, levity, or comic release appears."],
  ["Action frequency", "How often conflict and kinetic action should surface."],
  ["Mystery density", "How many clues, withheld answers, and open questions stay active."],
  ["Dialogue / description", "Whether scenes lean more spoken and interactive or more narrated and descriptive."],
  ["Literary / commercial", "How interior and literary versus immediate and page-turning the book should feel."],
  ["Aesthetic guide", "Short sensory or atmosphere guidance for the AI."],
  ["Style guide", "Broader house rules for sentence behavior and narrative presentation."],
  ["Voice rules", "Precise standing instructions the AI should keep obeying as it writes."],
];

const TROUBLESHOOTING = [
  `If AI tools are unavailable on a device, open Settings > AI providers and add that device's own key. ${APP_NAME} is designed so every install uses its own personal key.`,
  "If a long AI writing run pauses on a free model, use Resume Paused Run in AI Engine after the limit resets.",
  "If exports look outdated, save the book first, then export again from File.",
  "If continuity looks wrong, run Sync Chapter before Run Continuity so the derived systems catch up with the manuscript.",
  "If the manuscript area feels crowded, use View to hide Chapters, Context, Outline, Planning, or the AI bar until you need them.",
];

export function HelpTab({
  onOpenProviders,
  onOpenTab,
}: {
  onOpenProviders: () => void;
  onOpenTab: (tab: StoryForgeTab) => void;
}) {
  return (
    <div className="grid gap-4">
      <Card className="grid gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Chip>About Us</Chip>
              <Chip>Professional Reference</Chip>
            </div>
            <div>
              <h3 className="text-3xl font-semibold">About Us</h3>
              <p className="mt-2 max-w-4xl text-sm text-[var(--muted)]">
                {APP_NAME} is a writing-first system. The manuscript stays central, while the AI, planning tools, memory,
                continuity, and exports support the work around it. This About Us guide explains what each major section is for,
                what each setup question wants from you, and how the main buttons behave.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => onOpenTab("chapters")}>Open Writing View</Button>
            <Button onClick={() => onOpenTab("about")} variant="secondary">
              About {APP_NAME}
            </Button>
            <Link
              className="inline-flex items-center justify-center rounded-md border border-[color:var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text)] transition hover:border-[color:rgba(var(--accent-rgb),0.35)] hover:bg-[color:var(--panel-soft)]"
              href="/terms"
            >
              Open Terms Page
            </Link>
            <Button onClick={() => onOpenTab("setup")} variant="secondary">
              Open Book Setup
            </Button>
            <Button onClick={onOpenProviders} variant="secondary">
              AI Key Setup
            </Button>
          </div>
        </div>

        <div className="grid gap-2">
          <strong className="text-lg text-[var(--text)]">Quick start</strong>
          <ol className="grid gap-2 pl-5 text-sm text-[var(--muted)]">
            {QUICK_START_STEPS.map((step) => (
              <li key={step} className="list-decimal">
                {step}
              </li>
            ))}
          </ol>
        </div>
      </Card>

      <Card className="grid gap-4">
        <div>
          <h4 className="text-2xl font-semibold">Using {APP_NAME} professionally</h4>
          <p className="text-sm text-[var(--muted)]">
            {APP_NAME} is designed as a professional writing environment rather than a casual chatbot. Use it to shape
            a book deliberately: set the premise, build the skeleton, keep canon aligned, and apply AI where it genuinely helps.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {[
            ["Writing-first workflow", "Start from the manuscript whenever possible, then sync the surrounding planning systems from the page instead of the other way around."],
            ["Professional planning", "Use Book Setup, Story Bible, and Story Skeleton before heavy drafting so the AI has a stronger canon and structure anchor."],
            ["Device ownership", "Treat each computer or phone as its own secure writing environment with its own AI key and install profile."],
            ["Formal terms", `${APP_NAME}'s binding publishing, moderation, and eligibility rules live on the dedicated Terms page rather than on the About Us guide itself.`],
          ].map(([label, description]) => (
            <div key={label} className="rounded-[24px] border border-[color:var(--line)] bg-[color:var(--panel-soft)]/72 p-4">
              <strong className="text-sm text-[var(--text)]">{label}</strong>
              <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="grid gap-4">
        <div>
          <h4 className="text-2xl font-semibold">Workspace map</h4>
          <p className="text-sm text-[var(--muted)]">
            These are the main areas of the app and what they are meant to do.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {[
            ["Writing View", "Draft chapters, run inline AI tools, review guide checks, and sync the chapter back to the story systems."],
            ["Book Setup", "Set the durable book-wide instructions that guide future AI work and exports."],
            ["Story Bible", "Manage characters, relationships, locations, factions, plot threads, and timeline anchors."],
            ["Story Skeleton", "Control book length, chapter targets, arcs, structure beats, and scene-level planning."],
            ["Idea Lab", "Store brainstorms, what-if ideas, loose notes, and experimental paths without polluting canon."],
            ["Memory", "Review short-term and long-term extracted memory used to keep the AI aligned with the book."],
            ["Continuity", "Inspect detected contradictions, drift, or planned beats that are missing on the page."],
            ["Settings", "Configure style sliders, export behavior, and the AI provider for the current device."],
          ].map(([title, description]) => (
            <div key={title} className="rounded-[24px] border border-[color:var(--line)] bg-[color:var(--panel-soft)]/72 p-4">
              <strong className="text-base text-[var(--text)]">{title}</strong>
              <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="grid gap-4">
        <div>
          <h4 className="text-2xl font-semibold">Ribbon reference</h4>
          <p className="text-sm text-[var(--muted)]">
            The top ribbon is your command center. These are the persistent controls and what they do.
          </p>
        </div>
        <div className="grid gap-4">
          {RIBBON_SECTIONS.map((section) => (
            <div key={section.title} className="rounded-[24px] border border-[color:var(--line)] bg-white/80 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Chip>{section.title}</Chip>
              </div>
              <div className="grid gap-3">
                {section.items.map(([label, description]) => (
                  <div key={label} className="grid gap-1">
                    <strong className="text-sm text-[var(--text)]">{label}</strong>
                    <p className="text-sm text-[var(--muted)]">{description}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="grid gap-4">
        <div>
          <h4 className="text-2xl font-semibold">Book Setup field guide</h4>
          <p className="text-sm text-[var(--muted)]">
            This page gives {APP_NAME} its durable north star. Each field below tells the AI what you mean the book to be.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {SETUP_FIELDS.map(([label, description]) => (
            <div key={label} className="rounded-[24px] border border-[color:var(--line)] bg-[color:var(--panel-soft)]/72 p-4">
              <strong className="text-sm text-[var(--text)]">{label}</strong>
              <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="grid gap-4">
        <div>
          <h4 className="text-2xl font-semibold">Writing view and AI commands</h4>
          <p className="text-sm text-[var(--muted)]">
            Use the manuscript as the source of truth. The surrounding tools help you plan, revise, and apply focused AI assistance.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {WRITING_AREAS.map(([label, description]) => (
            <div key={label} className="rounded-[24px] border border-[color:var(--line)] bg-white/82 p-4">
              <strong className="text-sm text-[var(--text)]">{label}</strong>
              <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {AI_COMMANDS.map(([label, description]) => (
            <div key={label} className="rounded-[24px] border border-[color:var(--line)] bg-[color:var(--panel-soft)]/72 p-4">
              <strong className="text-sm text-[var(--text)]">{label}</strong>
              <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="grid gap-4">
        <div>
          <h4 className="text-2xl font-semibold">Planning, bible, memory, and sync</h4>
          <p className="text-sm text-[var(--muted)]">
            These systems support the manuscript rather than replacing it. The manuscript stays authoritative; the rest derive from it.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-[24px] border border-[color:var(--line)] bg-white/82 p-4">
            <strong className="text-sm text-[var(--text)]">Story Bible</strong>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Use Character Master for dossiers, Relationship Map for social logic, and the other bible records for factions, locations,
              plot threads, and timeline anchors.
            </p>
          </div>
          <div className="rounded-[24px] border border-[color:var(--line)] bg-white/82 p-4">
            <strong className="text-sm text-[var(--text)]">Story Skeleton</strong>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Set total book words, chapter count, and target chapter length; then use the arc tracker, structure engine, and scene engine
              to shape movement before or during drafting.
            </p>
          </div>
          <div className="rounded-[24px] border border-[color:var(--line)] bg-white/82 p-4">
            <strong className="text-sm text-[var(--text)]">Memory</strong>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Short-term memory tracks immediate story state; long-term memory tracks durable canon. Use Extract Memory and Sync Chapter
              to keep both current.
            </p>
          </div>
          <div className="rounded-[24px] border border-[color:var(--line)] bg-white/82 p-4">
            <strong className="text-sm text-[var(--text)]">Continuity</strong>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Continuity compares the manuscript to summaries, bible records, arcs, and recent memory so drifting facts can be corrected
              before they spread.
            </p>
          </div>
        </div>
      </Card>

      <Card className="grid gap-4">
        <div>
          <h4 className="text-2xl font-semibold">Settings and exports</h4>
          <p className="text-sm text-[var(--muted)]">
            The style sliders affect future AI drafting and revision. Reader-facing exports use your author name, copyright notice, and spoiler-safe marketing blurb.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {SETTINGS_GUIDE.map(([label, description]) => (
            <div key={label} className="rounded-[24px] border border-[color:var(--line)] bg-[color:var(--panel-soft)]/72 p-4">
              <strong className="text-sm text-[var(--text)]">{label}</strong>
              <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
            </div>
          ))}
        </div>
        <div className="rounded-[24px] border border-[color:rgba(var(--accent-rgb),0.18)] bg-[rgba(var(--accent-rgb),0.04)] p-4 text-sm text-[var(--muted)]">
          <strong className="text-[var(--text)]">Export formats:</strong> PDF is fixed-layout for print-style reading. EPUB is reflowable,
          so font size, wrapping, and layout can change inside an ebook reader. Markdown and TXT are lightweight manuscript exports. Backup JSON is the full project archive.
        </div>
      </Card>

      <Card className="grid gap-4">
        <div>
          <h4 className="text-2xl font-semibold">Mobile mode and installation</h4>
          <p className="text-sm text-[var(--muted)]">
            On phones, {APP_NAME} is meant to be AI-driven for drafting and human-driven for planning. The same install does not carry your key to another device.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-[24px] border border-[color:var(--line)] bg-white/82 p-4">
            <strong className="text-sm text-[var(--text)]">Phone workflow</strong>
            <p className="mt-1 text-sm text-[var(--muted)]">
              The AI Writing Studio is shown first on phones. Use it to write the current chapter or let AI do the rest, while setup, bible,
              outline, and skeleton work stay available as lighter manual controls.
            </p>
          </div>
          <div className="rounded-[24px] border border-[color:var(--line)] bg-white/82 p-4">
            <strong className="text-sm text-[var(--text)]">Per-device AI keys</strong>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Every computer or phone should add its own API key in Settings &gt; AI providers. No installer or exported package should contain a shared personal key.
            </p>
            <div className="mt-3">
              <Link
                className="text-sm font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                href="https://openrouter.ai/keys"
                rel="noreferrer"
                target="_blank"
              >
                OpenRouter key page
              </Link>
            </div>
          </div>
        </div>
      </Card>

      <Card className="grid gap-3">
        <div>
          <h4 className="text-2xl font-semibold">Troubleshooting</h4>
          <p className="text-sm text-[var(--muted)]">Use these checks first when something feels blocked or out of sync.</p>
        </div>
        <ul className="grid gap-2 text-sm text-[var(--muted)]">
          {TROUBLESHOOTING.map((item) => (
            <li key={item} className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--panel-soft)]/72 px-4 py-3">
              {item}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
