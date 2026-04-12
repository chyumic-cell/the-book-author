"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { APP_NAME } from "@/lib/brand";

import type { StoryForgeTab } from "@/types/storyforge";

type GuidePair = [string, string];

const QUICK_START_STEPS = [
  "Create or open a book from the Library.",
  "Fill in Book Setup so the AI has genre, tone, audience, POV, and direction before it writes.",
  "Use Story Bible to define people, places, factions, timelines, and relationship logic.",
  "Use Story Skeleton to set book length, chapter count, scene structure, and major arcs.",
  "Write in the Manuscript Page or use AI Engine tools to outline, draft, revise, and sync.",
  "Run Review checks often so continuity, memory, and canon stay aligned with the manuscript.",
];

const PROFESSIONAL_PRACTICES: GuidePair[] = [
  ["Writing-first workflow", "Start from the manuscript whenever possible, then sync the surrounding planning systems from the page instead of the other way around."],
  ["Professional planning", "Use Book Setup, Story Bible, and Story Skeleton before heavy drafting so the AI has a stronger canon and structure anchor."],
  ["Device ownership", "Treat each computer or phone as its own secure writing environment with its own AI key and install profile."],
  ["Formal terms", `${APP_NAME}'s binding publishing, moderation, and eligibility rules live on the dedicated Terms page rather than on the About Us guide itself.`],
];

const WORKSPACE_MAP: GuidePair[] = [
  ["Writing View", "Draft chapters, run inline AI tools, review guide checks, and sync the chapter back to the story systems."],
  ["Book Setup", "Set the durable book-wide instructions that guide future AI work and exports."],
  ["Story Bible", "Manage characters, relationships, locations, factions, plot threads, and timeline anchors."],
  ["Story Skeleton", "Control book length, chapter targets, arcs, structure beats, and scene-level planning."],
  ["Idea Lab", "Store brainstorms, what-if ideas, loose notes, and experimental paths without polluting canon."],
  ["Memory", "Review short-term and long-term extracted memory used to keep the AI aligned with the book."],
  ["Continuity", "Inspect detected contradictions, drift, or planned beats that are missing on the page."],
  ["Settings", "Configure style sliders, export behavior, and the AI provider for the current device."],
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

const PLANNING_SYSTEMS: GuidePair[] = [
  ["Story Bible", "Use Character Master for dossiers, Relationship Map for social logic, and the other bible records for factions, locations, plot threads, and timeline anchors."],
  ["Story Skeleton", "Set total book words, chapter count, and target chapter length; then use the arc tracker, structure engine, and scene engine to shape movement before or during drafting."],
  ["Memory", "Short-term memory tracks immediate story state; long-term memory tracks durable canon. Use Extract Memory and Sync Chapter to keep both current."],
  ["Continuity", "Continuity compares the manuscript to summaries, bible records, arcs, and recent memory so drifting facts can be corrected before they spread."],
];

const MOBILE_MODE_GUIDE: GuidePair[] = [
  ["Phone workflow", "The AI Writing Studio is shown first on phones. Use it to write the current chapter or let AI do the rest, while setup, bible, outline, and skeleton work stay available as lighter manual controls."],
  ["Per-device AI keys", "Every computer or phone should add its own API key in Settings > AI providers. No installer or exported package should contain a shared personal key."],
];

const PROFESSIONAL_EXAMPLES: Record<string, string> = {
  "Writing-first workflow": "Example: draft a confrontation in the manuscript first, then run Sync Chapter so memory and continuity catch up to what is actually on the page.",
  "Professional planning": "Example: before you generate Chapter 1, fill in genre, tone, POV, a story brief, and the first book arc so the AI does not guess blindly.",
  "Device ownership": "Example: use one OpenRouter key on your laptop and a different one on your phone instead of sharing the same personal key everywhere.",
  "Formal terms": "Example: if you need to review ownership, moderation, or publishing rules, open the Terms page instead of looking for that language inside the guide.",
};

const WORKSPACE_EXAMPLES: Record<string, string> = {
  "Writing View": "Example: open Writing View when you want to revise Chapter 4, highlight one paragraph, and run Tighten or Sharpen Voice on it.",
  "Book Setup": "Example: open Book Setup before drafting and enter a hook, premise, tone, and pacing notes like “tight thriller pacing with short chapters.”",
  "Story Bible": "Example: add a detective, a suspect family, and the town itself to the Story Bible so later chapters keep those facts straight.",
  "Story Skeleton": "Example: set the book to 90,000 words and 23 chapters so the app can suggest per-chapter targets and structure.",
  "Idea Lab": "Example: park a wild twist in Idea Lab when you are not sure you want it in canon yet.",
  "Memory": "Example: after finishing a reveal chapter, open Memory to confirm the new clue and character injury were actually extracted.",
  "Continuity": "Example: run Continuity after a major rewrite to catch name changes, missing beats, or contradictions with prior chapters.",
  "Settings": "Example: raise Prose density and lower Humor before a grim, atmospheric revision pass.",
};

const RIBBON_EXAMPLES: Record<string, string> = {
  "Open Library": "Example: after finishing one chapter, click Open Library to switch back to your series list and open the next book.",
  "New Book": `Example: click New Book when you want to start a fresh project instead of reusing your current ${APP_NAME} file.`,
  "Save": "Example: after changing the ending of a chapter, click Save so the current text and project state are stored immediately.",
  "Save As Backup": "Example: export a backup before a big AI rewrite pass so you have a full restore point.",
  "PDF / EPUB / Markdown / TXT / Backup JSON": "Example: export EPUB for phone reading, PDF for print-style review, and Backup JSON before moving devices.",
  "Backup": "Example: use Backup right before experimenting with a risky structural rewrite.",
  "Sync Chapter": "Example: after manually editing a reveal scene, run Sync Chapter so memory, arcs, and continuity reflect the new version.",
  "Undo / Redo": "Example: if you delete a paragraph by mistake, tap Undo; if you change your mind, tap Redo to bring it back.",
  "Zoom -, current %, Zoom +": "Example: raise zoom to 130% when reading on a small screen or lower it when checking chapter flow at a glance.",
  "Writing / Outline / Planning / Context": "Example: keep only Writing open while drafting, then reopen Outline when you want to compare the draft to the plan.",
  "Chapter View": "Example: use Chapter View to jump back from Setup or Memory into the active manuscript.",
  "Notes": "Example: open Notes to store a possible sequel hook without letting it overwrite current canon.",
  "Book Setup": "Example: tap Book Setup when the AI tone feels wrong and you need to update the book-wide instructions.",
  "Story Skeleton": "Example: open Story Skeleton to change the chapter count from 18 to 20 and rebalance the targets.",
  "Summarize": "Example: use Summarize after a heavy rewrite so the editable chapter summary matches the new scene logic.",
  "Extract Memory": "Example: after adding a wound, a promise, and a new location, run Extract Memory to make those details retrievable later.",
  "Run Continuity": "Example: use Run Continuity before exporting to catch dropped clues or changed motivations.",
  "Continuity View": "Example: open the full continuity panel when the chapter warning count rises and you need the detailed issue list.",
  "Show Context Pane": "Example: toggle the context pane on when you want to see related characters and unresolved threads beside the draft.",
  "AI Engine / Model Settings": "Example: open Model Settings on a new device and add your own OpenRouter key before using AI tools.",
  "Show AI Bar": "Example: open the AI bar when you want to type a plain-language instruction like “make Chapter 6 darker and more suspicious.”",
  "Generate Outline": "Example: click Generate Outline after setting the chapter purpose and required inclusions but before drafting prose.",
  "Generate Chapter": "Example: use Generate Chapter when the outline is ready and you want a full draft aimed at the chapter target length.",
  "Rewrite Pacing / Improve Prose / Sharpen Voice": "Example: run Improve Prose on a finished chapter, then Sharpen Voice if the characters still sound too similar.",
  "Chapter Guide / Whole Book Guide": "Example: run Chapter Guide on a sluggish scene to get a checklist of what is missing and an optional AI fix.",
  "Write Current Chapter / AI Do The Rest / Resume Paused Run": "Example: tap Resume Paused Run after a free model limit resets so the long draft continues instead of starting over.",
  "Writing View": "Example: click Writing View to return to the manuscript after spending time in Story Bible or Settings.",
  "Show or Hide Chapters": "Example: hide the chapter list when you want more room to focus on the manuscript.",
  "Show or Hide Context": "Example: show Context when you want a quick read on related characters, threads, and continuity notes.",
  "Show or Hide Outline": "Example: hide Outline while freewriting, then reopen it to compare what you drafted against the planned beats.",
  "Show or Hide Planning": "Example: open Planning when you need to check required inclusions before revising a scene.",
  "Show or Hide AI Bar": "Example: hide the AI bar when you want a cleaner screen for manual drafting only.",
  "Show or Hide Inspector": "Example: open the Inspector on non-chapter tabs when you want extra project state beside the main panel.",
  "Character Master / Arc Master / Idea Lab": "Example: jump straight to Character Master when you realize a new supporting character needs a dossier before the next chapter.",
  "Open Settings": "Example: use Open Settings when you want to change export defaults or tweak the writing sliders.",
  "AI Providers": "Example: open AI Providers on a new computer, paste your own key, and pick a model before drafting.",
  "Open About Us": `Example: open About Us when a new user needs a walkthrough of how ${APP_NAME} is meant to be used.`,
  "Open Terms Page": "Example: open the Terms page when someone needs to review the binding legal and publishing policy.",
  "AI Key Setup": "Example: use AI Key Setup when the app says AI is unavailable on the current device.",
  "Open Writing View": "Example: tap Open Writing View after reading the guide so you can go straight back into the manuscript.",
};

const SETUP_EXAMPLES: Record<string, string> = {
  "Project title": "Example: The Glass Magistrate",
  "Author name": "Example: Michael William Polevoy",
  "One-line hook": "Example: A disgraced archivist must solve a ritual murder before the city elects a tyrant.",
  "Premise": "Example: In a storm-bound port city, a forensic clerk uncovers a chain of staged killings tied to the governor’s succession fight.",
  "Genre": "Example: Adult fantasy mystery",
  "Tone": "Example: Dark, elegant, suspicious, and emotionally restrained",
  "Audience": "Example: Adult readers who like political mysteries and morally gray fantasy",
  "POV": "Example: Rotating close third-person",
  "Tense": "Example: Past tense",
  "Prose style": "Example: Clean literary prose with vivid but controlled imagery",
  "Themes": "Example: Memory as evidence; power hides inside procedure",
  "Comparable titles": "Example: The Name of the Rose meets a modern forensic thriller",
  "Story brief": "Example: The novel follows one murder as it opens a much larger conspiracy involving sacred law, class pressure, and falsified history.",
  "Desired plot direction": "Example: Move from procedural investigation into a citywide political reckoning.",
  "Pacing notes": "Example: Short scenes, frequent reveals, and no long stretches without a new question or consequence.",
};

const WRITING_AREA_EXAMPLES: Record<string, string> = {
  "Manuscript Page": "Example: draft the full confrontation scene here, then treat this version as the source of truth for everything else.",
  "Chapter outline": "Example: list six beats for the chapter before asking AI to draft prose from them.",
  "Chapter planning": "Example: set Required inclusions to “the revolver, the sister’s lie, the cut phone line” before revising.",
  "Smart Context pane": "Example: open Smart Context while drafting to see which characters and unresolved threads the chapter is most likely to affect.",
  "Bottom AI bar": "Example: type “Make this chapter more paranoid and add one clue pointing at the brother” and let the AI suggest a direct edit.",
};

const AI_COMMAND_EXAMPLES: Record<string, string> = {
  Expand: "Example: select two flat lines describing a fight and use Expand to turn them into a fuller, more cinematic beat.",
  Tighten: "Example: highlight an overlong paragraph of explanation and use Tighten to keep the meaning while cutting drag.",
  "Improve Prose": "Example: use Improve Prose on a rough page when the information is right but the writing still feels plain.",
  "Sharpen Voice": "Example: select a dialogue exchange and use Sharpen Voice if both characters sound too similar.",
  "Add Tension": "Example: apply Add Tension to a calm interview scene so the reader feels danger under the conversation.",
  "Add Dialogue": "Example: use Add Dialogue on a descriptive scene summary when two characters should really be confronting each other out loud.",
  "Description to Dialogue": "Example: highlight a block of narrated explanation and convert it into spoken exchange between the suspect and detective.",
  Continue: "Example: place the cursor at the end of a chapter and use Continue when you know the scene should keep moving but you have not written the next beat yet.",
  "Next Beats": "Example: use Next Beats when you want three or four possible scene directions without drafting the prose yet.",
  Coach: "Example: ask Coach on a chapter opening when you want plain-language advice about why it feels slow or unclear.",
  "Custom AI instruction": "Example: tell the AI, “Make this colder, remove melodrama, and keep every fact unchanged.”",
};

const PLANNING_EXAMPLES: Record<string, string> = {
  "Story Bible": "Example: add a recurring detective’s dossier, his rival, the harbor district, and the murder cult as durable canon anchors.",
  "Story Skeleton": "Example: set a 15-chapter structure and assign each chapter a target word count before drafting the middle act.",
  "Memory": "Example: after Chapter 8, confirm that the stolen ledger, broken wrist, and false alibi all entered memory.",
  "Continuity": "Example: run continuity after changing a suspect’s name so later references do not drift.",
};

const SETTINGS_EXAMPLES: Record<string, string> = {
  "Guidance intensity": "Example: set this to Strong when you want the AI to push structure and scene discipline harder.",
  "Prose density": "Example: lower it for clipped thriller prose or raise it for richer sensory fantasy writing.",
  Pacing: "Example: raise Pacing before a chase-heavy act where scenes should move fast and end on hooks.",
  Darkness: "Example: increase Darkness before revising a prison chapter so the emotional pressure feels harsher.",
  "Romance intensity": "Example: raise this if the relationship subplot should shape scene choices and emotional stakes.",
  "Humor level": "Example: keep Humor low in a grim war novel, or raise it for a lighter caper with banter.",
  "Action frequency": "Example: turn this up if the book should regularly return to fights, pursuit, or physical danger.",
  "Mystery density": "Example: raise Mystery density if every chapter should end with a new clue or unanswered question.",
  "Dialogue / description": "Example: push this higher if you want scenes to run more through spoken exchange than narration.",
  "Literary / commercial": "Example: move this toward commercial when you want cleaner momentum and a stronger page-turning feel.",
  "Aesthetic guide": "Example: Rain on bronze rooftops, incense smoke in stone corridors, and courtroom velvet worn thin at the elbows.",
  "Style guide": "Example: Keep sentences clean, avoid purple prose, prefer concrete detail over abstraction.",
  "Voice rules": "Example: Nobles speak formally, soldiers speak bluntly, and no character uses modern slang unless the setting supports it.",
};

const MOBILE_EXAMPLES: Record<string, string> = {
  "Phone workflow": "Example: use the AI Writing Studio on the bus to draft a scene, then do the fine manuscript revision later on desktop.",
  "Per-device AI keys": "Example: your phone can use one OpenRouter key while your laptop uses another; neither device should inherit a bundled key.",
};

function ExampleLine({ example }: { example: string }) {
  return (
    <p className="mt-2 text-sm leading-7 text-[var(--text)]">
      <strong>Example:</strong> {example}
    </p>
  );
}

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
          {PROFESSIONAL_PRACTICES.map(([label, description]) => (
            <div key={label} className="rounded-[24px] border border-[color:var(--line)] bg-[color:var(--panel-soft)]/72 p-4">
              <strong className="text-sm text-[var(--text)]">{label}</strong>
              <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
              {PROFESSIONAL_EXAMPLES[label] ? <ExampleLine example={PROFESSIONAL_EXAMPLES[label]} /> : null}
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
          {WORKSPACE_MAP.map(([title, description]) => (
            <div key={title} className="rounded-[24px] border border-[color:var(--line)] bg-[color:var(--panel-soft)]/72 p-4">
              <strong className="text-base text-[var(--text)]">{title}</strong>
              <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
              {WORKSPACE_EXAMPLES[title] ? <ExampleLine example={WORKSPACE_EXAMPLES[title]} /> : null}
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
                    {RIBBON_EXAMPLES[label] ? <ExampleLine example={RIBBON_EXAMPLES[label]} /> : null}
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
              {SETUP_EXAMPLES[label] ? <ExampleLine example={SETUP_EXAMPLES[label]} /> : null}
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
              {WRITING_AREA_EXAMPLES[label] ? <ExampleLine example={WRITING_AREA_EXAMPLES[label]} /> : null}
            </div>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {AI_COMMANDS.map(([label, description]) => (
            <div key={label} className="rounded-[24px] border border-[color:var(--line)] bg-[color:var(--panel-soft)]/72 p-4">
              <strong className="text-sm text-[var(--text)]">{label}</strong>
              <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
              {AI_COMMAND_EXAMPLES[label] ? <ExampleLine example={AI_COMMAND_EXAMPLES[label]} /> : null}
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
          {PLANNING_SYSTEMS.map(([label, description]) => (
            <div key={label} className="rounded-[24px] border border-[color:var(--line)] bg-white/82 p-4">
              <strong className="text-sm text-[var(--text)]">{label}</strong>
              <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
              {PLANNING_EXAMPLES[label] ? <ExampleLine example={PLANNING_EXAMPLES[label]} /> : null}
            </div>
          ))}
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
              {SETTINGS_EXAMPLES[label] ? <ExampleLine example={SETTINGS_EXAMPLES[label]} /> : null}
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
          {MOBILE_MODE_GUIDE.map(([label, description]) => (
            <div key={label} className="rounded-[24px] border border-[color:var(--line)] bg-white/82 p-4">
              <strong className="text-sm text-[var(--text)]">{label}</strong>
              <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
              {MOBILE_EXAMPLES[label] ? <ExampleLine example={MOBILE_EXAMPLES[label]} /> : null}
              {label === "Per-device AI keys" ? (
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
              ) : null}
            </div>
          ))}
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
