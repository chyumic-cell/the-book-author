# The Book Author Hosted Private-Beta Deployment Guide

## What this deployment mode does

The Book Author now supports a **hosted private-beta portal** that is safe to publish before the full cloud writing stack exists.

In this phase:

- the public site handles:
  - sign-up and sign-in
  - terms acceptance
  - downloads
  - feedback
  - moderation and bans
  - mirrored export records for hosted exports
- real project libraries are intended to stay on each user's own device
- the public site does **not** expose the old shared writing workspace routes

## What is ready right now

- Desktop installer:
- `C:\Users\pc1\Documents\The Book Author\dist\The-Book-Author-Installer.cmd`
- Phone/web install:
  - installable PWA with Android and iPhone home-screen support
- Hosted private-beta portal:
  - ready for Vercel + Neon

## Required environment variables

### Vercel

- `STORYFORGE_HOSTED_BETA=true`
- `NEXT_PUBLIC_STORYFORGE_HOSTED_BETA=true`
- `DATABASE_URL=<your Neon Postgres connection string>`
  - or `STORYFORGE_BETA_DATABASE_URL=<your Neon Postgres connection string>`
- `NEXT_PUBLIC_APP_URL=https://your-project.vercel.app`
- `STORYFORGE_APP_URL=https://your-project.vercel.app`
- `STORYFORGE_OWNER_NAME=Michael William Polevoy`
- `STORYFORGE_OWNER_USERNAMES=michael,mwpolevoy,the-book-author-owner`
- `OPENROUTER_SETUP_URL=https://openrouter.ai/keys`
- `STORYFORGE_SUPPORT_EMAIL=<optional support email>`

## Free deployment path: Vercel + Neon

### 1. Create a Neon database

Create a free Neon Postgres project and copy the connection string into `DATABASE_URL`.

### 2. Push The Book Author to GitHub

1. Create a GitHub repository.
2. Push the `The Book Author` folder to GitHub.

### 3. Import into Vercel

1. Create a free Vercel Hobby account.
2. Import the GitHub repository into Vercel.
3. Add the environment variables listed above.
4. Deploy.

### 4. Verify the live portal

After deployment, the public site should show:

- The Book Author private-beta landing page
- sign-in / sign-up pages
- terms page
- downloads page
- feedback page

It should **not** allow the public hosted site to open the old shared `/projects` workspace routes.

## Desktop and phone distribution

### The Book Author - PC

Users download the installer from:

- `/downloads/The-Book-Author-Installer.cmd`

After installing, they must use their own AI key in The Book Author settings.

### The Book Author - Android

Users open the hosted The Book Author site in Chrome on Android and choose:

- Install app
- or Add to Home Screen

### The Book Author - iPhone / iPad

Users open the hosted The Book Author site in Safari and choose:

- Share
- Add to Home Screen

## Local-first beta rule

This deployment mode is intentionally conservative.

- Accounts, feedback, moderation, and terms live in Neon
- working manuscripts are expected to live on the user's own computer or phone
- each user must supply their own AI key

## Public download hosting

If you want a public installer page outside Vercel, you can also upload:

- `The-Book-Author-Installer.cmd`

to:

- GitHub Releases
- Google Drive
- Dropbox
- OneDrive

GitHub Releases is still the cleanest free option for versioned desktop downloads.

## Search engine note

Publishing the site online makes it crawlable, but that does **not** guarantee it will rank for broad terms like `book writing apps`.

Search visibility depends on:

- the site being public and crawlable
- having indexable content
- earning links and authority over time
- not blocking indexing in robots or meta tags

The current hosted-beta portal is suitable for discovery, documentation, sign-up, and downloads, but ranking for competitive app keywords will still require content and time.
