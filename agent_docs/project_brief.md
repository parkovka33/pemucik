# Project Brief (Persistent)

- **Product vision:** XenoVoice is a clean, friendly, free-first Discord bot that creates temporary voice rooms on demand and keeps servers uncluttered without requiring a website.
- **Target audience:** Discord server owners/admins running creator, gaming, hobby, study, fan, or social communities that need quick voice rooms without admin micromanagement.
- **Primary value:** Users join one generator channel, get their own temporary room automatically, control it inside Discord, and the room disappears when empty.

## Coding Conventions
- **Architecture:** Keep command and event handlers thin. Put business logic in `services/`, persistence in `db/repositories/`, and reusable helpers in `utils/`.
- **Scope discipline:** MVP stays Discord-only. No web dashboard, no custom domain, no AI features, no premium/paywall logic, and no extra temp-voice features until the core loop is stable.
- **Current discipline:** The bot has already moved slightly beyond the strict MVP surface, so the priority now is stabilizing and validating the existing `/voice`, `/interface`, and `/setup` defaults rather than expanding into new feature branches.
- **Type safety:** Use strict TypeScript. Avoid `any`; prefer explicit interfaces or `unknown` with narrowing.
- **Safety rule:** Before deleting or editing a temporary room, confirm the channel exists in SQLite `temp_channels`.
- **Permission safety:** Lock/unlock must never wipe unrelated overwrites or block admins unexpectedly.
- **Change style:** Prefer small, targeted edits over large rewrites.

## Quality Gates
- **Plan first:** For any multi-file or core-behavior change, propose a short plan and wait for approval before coding.
- **Verification:** After each logical change, run the relevant checks and/or manual Discord verification steps.
- **Manual testing:** Core voice behavior must be verified in Discord, not only with mocked tests.
- **Automated tests:** Add targeted unit tests only for pure logic such as validation, cooldowns, ownership checks, permission checks, and repository helpers.
- **Checklist discipline:** Use `REVIEW-CHECKLIST.md` before calling a feature done.
- **Memory discipline:** Update `MEMORY.md` after milestones, structural decisions, or notable bug fixes.

## Key Commands
- **Install dependencies:** `npm install`
- **Start dev bot:** `npm run dev`
- **Register slash commands:** `npm run commands:register`
- **Run DB migration:** `npm run db:migrate`
- **Lint:** `npm run lint`
- **Format:** `npm run format`
- **Build:** `npm run build`
- **Start production build:** `npm start`

## Current MVP Phase
- **Active phase:** Post-MVP Stabilization & Polish
- **Current goal:** Keep the expanded command surface reliable, align operator docs with the actual bot behavior, and close targeted live Discord validation gaps before any renewed release push.
- **Current priority order:** setup defaults, grouped room controls, persistent interface behavior, docs alignment, live verification, then later release/listing work.

## Core Must-Have Features
- `/setup` creates or configures the category and Join-to-Create channel
- Join-to-Create flow creates a temp voice room and moves the member into it
- Ownership mapping for each temp channel
- Discord-native owner controls are available through `/voice ...`
- `/interface` can publish a persistent in-server control surface for room actions
- Rename channel
- Lock / unlock channel safely
- Set user limit
- Auto-delete empty temp channels with a safety delay and DB confirmation
- Friendly error handling and basic metrics

## High-Risk Areas
- Deleting non-temporary channels
- Breaking admin access with bad permission overwrites
- Leaving stale DB rows after failed create/move/delete operations
- Creating duplicate rooms for one user
- Ignoring Discord rate-limit-sensitive flows

## Update Cadence
Refresh this brief when:
- the active phase changes
- the stack or architecture changes
- new protected areas are introduced
- testing/verification expectations change
- a major product constraint or safety rule changes
- note when a phase transition is made with intentionally lightweight validation rather than stronger demand proof
