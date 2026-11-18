# CLAUDE.md — Claude Code Configuration for Pemucik

## Project Context
**App:** Pemucik
**Stack:** Node.js LTS, TypeScript, discord.js v14, SQLite with better-sqlite3, PM2 on a small Linux VPS
**Stage:** MVP Development
**User Level:** A — Vibe-coder

## Directives
1. **Master Plan:** Always read `AGENTS.md` first. It contains the current phase, safety rules, and build order.
2. **Documentation:** Refer to `agent_docs/` for tech stack details, code patterns, product requirements, project conventions, and testing expectations.
3. **Plan-First:** Propose a brief plan and wait for approval before coding when a task spans more than one file or touches core behavior.
4. **Incremental Build:** Build one small feature at a time in this order: setup, storage, generator flow, cleanup, owner controls, polish, deployment.
5. **Safety Rule:** Before deleting or editing a temporary room, confirm it exists in the SQLite `temp_channels` table.
6. **Permission Safety:** Never wipe unrelated permission overwrites. Lock/unlock must preserve admin access.
7. **No Linting Roleplay:** Do not act like a linter. Use the project commands to verify changes.
8. **Communication:** Be concise, ask one specific clarifying question if critical context is missing, and avoid filler.
9. **Memory Discipline:** Update `MEMORY.md` after milestones or important architectural decisions.

## Commands
- `npm install` — Install dependencies
- `npm run dev` — Start local development bot
- `npm run build` — Compile TypeScript
- `npm start` — Run production build
- `npm run commands:register` — Register Discord application commands
- `npm run db:migrate` — Apply SQLite migrations
- `npm run lint` — Run lint checks
- `npm run format` — Apply formatting

## Working Rules
- Keep the MVP Discord-only.
- Do not add a website, premium logic, multilingual UI, multiple generators, or advanced temp-voice features before the core loop is stable.
- Keep command/event handlers thin and move business logic into `services/`.
- Prefer small, targeted edits over large rewrites.
- Add targeted unit tests only for pure logic; use manual Discord verification for core voice behavior.
- If verification fails, fix the issue before continuing.

## Recommended Start Prompt
Read `AGENTS.md` and the files in `agent_docs/`, summarize the current phase and constraints, then propose the smallest safe next step for Phase 1.
