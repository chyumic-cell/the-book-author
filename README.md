# The Book Author

The Book Author is a local-first book-building studio for fiction writers. It combines a manuscript workspace, story bible, structure engine, continuity dashboard, layered memory system, and an optional AI copilot that can act as ghostwriter, cowriter, story doctor, developmental editor, brainstorm partner, writing coach, or beta reader.

## What It Does

- Write chapters manually with autosave
- Generate chapter outlines and full drafts
- Revise selections for pace, prose, tension, or voice
- Talk to the AI in plain language from the bottom copilot bar
- Let the copilot apply changes directly to the idea lab, skeleton, setup, or selected chapter
- Track long-term canon, short-term context, and sandbox notes separately
- Run continuity checks with confidence scores and suggested fixes
- Export markdown, txt, or a full JSON project backup

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS
- Prisma
- SQLite for local dev
- Zustand
- OpenAI server SDK with provider abstraction for OpenAI, OpenRouter, and compatible APIs

## Core Product Layers

### Manuscript

The chapter workspace supports:

- Free writing
- Co-writing with preview-first suggestions
- Full-author generation
- Coaching without forced prose

### Story Skeleton

The skeleton tracks:

- structure beats
- scene cards
- plot threads
- pitch
- Bell-inspired craft signals like LOCK, stakes, seven pillars, and page-turner pressure

### Memory Architecture

The Book Author keeps prompt payloads compact by separating:

- Long-term canon: characters, world rules, durable plot changes, promises, themes
- Short-term memory: recent summaries, active emotional tone, temporary objects, scene carry-forward
- Working notes: sandbox ideas, alternate turns, research questions, unused scenes

The app does not resend the whole manuscript for every request. It assembles a compact context package from project intent, relevant long-term memory, recent short-term memory, active plot threads, continuity constraints, and chapter-local context.

## Plain-Language Copilot

The bottom chat bar is designed for natural instructions. Examples:

- "Add this to the idea vault as a what-if."
- "Turn this into a midpoint beat."
- "Put this in the selected chapter notes."
- "Explain why this chapter feels flat."
- "Brainstorm three stronger versions of this reveal."

When `Apply changes` is enabled, The Book Author will make controlled updates directly in the project when your request clearly asks for it.

## AI Providers

Provider settings live in the Settings tab. Supported:

- OpenAI
- OpenRouter
- Custom OpenAI-compatible API

Provider secrets are stored locally in `.the-book-author.providers.json` and are ignored by git.

If you do not configure a live provider, The Book Author can fall back to mock responses while you test the product shell.

## Setup

1. Install Node.js 22+
2. Install dependencies

```bash
npm install
```

3. Copy the env file

```bash
copy .env.example .env
```

4. Initialize the database

```bash
npm run db:push
npm run db:seed
```

5. Start the app

```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000)

You can also use the Windows launcher files in the project root for one-click startup.

## Environment Variables

`.env.example`

```env
DATABASE_URL="file:./dev.db"
OPENAI_API_KEY=""
OPENAI_MODEL="gpt-4.1-mini"
OPENROUTER_API_KEY=""
OPENROUTER_MODEL="openai/gpt-4.1-mini"
OPENROUTER_BASE_URL="https://openrouter.ai/api/v1"
OPENROUTER_SITE_URL="http://localhost:3000"
OPENROUTER_APP_NAME="The Book Author"
CUSTOM_AI_API_KEY=""
CUSTOM_AI_LABEL="Custom compatible API"
CUSTOM_AI_BASE_URL=""
CUSTOM_AI_MODEL=""
USE_MOCK_AI="true"
```

## Main Routes

- `/`
- `/projects/new`
- `/projects/[projectId]`

## Main API Routes

- `/api/projects`
- `/api/projects/[projectId]`
- `/api/projects/[projectId]/assistant`
- `/api/projects/[projectId]/idea-lab`
- `/api/projects/[projectId]/skeleton`
- `/api/projects/[projectId]/story-bible`
- `/api/projects/[projectId]/generate/plan`
- `/api/projects/[projectId]/memory/promote`
- `/api/projects/[projectId]/export`
- `/api/settings/providers`
- `/api/chapters/[chapterId]/assist`
- `/api/chapters/[chapterId]/generate/outline`
- `/api/chapters/[chapterId]/generate/draft`
- `/api/chapters/[chapterId]/revise`
- `/api/chapters/[chapterId]/summary`
- `/api/chapters/[chapterId]/extract-memory`
- `/api/chapters/[chapterId]/continuity`

## Useful Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run test
npm run smoke:api
npm run smoke:ui
npm run db:push
npm run db:seed
```

## Seed Data

The demo project, `The Glass Meridian`, includes:

- book setup and style profile
- characters, relationships, factions, locations, timeline events, and plot threads
- idea vault entries and sandbox notes
- structure beats and scene cards
- two drafted chapters and summaries
- long-term and short-term memory
- continuity warnings
- a prior coaching run

## Current Notes

- v1 is local-first and auth-free
- project data persists to SQLite automatically
- chapter writing autosaves
- settings and bible edits persist through API writes
- JSON export acts as a portable project backup
