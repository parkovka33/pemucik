# AGENTS.md — Master Plan for Pemucik

## Project Overview & Stack
**App:** Pemucik
**Overview:** Pemucik is a Discord-only bot that creates temporary voice channels on demand. An admin runs `/setup` once, members join the generator voice channel, the bot creates a temporary room, moves the member into it, assigns ownership, exposes Discord-native controls, and safely deletes the room when it becomes empty. The MVP must stay reliable, friendly, lightweight, and easy to debug for a solo founder working with AI assistance.
**Stack:** Node.js LTS, TypeScript, discord.js v14, SQLite with better-sqlite3, PM2 on a small Linux VPS
**Critical Constraints:** Discord-only UX, no website, no custom domain, hosting under $10/month, one Join-to-Create generator is enough for MVP, destructive actions must be database-confirmed, and the bot must never delete non-temporary channels.

## Setup & Commands
Execute these commands for standard development workflows. Do not invent new package manager commands.
- **Setup:** `npm install`
- **Development:** `npm run dev`
- **Command Registration:** `npm run commands:register`
- **Database Migration:** `npm run db:migrate`
- **Linting:** `npm run lint`
- **Formatting:** `npm run format`
- **Build:** `npm run build`
- **Production Start:** `npm start`
- **Testing:** `npm test` builds the project and runs the compiled Node test suite. Use the manual Discord verification loop in `agent_docs/testing.md` for core voice behavior and add targeted unit tests only for pure logic.

## Protected Areas
Do NOT modify these areas without explicit human approval:
- **Infrastructure & Deployment:** VPS setup, PM2 process configuration, backup/restore workflow, and deployment docs.
- **Secrets & Bot Identity:** `.env`, Discord application settings, bot token handling, invite scopes, and support/donation URLs.
- **Database Safety:** Existing migrations, SQLite backup flow, and any deletion logic that touches channels or persistent mappings.
- **Permission Overwrites:** Lock/unlock behavior must never wipe unrelated overwrites or break admin access.

## Coding Conventions
- **Formatting:** Enforce ESLint/Prettier rules strictly. Keep new code clean and consistent.
- **Architecture rules:** Use the feature-based structure from the Tech Design: thin command/event handlers, business logic in `services/`, persistence in `db/repositories/`, utilities in `utils/`.
- **Testing Expectations:** Manual Discord verification is mandatory for core voice flows. Add small unit tests for pure logic such as validation, cooldowns, ownership checks, permission checks, and repository helpers.
- **Type Safety:** Use strict TypeScript. Avoid `any`; prefer explicit types or `unknown` with narrowing.
- **Safety Rule:** Before deleting or editing a temp room, confirm it exists in the SQLite `temp_channels` table.

## How I Should Think
1. **Understand Intent First**: Before answering, identify what the user actually needs.
2. **Ask If Unsure**: If critical information is missing, ask before proceeding.
3. **Plan Before Coding**: Propose a brief plan, ask for approval, then implement.
4. **Verify After Changes**: Run lint/build checks or manual verification after each logical change.
5. **Explain Trade-offs**: When recommending something, mention simpler or safer alternatives.

## Plan → Execute → Verify
- **Plan:** For any change spanning more than one file or touching core behavior, propose a short plan first.
- **Execute:** The strict MVP build order is already complete enough for day-to-day work. Current priority is post-MVP stabilization in this order: setup defaults, grouped room controls, persistent interface behavior, docs alignment, live Discord verification, then eventual release/listing work.
- **Verify:** After each feature, run the relevant commands and perform the matching manual Discord checks from `agent_docs/testing.md`.
- **Checkpoint:** Update `MEMORY.md` after each milestone so the next agent session can continue safely.

## Current Phase
**Active Phase:** Post-MVP Stabilization & Polish
**Goal:** Stabilize the expanded command surface, keep docs aligned with the real bot behavior, and close targeted live Discord validation gaps before any renewed release or listing push.

## Feature Roadmap
1. **Foundation:** Project scaffold, environment loading, Discord client, command registration, logging.
2. **Core Loop:** `/setup`, guild settings storage, Join-to-Create creation flow, ownership mapping.
3. **Reliability:** Safe cleanup, cooldowns, permission checks, friendly errors, metrics.
4. **Controls:** `/panel`, rename, lock/unlock, set user limit, admin override.
5. **Operations:** VPS deployment, PM2 process management, backups, real-server testing.
6. **Beta Validation:** `/help`, `/support`, lightweight onboarding, and support feedback loops.
7. **Public Listing Prep:** Bot description, screenshots/GIFs, lightweight documentation, and listing readiness once the bot remains stable.
8. **Post-MVP Stabilization:** Validate expanded `/voice` controls, persistent `/interface`, `/setup` defaults, and operator docs before deciding on further feature work or release timing.

## What NOT To Do
- Do NOT delete files without explicit confirmation.
- Do NOT modify database schemas or cleanup safety rules without a backup plan.
- Do NOT add more feature branches while the current post-MVP command surface still has unverified live behavior or stale operator docs. The only currently approved exception is a narrow local Piper-based `/voice tts` slice tied strictly to tracked temp rooms and linked temp text channels.
- Do NOT skip lint/build/manual verification because a change looks simple.
- Do NOT bypass failing checks or hide failures with placeholder logic.
- Do NOT add a website, premium logic, or broad new product surfaces while setup, cleanup, permissions, and current room controls still need stabilization.

## Agent Behaviors
These rules apply across all AI coding assistants:
1. **Read the docs first:** Start with `AGENTS.md`, then use `agent_docs/` for detailed decisions.
2. **Refactor over rewrite:** Prefer small, targeted edits over large rewrites.
3. **Discord-native scope:** Keep the MVP inside Discord commands, components, and modals.
4. **Safety before cleverness:** Deletion, permission edits, and ownership checks must be explicit, logged, and easy to debug.
5. **Context compaction:** Record durable state in `MEMORY.md` instead of relying on chat history alone.
