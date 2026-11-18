# Pemucik

Pemucik is a Discord-only bot that creates temporary voice channels on demand. An admin runs `/setup` once, members join the generator voice channel, and Pemucik creates a temporary room, moves the member into it, and removes the room after it becomes empty.

## Current status

Pemucik is in **post-MVP stabilization and polish**.

What is already implemented in the MVP:

- `/setup` creates or reuses the Pemucik category and generator voice channel and now supports persisted defaults such as `editable`, target `category`, and permission source
- Join-to-Create flow creates one tracked temporary voice room per user
- empty temporary rooms are deleted only after a DB-confirmed safety check
- room controls are grouped under `/voice`: `name`, `lock`, `unlock`, `limit`, `claim`, `transfer`, `permit`, `reject`, `status`, `bitrate`, `ghost`, `unghost`, `nsfw`, `region`, `tts`, and `invite`
- admin defaults now include `/set bitrate`, `/reset bitrate`, and `/interface`
- `/interface` creates or refreshes a persistent in-server control interface for room actions
- `/help` and `/support` are available for onboarding and beta support
- Discord-facing copy is currently Russian-first

Current working focus:

- keep the remaining live Discord verification work pending while local planning and implementation continue
- keep docs aligned with the actual command surface
- continue polishing reliability before any future release or listing push
- complete the live Discord pass for the recovered local Piper `/voice tts` slice before treating it as production-verified

Current MVP constraints:

- one generator voice channel per server
- no web dashboard
- no website or custom domain
- destructive room actions must be confirmed against SQLite `temp_channels`

## Slash commands

- `/setup` - prepare the server for Pemucik temporary voice rooms
- `/voice ...` - grouped room controls for room naming, linked text chat, ownership, access, status, bitrate, visibility, NSFW, region, and invites
- `/set bitrate` - set the default bitrate for newly created temp rooms
- `/reset bitrate` - clear the default bitrate override for newly created temp rooms
- `/interface` - create or refresh a persistent Pemucik control interface channel
- `/help` - show setup, usage, and troubleshooting guidance
- `/support` - show support and donation links

## Local Piper TTS

- `/voice tts enabled:true|false` enables or disables TTS for the caller's tracked temporary room
- `/voice tts voice:<preset>` selects a curated local Piper model
- native voice-channel chat is the primary input; stored linked temporary text channels remain a legacy fallback
- only messages from members connected to that exact tracked room are accepted
- the host must provide Piper, the selected model, FFmpeg, UDP access, and the Discord Message Content privileged intent
- the recovery is locally verified but still needs the live checklist in [agent_docs/testing.md](./agent_docs/testing.md)
- see [docs/tts-investigation.md](./docs/tts-investigation.md) for findings, fixes, host requirements, and remaining evidence gaps

## Safety model

Pemucik is intentionally conservative around destructive actions:

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
- `DATABASE_PATH` (defaults to `./data/pemucik.sqlite`; when unset, an existing legacy `./data/xenovoice.sqlite` is detected automatically)
- `LOG_LEVEL`
- `NODE_ENV`
- `PIPER_COMMAND` (optional; defaults to `piper`)
- `PIPER_MODEL_DEFAULT`, `PIPER_MODEL_RU_ALT`, `PIPER_MODEL_EN_DEFAULT` (configure the presets you use)
- `SUPPORT_SERVER_URL` (optional)
- `DONATION_URL` (optional)

## Available commands

- `npm install`
- `npm run dev`
- `npm run build`
- `npm test`
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
- `Speak`

For the current beta, `Administrator` is the simplest way to avoid permission edge cases during setup, `/voice ...`, and `/interface` testing.

## Docs map

- [AGENTS.md](./AGENTS.md) - master plan and guardrails
- [MEMORY.md](./MEMORY.md) - durable milestone log
- [docs/vps-migration.md](./docs/vps-migration.md) - private GitHub backup and new VPS migration guide
- [docs/listing.md](./docs/listing.md) - listing-ready description and asset checklist
- [docs/release-checklist.md](./docs/release-checklist.md) - pre-submission checklist for public listing and outreach
- [docs/quickstart.md](./docs/quickstart.md) - shortest path from clone to working setup
- [docs/tts-piper-plan.md](./docs/tts-piper-plan.md) - original narrow local Piper TTS design and acceptance criteria
- [docs/tts-investigation.md](./docs/tts-investigation.md) - recovered TTS architecture, failure analysis, runtime prerequisites, and verification status
- [docs/troubleshooting.md](./docs/troubleshooting.md) - common setup, permission, and cleanup issues
- [docs/prd-pemucik-mvp.md](./docs/prd-pemucik-mvp.md) - product requirements
- [docs/tech-design-pemucik-mvp.md](./docs/tech-design-pemucik-mvp.md) - technical design
- [agent_docs/testing.md](./agent_docs/testing.md) - manual verification loop

## Verification

For product behavior, use the manual Discord verification loop in [agent_docs/testing.md](./agent_docs/testing.md). Core voice behavior is not considered done without a real Discord check.
