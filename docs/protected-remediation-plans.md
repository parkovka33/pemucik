# Protected Remediation Plans

Date: 2026-11-18

This document is an implementation and validation plan only. It does not authorize or make source-code, database-schema, production-database, deployment, or Discord permission changes.

## Local implementation outcome — 2026-11-18

The user subsequently authorized all four local implementation phases. REM-012, REM-006, REM-005, and REM-003 are now implemented and pass the local lint, build, and 82-test gate. No production database, production Discord server, real channel permission, deployment, or remote repository was accessed.

Release verification remains separate. REM-012 and the REM-005 unique index require a restored production-shaped database rehearsal and duplicate preflight. REM-003 requires a disposable Discord guild with custom owner, bot, Administrator, ManageChannels, and unrelated overwrites. REM-005 still needs live rapid reconnect validation.

**In simple terms:** The planned code is implemented and locally tested, but it still needs safe real-world-shaped database and Discord rehearsals before release.

The requested source name `docs/code-quality-audio.md` is not present in the repository. The corresponding audit is `docs/code-quality-audit.md`, which was reviewed together with `docs/remediation-tracker.md`, `docs/modernization-plan.md`, and the supporting detail in `docs/technical-debt.md`.

Discord permission behavior was checked against the current discord.js guide and Discord API documentation. Each overwrite edit is a separate REST request, so a sequence of edits is not atomic. Discord calculates effective channel permissions in overwrite order, with member-specific overwrites applied last; the `Administrator` permission bypasses channel overwrites, while a role that only has `ManageChannels` does not receive that bypass.

## REM-003 - Recoverable lock and ghost permission changes

### 1. Exact problem and affected code

`lockPanelChannel` in `src/services/panelService.ts:494` first denies `Connect` to `@everyone`, then makes separate overwrite calls for the room owner, bot, and roles with `Administrator` or `ManageChannels`. It updates `temp_channels.is_locked` only after every Discord call succeeds. `ghostVoiceChannel` in `src/services/voiceControlService.ts:274` follows the same pattern for `ViewChannel`, but ghost state is not stored in SQLite.

The shared pattern is also weakened by `ensurePermissionIfNeutral` in `src/services/panelService.ts:201` and `src/services/voiceControlService.ts:86`. It adds an allow only when the selected permission bit is neutral. If the owner, bot, or management role already has an explicit deny, the function leaves that deny in place and the later broad deny does not produce the intended safety guarantee.

The current tests in `tests/voiceControlService.test.ts` confirm the successful write order but do not inject failures between calls. The unlock and unghost paths clear the managed bit on `@everyone`; they do not provide a failure-recovery mechanism for a partially completed lock or ghost operation.

### 2. What can go wrong during normal operation

A transient Discord REST error, rate-limit interruption, lost response, or bot restart can occur after the `@everyone` deny succeeds but before the safety allows finish. The owner and bot can then lose access. Roles with only `ManageChannels` can also lose visibility or connection access. A true `Administrator` role bypasses channel overwrites, but the code treats `Administrator` and `ManageChannels` roles as the same safety group, so the latter remain exposed.

For lock, SQLite can still say `is_locked = 0` while Discord is already denying connections. The UI can therefore report the old state and a retry may operate from stale assumptions. Ghost has no persisted state, so a partial result is discoverable only by inspecting Discord. A response-lost failure is particularly dangerous: Discord may have accepted the write even though the caller received an error.

### 3. Why the finding is protected

Permission overwrites are a protected area in `AGENTS.md`, especially lock/unlock behavior. An incorrect repair could replace whole overwrite collections, erase unrelated custom permissions, override an intentional member deny, expose a private room, or interfere with administrator access. The remediation tracker therefore requires explicit human approval and a live custom-overwrite pass before release.

### 4. Proposed implementation changes

Use a narrow permission-mutation helper for the one managed bit, not a replacement of the channel's full overwrite collection.

1. Read a fresh channel state and capture the tri-state value—allow, deny, or neutral—of `Connect` or `ViewChannel` for `@everyone`, the owner, the bot, and each management role. Keep unrelated bits and unrelated overwrites outside the mutation set.
2. Preflight the safety targets. If the owner or bot has an explicit deny for the managed bit, stop before applying the broad deny and return an actionable error. Do not silently override an intentional deny without a separate product decision. Treat a `ManageChannels` role deny as a visible warning and validate that at least one effective management path remains.
3. Apply only required owner, bot, and management-role allows before the `@everyone` deny. The broad deny must be the final forward Discord write.
4. Refetch the channel after the writes and verify effective owner and bot access plus the expected `@everyone` bit. Do not rely only on the local overwrite cache.
5. Update `temp_channels.is_locked` only after verified lock success. Ghost should return success only after the same verification, even though it has no database flag.
6. If any call fails, refetch first because the remote write may have succeeded despite the local error. Restore only managed bits changed by this invocation, in reverse order, from the captured snapshot.
7. If rollback also fails, emit a distinct high-severity reconciliation event with guild, channel, operation, completed steps, and observed overwrite state. For lock, set `is_locked` only if a fresh read proves the broad Discord deny remains; otherwise retain the previous value and report that manual reconciliation is required. Do not guess ghost state.
8. Keep the current successful unlock/unghost semantics in the first patch. Whether successful lock-created safety allows should later be removed on unlock is a separate behavior change and needs its own compatibility decision.

This design handles ordinary partial failures without broad permission rewrites. A later crash-durable operation journal could record reconciliation work, but that would be a separate schema-backed enhancement.

### 5. Database migration requirement

No migration is required for the minimum repair. The existing `is_locked` column can represent verified lock state. Crash-durable reconciliation records or persistent ghost state would require a new table or columns and should wait for REM-012.

### 6. Impact on existing user data and Discord permissions

The minimum repair does not rewrite stored user data. It changes only the selected permission bit on the same overwrite IDs already touched today. Existing unrelated permissions must remain byte-for-byte equivalent in the mock snapshots and unchanged in live inspection.

The main compatibility change is fail-closed behavior when the owner or bot already has an explicit deny: the requested lock or ghost operation will be rejected instead of producing an unsafe partial state. No existing overwrite should be normalized or deleted automatically.

### 7. Safe testing without production access

Extend the stateful Discord fakes so each overwrite call can fail either before mutation or after the fake server has committed the mutation. For every call position, test lock and ghost with owner, bot, `Administrator`, and `ManageChannels` roles; neutral, allowed, and denied starting states; and an unrelated overwrite canary.

Assertions must cover the final effective access, exact managed-bit rollback, unchanged unrelated bits, `is_locked` consistency, idempotent retry, and distinct logging when rollback itself fails. Use a temporary SQLite database for lock-state assertions. These tests can thoroughly validate sequencing and recovery locally, but a disposable Discord guild is still required before release to confirm real permission resolution, cache refresh behavior, and custom-overwrite preservation.

### 8. Independence from the other blocked findings

The minimum rollback-based fix is independent of REM-005, REM-006, and REM-012. A durable reconciliation journal would depend on REM-012, but it is not required for the first safe implementation.

**In simple terms:** Locking or hiding a room uses several Discord writes. If one fails midway, access can break while the database still reports the old state.

## REM-005 - Crash-safe and idempotent Join-to-Create

### 1. Exact problem and affected code

The original concurrency half is already partly remediated: `src/events/voiceStateUpdate.ts` now uses `KeyedSerialExecutor` to serialize generator work per guild, and `tests/keyedSerialExecutor.test.ts` covers executor behavior.

The remaining problem is the cross-system create sequence in `src/events/voiceStateUpdate.ts:188-229`. The bot creates a Discord channel, may delete it if the member leaves, moves the member, and only then calls `insertTempChannel`. The two early deletion paths therefore act before the new channel has a `temp_channels` record. A crash or SQLite insert failure after creation or movement leaves a Discord room that startup recovery cannot find because recovery begins with database rows.

The schema in `src/db/schema.sql:18-34` has separate indexes for guild and owner but no unique constraint on `(guild_id, owner_user_id)`. Application serialization reduces duplicate creation in one running process, but the database cannot reject duplicates caused by restarts, multiple processes, legacy data, or future call paths.

### 2. What can go wrong during normal operation

Rapid reconnects, duplicate gateway events, process restarts, Discord success followed by a database failure, or two bot processes can produce two rooms for one owner. Capacity checks can also become stale outside a single-process executor. If movement succeeds and persistence fails, the member is left in an untracked room that normal startup cleanup will never examine.

The inverse failure is also possible after safer reordering: a tracked channel may exist briefly before member movement succeeds. That state is recoverable because startup recovery can see it; an untracked Discord channel is not.

### 3. Why the finding is protected

The remaining repair changes core room lifecycle ordering, destructive compensation, and the `temp_channels` schema. Project policy requires database confirmation before deleting a temp room, prohibits schema changes without approval, and treats cleanup safety as protected. The unique constraint also has to account for any duplicates that may already exist instead of deleting them automatically.

### 4. Proposed implementation changes

Split the work into a code-only lifecycle batch and a later migration batch.

1. Keep the per-guild executor and move the creation orchestration into a small service with injected Discord and repository operations so every boundary can be failure-tested.
2. Recheck generator membership immediately before creation. After Discord returns the new channel, persist its `temp_channels` row before moving the member or performing any compensating deletion.
3. If persistence reports a transient failure, retry a small bounded number of times. If it still cannot create the safety row, do not auto-delete the untracked Discord channel under the current safety rule. Log a high-severity orphan event containing the exact guild, owner, and channel IDs for operator reconciliation.
4. After persistence succeeds, recheck generator membership and move the member. If the member left or movement fails, re-read the exact `temp_channels` row, verify guild and channel IDs, delete only that Discord channel, then run normal tracked-artifact cleanup.
5. If Discord deletion fails, retain the database row so startup recovery can retry. If database cleanup fails after Discord deletion, retain or recreate enough tracked state for recovery rather than hiding the failure.
6. Make retries idempotent: a repeated event should reuse the existing valid room; a stale row should go through the REM-006 result-aware cleanup path instead of the direct `deleteTempChannelByChannelId` call at `src/events/voiceStateUpdate.ts:181`.
7. Before adding uniqueness, run a read-only duplicate report grouped by `(guild_id, owner_user_id)`. If any duplicate exists, stop the migration and produce an operator report. Never choose or delete a user's room automatically.
8. Through the REM-012 runner, add a numbered migration creating a unique index on `(guild_id, owner_user_id)`. Convert uniqueness errors into a reuse/reconciliation path rather than a generic creation failure.

Discord and SQLite cannot participate in one atomic transaction. The safe target is therefore recoverability: every Discord channel should become tracked as early as possible, and any state that cannot be tracked must be reported rather than destructively guessed.

### 5. Database migration requirement

The lifecycle reordering and compensation tests do not require a migration. The database-enforced uniqueness guarantee does require a numbered REM-012 migration. That migration must be blocked by a duplicate preflight and must not alter or delete existing rows.

### 6. Impact on existing user data and Discord permissions

A clean unique-index migration changes no user rows. If duplicates exist, the migration should fail safely and leave all rows and Discord channels untouched for human review. The code reordering can create a short-lived tracked empty room before movement, which startup recovery can safely resolve.

No permission overwrite policy needs to change. Channel creation should continue using the existing initial overwrites. Compensation must target only the exact newly created, database-confirmed channel; a non-temp canary and any pre-existing rooms must remain untouched.

### 7. Safe testing without production access

Use temporary databases and mocked Discord channels/members to inject failure before and after create, insert, membership recheck, move, delete, and cleanup. Run two simultaneous events for the same owner and for different owners, simulate a restart between every boundary, and run the recovery service against the resulting database.

Create database fixtures with no duplicates and with deliberate duplicate owners. Verify that the unique-index migration succeeds only for the clean fixture, preserves all rows, and stops without mutation on the duplicate fixture. Test uniqueness errors from a simulated second process. These code and migration acceptance cases can be implemented and fully tested locally; a disposable-guild rapid-reconnect test remains a release confidence check for actual Gateway timing.

### 8. Independence from the other blocked findings

The code-only ordering and compensation batch is independent of REM-003 and can begin before REM-012. It should use REM-006's result-aware cleanup contract when that is available. The complete finding is not independent: its database uniqueness backstop depends on REM-012.

**In simple terms:** Creation is serialized now, but a crash can still leave an untracked room. Tracking earlier makes failures discoverable, and database uniqueness prevents duplicate owners.

## REM-006 - Preserve a retryable cleanup safety anchor

### 1. Exact problem and affected code

`deleteTrackedTempChannelArtifacts` in `src/services/cleanupService.ts:28-34` awaits linked-text deletion in a `try`, then always stops TTS playback and deletes the parent `temp_channels` row in `finally`. `deleteLinkedTempTextChannelForVoiceChannel` in `src/services/tempTextChannelService.ts:333-353` removes its mapping only after Discord text-channel deletion succeeds.

If the Discord text deletion throws, the `temp_text_channels` mapping remains, but the parent voice-room row is still removed. The schema in `src/db/schema.sql:36-59` has no foreign key from `temp_text_channels.voice_channel_id` to `temp_channels.channel_id`, so SQLite permits this orphan. By contrast, `temp_tts_settings` does reference `temp_channels` with `ON DELETE CASCADE`, meaning the unconditional parent deletion also removes persisted TTS settings.

The same cleanup helper is used by empty-room cleanup, explicit room deletion, startup recovery, and Discord channel-delete recovery. In addition, `voiceStateUpdate` directly deletes a stale owned-room row, which could discard a retained retry anchor unless that path is changed too.

### 2. What can go wrong during normal operation

A temporary Discord outage, missing permission, rate limit, or text-channel deletion error can leave the linked text channel and mapping alive while removing the only trusted parent record. Startup recovery then cannot reliably associate the child with a tracked temporary room. The user may also create another room while the orphaned child remains, making later cleanup more ambiguous.

Callers currently receive either an exception or a simple boolean/string that does not distinguish “voice channel is gone but child cleanup must be retried.” Recovery counters can therefore report stale state as removed even when the linked child is still present.

### 3. Why the finding is protected

This path performs destructive Discord and SQLite operations and enforces the project's most important safety rule: never delete an unconfirmed or unrelated channel. Changing when the parent row disappears affects startup recovery, manual deletion handling, room ownership lookup, linked text, and TTS cascade behavior. The tracker therefore requires approval plus a backup and production-shaped validation plan.

### 4. Proposed implementation changes

The first implementation should use the existing parent row as the retry anchor and avoid a schema change.

1. Replace the `void` artifact-cleanup contract with an explicit result such as `completed` or `retry_required`, including the linked-text outcome and classified error for logging.
2. Stop in-memory TTS playback even when linked-text cleanup fails, because playback must not continue for a deleted voice room. Do not delete the parent row or its cascaded persisted TTS settings while a linked child remains unresolved.
3. Delete the parent `temp_channels` row only after linked-text cleanup returns `not_linked`, `missing_text_channel`, or `deleted` and its mapping is gone.
4. Treat Discord “unknown channel” as a confirmed missing child: remove the mapping and continue. Treat permission, network, rate-limit, and unexpected fetch/delete errors as retryable and preserve both records.
5. Update `cleanupTrackedTempChannelIfEmpty`, explicit `/voice` deletion, startup recovery, and channel-delete recovery to propagate the richer result. Counters and logs must not call a retry-pending cleanup complete.
6. Replace the direct stale-row deletion in `voiceStateUpdate` with this cleanup contract. If child cleanup remains pending, do not create a new room for that owner in the same pass; log a retry-needed result instead of throwing away the anchor.
7. Make repeated cleanup safe. The second attempt must tolerate a voice channel already being absent and complete child cleanup from the retained records.
8. Audit every production caller of `deleteTempChannelByChannelId`; direct repository deletion should remain only inside the verified final cleanup step. Test-only repository calls can remain for isolated cascade tests.

A later explicit `cleanup_pending` state could improve operator visibility, but it is not necessary for the first safe repair and should not be bundled with it.

### 5. Database migration requirement

No migration is required for the minimal fix because the existing `temp_channels` row can act as the durable retry anchor. Adding cleanup status, retry count, or last-error metadata would require a REM-012 migration. Adding a new foreign key is not proposed in the initial repair because SQLite table rebuilding and existing orphan handling would enlarge the risk substantially.

### 6. Impact on existing user data and Discord permissions

On a cleanup failure, rows will remain longer instead of being deleted. Persisted TTS settings will also remain until cleanup finishes because of the existing cascade. This preserves data and discoverability but can temporarily prevent the same owner from creating another room until recovery succeeds.

The linked text channel remains in Discord during the retry window. Its permission overwrites are not changed. Successful retry deletes only the channel ID stored in the existing linked-text mapping; unrelated channels and permissions must not be touched.

### 7. Safe testing without production access

Use a temporary SQLite database containing a tracked voice row, linked text mapping, and TTS row. Configure a mocked Discord text channel to fail deletion on the first attempt and succeed on the second. After the first attempt, assert that the parent, mapping, and persisted TTS row remain while in-memory playback is stopped. After the second, assert that the text mapping and parent disappear and the TTS row is removed by the existing cascade.

Also test unknown-channel responses, fetch errors, permission errors, startup recovery, explicit deletion, manual channel-delete events, stale-owner reuse, and repeated retries. Include a mapped non-temp canary channel and prove no untracked ID is ever passed to delete. This behavior can be implemented and fully acceptance-tested locally with temporary databases and stateful Discord mocks.

### 8. Independence from the other blocked findings

The minimal result-aware cleanup repair is independent of REM-003, REM-005, and REM-012, although REM-005 should consume its result contract. Optional persisted cleanup status depends on REM-012 and should be a later batch.

**In simple terms:** If child cleanup fails, the bot currently throws away its reminder. Keeping the parent record lets startup recovery safely find and retry the unfinished work.

## REM-012 - Versioned and atomic database migrations

### 1. Exact problem and affected code

`src/db/migrate.ts:17-48` executes the current `schema.sql`, checks `PRAGMA table_info(guild_settings)`, and conditionally runs five independent `ALTER TABLE` statements. There is no migration ledger, version ordering, checksum or name history, transaction around each logical migration, or supported way to test the runner against an injected database connection.

If one alteration succeeds and the next fails, the database can be left in a partially upgraded but unrecorded shape. On the next run, column inspection may continue forward, but operators cannot tell which historical change was intended, when it ran, or whether its data transformation completed. Future uniqueness or cleanup-state changes would make this ambiguity more dangerous.

### 2. What can go wrong during normal operation

A process interruption, disk-full condition, native SQLite error, or unexpected legacy schema can leave only part of a future migration applied. The bot may then start against a schema that superficially contains some columns but lacks an index, constraint, data backfill, or matching application invariant. Re-running current code provides no audit trail and rollback remains manual.

### 3. Why the finding is protected

Migrations, backups, existing migrations, and the SQLite restore workflow are protected in `AGENTS.md`. A faulty baseline decision can corrupt or reject the only production database. The tracker also records that no production-shaped database copies were supplied, so a production rollout cannot be responsibly approved from fresh-database tests alone.

### 4. Proposed implementation changes

Implement the migration framework before using it for REM-005 or any optional cleanup/reconciliation state.

1. Reconstruct every known historical schema from repository history and documentation. Create immutable local fixture databases for each known shape, including a current unledgered database. Do not infer that an unknown shape is safe.
2. Refactor the runner to accept an explicit `better-sqlite3` connection. Keep the command entry point thin so tests never resolve or open the configured production path.
3. Add a small `schema_migrations` ledger containing at least version, stable name, and applied timestamp. Migration definitions must have unique ordered versions and be append-only after release.
4. Define a deliberate baseline path. A new empty database applies the historical migrations in order. An existing unledgered database is structurally validated against a known fixture, brought forward only through missing known steps, and records each successful step. Unknown, contradictory, or duplicate-bearing shapes stop with a diagnostic and no guessed repair.
5. Wrap each migration's schema/data work and its ledger insert in the same SQLite transaction. A failed migration must roll back both. Apply migrations one at a time so the ledger identifies the exact stopping point.
6. Keep foreign keys enabled and run `PRAGMA foreign_key_check` plus `PRAGMA integrity_check` after the complete sequence. Verify expected indexes and columns explicitly.
7. Make reruns idempotent through the ledger: an already applied version performs no schema writes. Reject duplicate versions, out-of-order definitions, and a ledger entry whose expected migration is missing.
8. Treat rollback as backup restoration, not automatic down-migrations. Before any real rollout, use the existing SQLite backup utility in `scripts/createMigrationBackup.ts`, verify its SHA-256 output, restore it to a disposable path, and prove that the restored copy opens and passes integrity checks.
9. Add REM-005's unique owner index only as a later numbered migration with its own duplicate preflight. Keep optional REM-003/REM-006 state changes in separate migrations so each can be approved and rolled back independently.

### 5. Database migration requirement

Yes. This finding is the migration mechanism itself and adds the `schema_migrations` table to existing databases. Framework adoption should not modify application rows. Later numbered migrations may change schema or data, but each must state its own preconditions and impact.

### 6. Impact on existing user data and Discord permissions

The framework migration should preserve every row in `guild_settings`, `temp_channels`, linked text, TTS settings, cooldowns, and metrics. Known historical column additions must retain their documented defaults. An unrecognized schema or failed integrity check must stop without forward changes.

No Discord API calls or permission overwrites belong in a database migration. REM-012 should have no direct effect on Discord channels. Its operational risk is startup availability: a rejected migration should prevent the bot from starting against an ambiguous schema rather than run with partially understood data.

### 7. Safe testing without production access

Create disposable database files for an empty database, each known historical `guild_settings` shape, the current unledgered schema, an already migrated schema, a partially applied legacy shape, deliberate duplicate owners, foreign-key violations, and an unknown extra/missing-column shape. Seed recognizable rows in every table and compare them before and after migration.

Inject a failure in the middle of every migration and verify transaction rollback, absent ledger entries, successful retry, integrity, foreign keys, and unchanged data. Run the migration twice to prove idempotency. Open two connections to exercise SQLite locking. Rehearse backup, hash verification, restore, and migration entirely under a temporary directory.

The framework and all known-schema fixtures can be implemented and fully tested locally. Final production approval still requires a sanitized production-shaped copy or schema-only inventory because local fixtures cannot prove that no unknown historical shape exists in the real database.

### 8. Independence from the other blocked findings

REM-012 is independent of REM-003 and the minimal REM-006 repair. It is a prerequisite for the REM-005 unique index and for any optional durable reconciliation or cleanup-status schema. It should be implemented before those schema-backed additions, not bundled with them.

**In simple terms:** The database updater has no version history or all-or-nothing steps. A ledger and transactions make upgrades repeatable, diagnosable, and safely testable on copies.

## Recommended implementation order and approval gates

1. Obtain explicit approval separately for permission-overwrite behavior, cleanup/deletion behavior, and migration/schema behavior. Approval for one finding must not be treated as approval for the others.
2. Add characterization and failure-injection tests before changing runtime behavior. All tests must use temporary databases and mocked Discord responses.
3. Implement REM-012's migration runner and known historical fixtures first, but do not run it on production. Validate backup and restore with disposable files.
4. Implement the no-migration REM-006 cleanup contract. This establishes the retry-safe deletion primitive needed by creation compensation.
5. Implement REM-005's code-only creation ordering and compensation, then add its unique index as a separate REM-012 migration after duplicate preflight tests pass.
6. Implement REM-003 independently with managed-bit snapshots, safety-first ordering, fresh-state verification, and rollback. Do not broaden it into a general overwrite rewrite.
7. For every batch, run `npm test`, `npm run lint`, and `npm run build`. Run database integrity and foreign-key checks for migration batches. Keep a non-temp channel canary in all Discord mocks.
8. Stop local implementation if any test requires deleting an untracked channel, normalizing existing user data, clearing an unrelated overwrite, or guessing an unknown schema.
9. Before release, use a disposable Discord guild for REM-003 permission semantics and REM-005 rapid reconnect timing. Before any real database migration, validate a restored production-shaped copy. Production access is not required for the implementation work described above.

## Local testability summary

| Finding or slice | Can be implemented now without a migration? | Can reach code-level acceptance locally? | Remaining non-local release evidence |
|---|---:|---:|---|
| REM-003 snapshot, ordering, verification, and rollback | Yes | Partly; all failure paths can be unit-tested, but real overwrite semantics still need a disposable guild | Custom roles/overwrites, cache refresh, and real REST partial failures |
| REM-003 durable reconciliation journal | No | Yes after REM-012 fixtures exist | Production-shaped migration validation |
| REM-005 lifecycle ordering and compensation | Yes | Yes, with temporary DBs and stateful Discord mocks | Rapid reconnect and restart timing in a disposable guild |
| REM-005 unique guild-owner constraint | No | Yes through REM-012 with clean and duplicate fixtures | Production-shaped duplicate preflight |
| REM-006 result-aware retryable cleanup | Yes | Yes, with temporary DBs and mocked child deletion failures | Optional disposable-guild confirmation only |
| REM-006 persisted cleanup status | No | Yes after REM-012 fixtures exist | Production-shaped migration validation |
| REM-012 migration runner and known-schema fixtures | It is itself a schema change | Yes for every known local fixture and backup/restore rehearsal | A sanitized production-shaped copy or schema inventory |

The locally complete slices are REM-006's minimal cleanup repair, REM-005's code-only lifecycle repair, and the generic REM-012 runner against known fixtures. REM-003 can be made highly testable locally but should not be declared operationally complete until real Discord overwrite behavior is checked in a disposable guild.
