import "server-only";

type BellTaskFlavor = "planning" | "drafting" | "revision" | "coaching" | "continuity";

function classifyTask(task: string): BellTaskFlavor {
  const lowerTask = task.toLowerCase();

  if (lowerTask.includes("revise")) {
    return "revision";
  }

  if (lowerTask.includes("coach")) {
    return "coaching";
  }

  if (lowerTask.includes("continuity")) {
    return "continuity";
  }

  if (lowerTask.includes("plan") || lowerTask.includes("outline")) {
    return "planning";
  }

  return "drafting";
}

const sharedPrinciples = [
  "Favor commercial-fiction readability and momentum without flattening originality or voice.",
  "Keep Bell's seven craft lenses in play: plot, structure, character, scenes, dialogue, style or voice, and theme.",
  "Build reader bond through empathy, sympathy, likability, vulnerability, or inner conflict rather than exposition alone.",
  "Tie core objectives to meaningful stakes: physical, professional, or psychological loss.",
  "Use opposition that feels justified from the antagonist's point of view, not cartoon evil.",
];

const planningPrinciples = [
  "Use LOCK as a planning spine: lead, objective, confrontation, knockout ending.",
  "Pressure-test the concept for freshness: unique twist, unique character angle, setting, relationships, and wow factor.",
  "Aim for a clean elevator pitch: who the lead is, when the disturbance strikes, and now what must happen.",
  "Map the structural turns clearly: opening disturbance, first doorway, midpoint shift, second doorway, climax, and resonant resolution.",
];

const draftingPrinciples = [
  "Every scene should contain a goal, conflict, and outcome or reaction; avoid static filler.",
  "Escalate worry and confrontation instead of letting progress come too easily.",
  "Dialogue should be compressed, conflict-aware, and rich with subtext rather than overexplaining.",
  "Quiet chapters still need emotional movement, pressure, and a forward-driving ending.",
  "Land the chapter ending with momentum or resonance that makes the reader want the next chapter.",
];

const revisionPrinciples = [
  "Strengthen scenes by clarifying what the lead wants, what pushes back, and how the scene changes story pressure.",
  "Cut generic beats, passivity, melodrama, and vague language; keep concrete conflict and specific choices.",
  "Sharpen the ending so the chapter resolves its current exchange while kicking energy into what follows.",
];

const coachingPrinciples = [
  "If the page feels flat, diagnose lead-objective clarity, confrontation strength, scene change, and chapter-ending pull.",
  "When the writer is stuck, push toward the next consequential choice rather than more setup.",
  "Use Bell-style craft language plainly and practically, as if coaching a novelist at the desk.",
];

const continuityPrinciples = [
  "Check whether objectives, stakes, character motivations, and scene outcomes remain causally coherent.",
  "Flag places where structure promises, emotional turns, or confrontation logic have been dropped.",
];

export function buildBellCraftReference(task: string) {
  const flavor = classifyTask(task);
  const flavorPrinciples =
    flavor === "planning"
      ? planningPrinciples
      : flavor === "revision"
        ? revisionPrinciples
        : flavor === "coaching"
          ? coachingPrinciples
          : flavor === "continuity"
            ? continuityPrinciples
            : draftingPrinciples;

  return [...sharedPrinciples, ...flavorPrinciples].join("\n");
}
