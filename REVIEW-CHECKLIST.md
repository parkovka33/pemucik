# Pemucik Review Checklist

Use this checklist before calling a change complete or ready for merge.

## Scope and safety

- [ ] The change stays inside the current stabilization phase and does not add unrelated new feature branches ahead of verification and docs alignment.
- [ ] No protected areas were changed without explicit approval.
- [ ] Cleanup or destructive channel behavior still depends on SQLite `temp_channels` confirmation.
- [ ] Permission overwrite logic still avoids wiping unrelated overwrites.
- [ ] No unrelated files were changed or reverted.

## Code quality

- [ ] New code follows the current architecture: thin commands/events, logic in `services/`, persistence in `db/repositories/`, helpers in `utils/`.
- [ ] No new `any` types were introduced without a strong reason.
- [ ] User-facing Discord copy is intentional and consistent with the current Russian-first MVP.
- [ ] Logging and error handling remain actionable for setup, interface, room-control, and voice-state flows.

## Verification

- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.
- [ ] `npm run commands:register` was run if slash command definitions changed.
- [ ] `npm run db:migrate` was run if schema or migration logic changed.
- [ ] Manual Discord verification was done for any touched core voice, ownership, permission, setup-default, or interface behavior.

## Manual Discord checks when relevant

- [ ] `/setup` succeeds on a real test server.
- [ ] If `/setup` changed, `editable`, `category`, and `permission` defaults were tested on a real server.
- [ ] Joining the generator channel creates a temp room and moves the member.
- [ ] `/voice ...` owner controls behave correctly for owner and admin override cases.
- [ ] `/interface` creates or refreshes the persistent control surface and still works after repeated runs or stale metadata recovery.
- [ ] Rename, lock/unlock, and user limit controls behave correctly.
- [ ] Empty tracked temp rooms are deleted and normal rooms are not.

## Handoff

- [ ] `README.md`, `docs/`, or `.github/` docs were updated if operator-facing behavior changed.
- [ ] `MEMORY.md` was updated for milestones, durable decisions, or notable quirks.
- [ ] Any remaining risk, skipped verification, or follow-up work is stated explicitly.
