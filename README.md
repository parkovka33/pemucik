# XenoVoice

XenoVoice is a Discord-only bot that creates temporary voice channels on demand. An admin runs `/setup` once, members join the generator voice channel, and XenoVoice creates a temporary room, moves the member into it, and removes the room after it becomes empty.

## Current status

XenoVoice is in **post-MVP stabilization and polish**.

What is already implemented in the MVP:

- `/setup` creates or reuses the XenoVoice category and generator voice channel and now supports persisted defaults such as `editable`, target `category`, and permission source
- Join-to-Create flow creates one tracked temporary voice room per user
- empty temporary rooms are deleted only after a DB-confirmed safety check
- room controls are grouped under `/voice`: `name`, `lock`, `unlock`, `limit`, `claim`, `transfer`, `permit`, `reject`, `text`, `status`, `bitrate`, `ghost`, `unghost`, `nsfw`, `region`, and `invite`
- admin defaults now include `/set bitrate`, `/reset bitrate`, and `/interface`
- `/interface` creates or refreshes a persistent in-server control interface for room actions
- `/help` and `/support` are available for onboarding and beta support
- Discord-facing copy is currently Russian-first

Current working focus:

- keep the remaining live Discord verification work pending while local planning and implementation continue
- keep docs aligned with the actual command surface
- continue polishing reliability before any future release or listing push
- document the planned narrow `/voice tts` slice around linked temp text channels and local Piper voices before implementation begins

Current MVP constraints:

- one generator voice channel per server
- no web dashboard
- no website or custom domain
- destructive room actions must be confirmed against SQLite `temp_channels`

## Slash commands

- `/setup` - prepare the server for XenoVoice temporary voice rooms
- `/voice ...` - grouped room controls for room naming, linked text chat, ownership, access, status, bitrate, visibility, NSFW, region, and invites
- `/set bitrate` - set the default bitrate for newly created temp rooms
- `/reset bitrate` - clear the default bitrate override for newly created temp rooms
- `/interface` - create or refresh a persistent XenoVoice control interface channel
- `/help` - show setup, usage, and troubleshooting guidance
- `/support` - show support and donation links

## Planned next slice

- `/voice tts ...` is planned as a narrow, opt-in room-level feature that reads messages from a tracked linked text channel into the matching tracked temp voice room using local Piper voice presets
- this feature is not implemented yet and should stay scoped to tracked temp rooms only
- see [docs/TTS-PIPER-PLAN.md](./docs/TTS-PIPER-PLAN.md) for the current design

## Safety model

XenoVoice is intentionally conservative around destructive actions:

- it never deletes a voice channel unless that channel exists in `temp_channels`
- it never deletes a linked temp text channel unless that channel is confirmed through the linked temp text mapping in SQLite
- cleanup uses a delay and a second emptiness check before deletion
- lock and unlock only edit the needed overwrite instead of wiping all overwrites
- owner controls allow admin override through `Manage Channels` or `Administrator`

## Stack

- Node.js LTS
- TypeScript
- discord.js v14
- SQLite with `better-sqlite3`

## Local setup

1. Copy `.env.example` to `.env`.
2. Fill in `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`.
3. Optionally set `DISCORD_GUILD_ID` for faster guild command registration during development.
4. Run `npm install`.
5. Run `npm run db:migrate`.
6. Run `npm run commands:register`.
7. Run `npm run dev`.

Environment variables:

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_GUILD_ID` (optional)
- `DATABASE_PATH`
- `LOG_LEVEL`
- `NODE_ENV`
- `SUPPORT_SERVER_URL` (optional)
- `DONATION_URL` (optional)

## Available commands

- `npm install`
- `npm run dev`
- `npm run build`
- `npm start`
- `npm run commands:register`
- `npm run db:migrate`
- `npm run lint`
- `npm run format`

## Required Discord permissions

- `Manage Channels`
- `Move Members`
- `View Channels`
- `Connect`
- `Send Messages`

For the current beta, `Administrator` is the simplest way to avoid permission edge cases during setup, `/voice ...`, and `/interface` testing.

## Docs map

- [AGENTS.md](./AGENTS.md) - master plan and guardrails
- [MEMORY.md](./MEMORY.md) - durable milestone log
- [docs/VPS-MIGRATION.md](./docs/VPS-MIGRATION.md) - private GitHub backup and new VPS migration guide
- [docs/LISTING.md](./docs/LISTING.md) - listing-ready description and asset checklist
- [docs/RELEASE-CHECKLIST.md](./docs/RELEASE-CHECKLIST.md) - pre-submission checklist for public listing and outreach
- [docs/QUICKSTART.md](./docs/QUICKSTART.md) - shortest path from clone to working setup
- [docs/TTS-PIPER-PLAN.md](./docs/TTS-PIPER-PLAN.md) - planned narrow linked-text TTS design using local Piper voices
- [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) - common setup, permission, and cleanup issues
- [docs/PRD-XenoVoice-MVP.md](./docs/PRD-XenoVoice-MVP.md) - product requirements
- [docs/TechDesign-XenoVoice-MVP.md](./docs/TechDesign-XenoVoice-MVP.md) - technical design
- [agent_docs/testing.md](./agent_docs/testing.md) - manual verification loop

## Verification

For product behavior, use the manual Discord verification loop in [agent_docs/testing.md](./agent_docs/testing.md). Core voice behavior is not considered done without a real Discord check.
