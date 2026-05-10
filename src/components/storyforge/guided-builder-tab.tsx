"use client";

import { useMemo, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { toast } from "sonner";

import { requestJson } from "@/components/storyforge/workspace-helpers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { APP_NAME } from "@/lib/brand";
import type {
  ContextPackage,
  ProjectChatActionRecord,
  ProjectChatScope,
  ProjectWorkspace,
  StoryForgeTab,
} from "@/types/storyforge";

type AssistantPayload = {
  reply: string;
  actions: ProjectChatActionRecord[];
  project: ProjectWorkspace;
  contextPackage: ContextPackage | null;
  scope: ProjectChatScope;
  nextTab: StoryForgeTab | null;
};

type GuidedStep = {
  id: string;
  title: string;
  question: string;
  placeholder: string;
  scope: ProjectChatScope;
  instruction: string;
};

const GUIDED_STEPS: GuidedStep[] = [
  {
    id: "core",
    title: "Book Core",
    question: "What is the book about, and what should the reader feel by the end?",
    placeholder: "Example: A prince and a thief cross a cursed desert to save a city, but the real story is about trust, guilt, and choosing mercy over revenge.",
    scope: "PROJECT",
    instruction:
      "Update Book Setup fields such as premise, one-line hook, story brief, themes, audience, genre, tone, plot direction, and comparable titles where relevant.",
  },
  {
    id: "characters",
    title: "Characters",
    question: "Describe the important characters, how they speak, what they want, what they fear, and how they clash.",
    placeholder: "Name each person if you can. Include emotions, dialect, repeated phrases, secrets, friendships, enemies, flaws, virtues, and what makes their voice different.",
    scope: "STORY_BIBLE",
    instruction:
      "Create or update character dossiers in the Story Bible. Fill all relevant character fields, especially speech descriptors, emotions, relationships, secrets, virtues, flaws, and distinguishing features.",
  },
  {
    id: "world",
    title: "World And Rules",
    question: "How does the world work? Describe places, organizations, magic, technology, laws, customs, or rules the book must obey.",
    placeholder: "Example: Magic costs memory. The church controls maps. Nobles cannot lie inside iron courts. Smugglers use songs as passwords.",
    scope: "STORY_BIBLE",
    instruction:
      "Create or update locations, factions, plot threads, mysteries, timeline anchors, and book rules. Put system logic into book rules instead of dumping exposition into the manuscript.",
  },
  {
    id: "plot",
    title: "Plot And Structure",
    question: "Walk me through the plot as you imagine it: beginning, middle, ending, twists, mysteries, reveals, and major emotional turns.",
    placeholder: "It can be messy. Mention the opening problem, midpoint reversal, climax, ending, unanswered questions, and what changes between chapters.",
    scope: "SKELETON",
    instruction:
      "Update the Story Skeleton. Build or revise arcs, structure beats, mysteries, plot threads, scene cards, and chapter runway fields. Use existing chapters when possible.",
  },
  {
    id: "chapters",
    title: "Chapter Runway",
    question: "How many chapters should this test book have, and what should each chapter accomplish?",
    placeholder: "Example: Three chapters, around 2,000 words total. Chapter 1 introduces the bargain, Chapter 2 breaks trust, Chapter 3 forces a choice.",
    scope: "SKELETON",
    instruction:
      "Fill chapter runway fields for every relevant chapter: title, purpose, current beat, desired mood, target words, key beats, required inclusions, forbidden elements, scene list, notes, and outline.",
  },
  {
    id: "style",
    title: "Atmosphere And Voice",
    question: "What should the prose feel like? Describe atmosphere, pacing, dialogue style, darkness, humor, romance, action, and how thoughts should look.",
    placeholder: "Example: Fast, tense, lyrical but clear. Lots of dialogue. Thoughts in italics. Speech always in quotation marks. No robotic voices.",
    scope: "PROJECT",
    instruction:
      "Update style profile and Book Setup style fields. Convert the answer into concrete voice rules, aesthetic guide, pacing, prose density, dialogue balance, and formatting rules.",
  },
  {
    id: "draft",
    title: "Draft Instruction",
    question: "Give the AI its final drafting instruction. What should it write now, and what must it not forget?",
    placeholder: "Example: Write a 2,000 word, three-chapter medieval fantasy with heavy dialogue. Use the characters, rules, structure, and tone we just built.",
    scope: "CHAPTER",
    instruction:
      "Prepare the project for drafting. If the user asks for actual prose, update the best matching chapter outline or notes so the chapter generator has precise instructions.",
  },
];

function buildGuidedInstruction(step: GuidedStep, answer: string) {
  return [
    `Guided Builder step: ${step.title}.`,
    "The user is answering one guided planning question. Break the answer down and apply it to the correct app fields.",
    step.instruction,
    "Use the full existing project, series, setup, story bible, skeleton, memory, chapters, and continuity as context.",
    "Do not put everything into one notes field if there are more specific fields available.",
    "If an entity does not exist yet, create it. If it exists, improve and fill its relevant fields.",
    "Return only a concise summary of what you updated after applying the changes.",
    "",
    `Question: ${step.question}`,
    `User answer: ${answer}`,
  ].join("\n");
}

export function GuidedBuilderTab({
  project,
  selectedChapterId,
  onContextPackage,
  onOpenTab,
  onProjectUpdate,
}: {
  project: ProjectWorkspace;
  selectedChapterId: string | null;
  onContextPackage: (contextPackage: ContextPackage | null) => void;
  onOpenTab: (tab: StoryForgeTab) => void;
  onProjectUpdate: (project: ProjectWorkspace) => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<Array<{ step: string; reply: string }>>([]);
  const step = GUIDED_STEPS[stepIndex] ?? GUIDED_STEPS[0];
  const progress = useMemo(() => Math.round(((stepIndex + 1) / GUIDED_STEPS.length) * 100), [stepIndex]);

  async function submitAnswer() {
    const trimmed = answer.trim();
    if (!trimmed) {
      toast.error("Write an answer first, even if it is rough.");
      return;
    }

    setRunning(true);
    try {
      const data = await requestJson<AssistantPayload>(`/api/projects/${project.id}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: buildGuidedInstruction(step, trimmed),
          role: step.scope === "SKELETON" ? "OUTLINE_ARCHITECT" : step.scope === "STORY_BIBLE" ? "STORY_DOCTOR" : "COWRITER",
          scope: step.scope,
          chapterId: selectedChapterId,
          applyChanges: true,
        }),
      });

      onProjectUpdate(data.project);
      onContextPackage(data.contextPackage);
      setHistory((current) => [...current, { step: step.title, reply: data.reply }]);
      setAnswer("");
      if (stepIndex < GUIDED_STEPS.length - 1) {
        setStepIndex((current) => current + 1);
      }
      if (data.nextTab) {
        onOpenTab(data.nextTab === "guided" ? "guided" : data.nextTab);
      }
      toast.success(`${APP_NAME} placed that answer into the project.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Guided Builder could not apply that answer.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Card className="grid gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-2">
            <Chip>Guided Builder</Chip>
            <h3 className="text-3xl">Build the book one step at a time</h3>
            <p className="max-w-3xl text-sm text-[var(--muted)]">
              Answer one plain-language question. {APP_NAME} breaks your answer apart and puts it into the best matching
              setup, story bible, skeleton, character, rule, or chapter-planning fields.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip>Step {stepIndex + 1} of {GUIDED_STEPS.length}</Chip>
            <Chip>{progress}%</Chip>
          </div>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-[color:var(--panel-soft)]">
          <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${progress}%` }} />
        </div>
      </Card>

      <Card className="grid gap-4 p-5">
        <div className="grid gap-2">
          <Chip>{step.scope.replace("_", " ")}</Chip>
          <h4 className="text-2xl">{step.title}</h4>
          <p className="text-base text-[var(--text)]">{step.question}</p>
        </div>

        <TextareaAutosize
          className="min-h-[12rem] w-full resize-y rounded-xl border border-[color:var(--line)] bg-white px-4 py-3 text-base leading-7 text-[var(--text)] outline-none transition focus:border-[color:rgba(var(--accent-rgb),0.55)]"
          disabled={running}
          minRows={7}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder={step.placeholder}
          value={answer}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={running || !answer.trim()} onClick={() => void submitAnswer()}>
            {running ? "Applying..." : stepIndex === GUIDED_STEPS.length - 1 ? "Apply final step" : "Apply and ask next"}
          </Button>
          <Button disabled={running || stepIndex === 0} onClick={() => setStepIndex((current) => Math.max(0, current - 1))} variant="secondary">
            Back
          </Button>
          <Button disabled={running || stepIndex >= GUIDED_STEPS.length - 1} onClick={() => setStepIndex((current) => Math.min(GUIDED_STEPS.length - 1, current + 1))} variant="secondary">
            Skip
          </Button>
          <Button onClick={() => onOpenTab("chapters")} variant="ghost">
            Go write
          </Button>
        </div>
      </Card>

      {history.length > 0 ? (
        <Card className="grid gap-3 p-5">
          <h4 className="text-xl">What has been applied</h4>
          <div className="grid gap-3">
            {history.map((entry, index) => (
              <div key={`${entry.step}-${index}`} className="rounded-xl border border-[color:var(--line)] bg-white p-3">
                <Chip>{entry.step}</Chip>
                <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--muted)]">{entry.reply}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
