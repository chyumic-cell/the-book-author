import { readFile } from "node:fs/promises";

import OpenAI from "openai";

const projectId = process.env.STORYFORGE_PROJECT_ID ?? "cmn4fq5wq003pu86gn6n7sz02";
const chapterNumber = Number(process.env.STORYFORGE_CHAPTER ?? 18);
const modelOverride = process.env.STORYFORGE_MODEL || "";
const config = JSON.parse(
  await readFile("C:/Users/pc1/Documents/The Book Author/.the-book-author.providers.json", "utf8"),
);

const openrouter = config.openrouter;
const client = new OpenAI({
  apiKey: openrouter.apiKey,
  baseURL: openrouter.baseUrl || "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": openrouter.siteUrl || "http://localhost:3000",
    "X-Title": openrouter.appName || "StoryForge",
  },
});

const project = await fetch(`http://localhost:3000/api/projects/${projectId}`)
  .then((response) => response.json())
  .then((payload) => payload.data.project);

const previousChapter = project.chapters.find((chapter) => chapter.number === chapterNumber - 1);
const chapter = project.chapters.find((entry) => entry.number === chapterNumber);

if (!previousChapter || !chapter) {
  throw new Error(`Could not load chapter ${chapterNumber} and its predecessor.`);
}

const prompt = [
  "You are finishing the final chapter of a historical tragic novel for StoryForge.",
  "Return only finished prose. No markdown. No title. No commentary. No explanation.",
  "Write about 1100 to 1400 words and stay within a single continuous chapter scene arc plus a very brief immediate aftermath.",
  "This is the FINAL chapter and must end the novel completely.",
  "Style guidance: use James Scott Bell style craft indirectly through strong scene pressure, objective, opposition, consequences, emotional movement, and a final image that closes the book.",
  "Tone: dark, fatalistic, emotionally severe, historically textured, commercially readable.",
  "Core cast:",
  "- Rene de Valmont: monarchist protagonist, formal, loyal, tragic, now spiritually broken but still driven.",
  "- Thibault the Fool: disgraced former royal jester, shamed drunkard, bitter but still loyal under the ruin.",
  "- Jacques Lefevre: remorseful jailer whose sacrifice already bought Rene time in chapter 17; he must not receive a new future mission here.",
  "- Isabelle Moreau: orphan radicalized by loss, recently betrayed Rene and the royalist cause, must witness enough to understand the cost of revenge.",
  "The previous chapter ended like this:",
  previousChapter.draft.slice(-2400),
  "Chapter 18 hard requirements:",
  "- Begin after Jacques has sacrificed himself and Rene is fleeing with Thibault toward the final failed push.",
  "- Rene must attempt one last doomed charge or push to carry the royalist cause back into France.",
  "- Thibault must regain dignity through a fatal act that buys Rene that final attempt.",
  "- Isabelle must witness enough of the ending to understand the human cost of her revenge and be spiritually scarred, not victorious.",
  "- Rene must die in this chapter.",
  "- The monarchist cause must visibly fail in this chapter.",
  "- No surviving secret mission, no future plan, no hope of restoration, no sequel bait.",
  "- The closing image must make it undeniable that Rene is dead, the old royalist dream is broken, and the survivors are left with loss rather than hope.",
  "Avoid: prefaces, chapter headings, modern language, melodramatic purple excess, open endings, afterlife scenes, symbolic toast scenes, England/Kent epilogues, or any coda that jumps far away from the immediate tragedy.",
  "Keep the action near the failed border push and its immediate aftermath. Do not move to a different country or a distant burial scene.",
].join("\n\n");

const response = await client.responses.create({
  model: modelOverride || openrouter.model || "arcee-ai/trinity-large-preview:free",
  input: prompt,
});

const draft =
  response.output_text ||
  (response.output ?? []).flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("\n");

await fetch(`http://localhost:3000/api/chapters/${chapter.id}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    title: "The Last Cavalier",
    status: "COMPLETE",
    draft: draft.trim(),
  }),
});

await fetch(`http://localhost:3000/api/chapters/${chapter.id}/summary`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
});
await fetch(`http://localhost:3000/api/chapters/${chapter.id}/extract-memory`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
});
await fetch(`http://localhost:3000/api/chapters/${chapter.id}/continuity`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mode: "POST_GENERATION" }),
});

const words = draft.trim().split(/\s+/).filter(Boolean).length;
console.log(`Words: ${words}`);
console.log("--- START ---");
console.log(draft.split("\n").slice(0, 14).join("\n"));
console.log("--- END ---");
console.log(draft.split("\n").slice(-24).join("\n"));
