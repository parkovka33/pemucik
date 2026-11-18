# Pemucik Release Pass — 2026-05-05

Historical note:
This file is a dated snapshot of the release-readiness picture on 2026-05-05.
It is **not** the authoritative current project status after later post-MVP control expansion and polishing work.
Use [README.md](../README.md) and [MEMORY.md](../MEMORY.md) for the current command surface and active priorities.

This document records a real pre-listing pass against [docs/release-checklist.md](./release-checklist.md).

## Status

Historical result for 2026-05-05:
Pemucik was considered **ready with caveats** for a public bot-directory submission at that time.

The repository, local checks, and live Discord verification from that pass were in good shape. Later post-MVP changes mean this document should no longer be treated as the current go/no-go gate.

## 1. Repository readiness

Closed in this pass:

- `README.md` matches the current shipped MVP surface and constraints.
- `docs/listing.md` stays within current MVP scope and does not promise unsupported features.
- `docs/quickstart.md` and `docs/troubleshooting.md` match the current setup/support flow.
- `.github` FAQ/support/issue-template files are aligned with Pemucik.
- The last obvious template-era public blockers in `.github` were cleaned up in this pass:
  - `GOVERNANCE.md`
  - `workflows/greetings.yml`
  - `workflows/repo-lint.yml`

Notes:

- Listing media assets exist outside the repository.
- `CLAUDE.md` still exists as a tool-specific file, but it is not part of the public bot listing surface.

## 2. Code and command checks

Verified locally on 2026-05-05:

- `npm run lint` — passed
- `npm run build` — passed

Not required in this pass:

- `npm run commands:register` was not rerun because slash command definitions did not change in this release-docs pass.
- `npm run db:migrate` was not rerun because DB schema and migration logic did not change in this release-docs pass.

## 3. Manual Discord verification

Verified live on 2026-05-05:

- `/setup` created or reused the `Pemucik` category correctly
- generator channel was present and usable
- joining the generator created a tracked temp room
- the member was moved into the temp room
- `/panel` worked for the owner
- `/panel` was denied for a non-owner with the expected message
- rename worked
- lock worked without `Missing Permissions`
- unlock worked and unrelated overwrites remained intact
- user-limit changes worked
- tracked empty rooms were deleted after the cleanup delay
- a normal non-temp voice channel was not deleted or modified
- restart persistence behaved correctly
- `/help` copy matched the current product
- `/support` worked both with configured links and with fallback copy

Observed notes from the live pass:

- cleanup delay was about 5 seconds
- the tester would prefer immediate deletion after everyone leaves, but the current delay still behaved as intended

## 4. Support and operator readiness

Closed by repo/code review:

- `/help` copy matches the current product surface
- known permission failure modes are documented in `docs/troubleshooting.md`
- `/support` includes both configured-link and fallback-copy paths in code

Closed in the live pass:

- `/support` showed configured links correctly
- `/support` fallback behavior with support/donation URLs unset was acceptable

## 5. Listing readiness

Recommended short description:

`Free-first Discord bot for temporary voice channels. Run /setup once, let members join the generator voice channel, and Pemucik creates and cleans up rooms automatically.`

Recommended long description:

Use the English long description from `docs/listing.md` as the default listing text for directories that support a fuller overview.

Closed by docs review:

- listing bullets do not promise unsupported features
- current language expectations are honest
- the one-generator-per-server MVP limit is explicitly stated

Verified in operator review:

- demo GIF exists
- setup screenshot exists
- owner panel screenshot exists
- cleanup screenshot or clip exists

Chosen in this pass:

- use the recommended English short description above as the default short listing copy
- use the English long description from `docs/listing.md` as the default long listing copy
- expose the public support link in listings
- do not expose the public donation link in listings yet

## 6. Known constraints to state honestly

These are already documented and should remain visible in public-facing copy:

- one generator channel per server
- Discord-only UX, no web dashboard
- Russian-first Discord-facing copy in the current MVP
- advanced controls like transfer, permit, and reject are not in the current release

## 7. Remaining caveats

There are no confirmed product blockers from this pass.

Chosen operator decisions:

1. Use the recommended English short description for submission by default.
2. Use the English long description from `docs/listing.md` for submission by default.
3. Expose support publicly, but keep the donation link out of the first public listing.

Non-blocking notes:

- lock/unlock still depends on real Discord permission topology and bot role placement
- broader demand validation is still limited because rollout has stayed intentionally narrow

## 8. Final release note draft

What was verified live in Discord:

- `/setup`
- generator join flow
- temp-room creation and member move
- owner `/panel`
- non-owner denial
- rename
- lock
- unlock
- user-limit changes
- cleanup
- non-temp channel safety
- restart persistence
- `/help`
- `/support` with configured links
- `/support` fallback without configured links

What was only checked locally in this pass:

- repository/docs alignment
- workflow/governance cleanup
- `npm run lint`
- `npm run build`
- command/help/support copy alignment by code review

What remains for the next phase:

- move from listing prep into actual submission/outreach work
