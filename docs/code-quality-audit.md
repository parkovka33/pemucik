# Code Quality and Technical Debt Audit

## Remediation outcome — 2026-11-18

The audit findings were rechecked against the active runtime before implementation. The completed local remediation added a reliable compiled `npm test` path, upgraded the supported dependency groups, moved the compiler to TypeScript 6 with Node16 resolution, acknowledged active Discord interactions before slow work, bounded avatar fetching, logged ignored interaction-expiry errors, and serialized Join-to-Create work per guild. The suite now contains 50 passing tests.

| Finding | Severity | Final status | Evidence or blocker |
|---|---|---|---|
| CQ-001 | High | VERIFIED | Node 24 contract retained; `better-sqlite3@12.11.1` native smoke test, build, lint, and 50 tests pass locally and in a clean Node 24.18.0 copy. |
| CQ-002 | High | IMPLEMENTED / LOCAL VERIFIED | Managed-bit snapshots, safety-first ordering, fresh verification, and rollback pass injected before/after-write tests. Live custom-overwrite validation remains. |
| CQ-003 | High | VERIFIED | `/setup`, `/support`, `/voice`, and reachable panel paths acknowledge first; response-state tests pass. |
| CQ-004 | High | IMPLEMENTED / LOCAL VERIFIED | Per-guild serialization, persist-before-move orchestration, verified compensation, bounded insert retry, orphan reporting, and database uniqueness are covered locally. |
| CQ-005 | Medium | IMPLEMENTED / LOCAL VERIFIED | Retry-aware cleanup preserves parent, linked mapping, and TTS persistence until child cleanup completes. |
| CQ-006 | Medium | VERIFIED | `npm test` builds and runs all 50 compiled tests without `tsx`. |
| CQ-007 | Medium | NOT APPLICABLE | Dormant code removal is not required for correctness and file deletion needs explicit confirmation. |
| CQ-008 | Medium | NOT APPLICABLE | Optional broad extraction was excluded. |
| CQ-009 | Medium | IMPLEMENTED / LOCAL VERIFIED | Ordered atomic migrations, a ledger, schema refusal, historical fixtures, integrity checks, and backup restoration pass locally. Production-shaped validation remains. |
| CQ-010 | Medium | VERIFIED for active interaction paths | Expiry is now logged when a logger is available and avatar fetching has a 1.5-second timeout. Dormant interface/TTS catches were not expanded into active work. |
| CQ-011 | Low | BLOCKED | Removing `GuildMembers` still requires live uncached-member validation. |
| CQ-012–CQ-015 | Low | NOT APPLICABLE | These remain optional or dormant improvements without demonstrated active impact. |

Production dependencies now pass `npm audit --omit=dev` with zero findings. The full audit reports nine high-severity development-only nodes through `typescript-eslint@8.73.0 -> tinyglobby -> picomatch@4.0.7`; npm publishes no fixed `picomatch` version, and its suggested typescript-eslint downgrade does not support TypeScript 6. This is recorded as an upstream blocker rather than concealed with `npm audit fix --force`.

**In simple terms:** The protected reliability fixes now pass locally, while real Discord validation, a production-shaped database rehearsal, and one upstream dependency fix still remain.

## Executive assessment

This repository is **not a shapeless vibe-coded codebase**. Its active core has a recognizable and mostly appropriate architecture: Discord adapters call services, services call narrow SQLite repositories, strict TypeScript is enabled, destructive channel deletion is guarded by `temp_channels`, and important permission behavior has focused tests. Those choices make incremental development viable.

AI-assisted accumulation is nevertheless visible in three areas: several generations of command/UI code coexist; very large modules centralize many loosely related actions; and defensive catch/fallback code sometimes hides operational failures instead of making them diagnosable. The weakest parts are the dormant persistent-interface/TTS surface and multi-step Discord permission mutations. The most dangerous active risks are not aesthetic: interaction expiry, partial permission updates, and room creation without concurrency/idempotency protection.

**Conclusion:** incremental modernization is appropriate. The active Join-to-Create core does not warrant replacement. The dormant TTS playback subsystem should remain disabled until isolated and validated; it is the only subsystem where replacement may eventually be cheaper than continued expansion, but the current evidence is not sufficient to require a rewrite.

## Scope and method

- Independently rechecked all 52 `src` files, 2 scripts, 12 test files, package/configuration files, and relevant architecture documentation.
- Used Context7 `resolve-library-id` and `query-docs`. The API reference selected was official discord.js **14.27.0** (`/websites/discord_js_packages_discord_js/14.27.0`); the current official guide was `/discordjs/guide` from its `main` branch. Installed locally: discord.js **14.26.4**.
- Context7 confirmed the three-second interaction acknowledgement requirement, 15-minute deferred-token window, guild/global REST registration pattern, and privileged status of `GuildMembers`.
- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed under strict TypeScript.
- Tests: 44 discovered. The TypeScript runner could not initialize on this Node 26 host because `tsx` failed in `os.userInfo`. Compiled tests then produced 15 passes and 29 infrastructure failures; every failure was caused by the missing `better-sqlite3` native binding for Node 26, not a test assertion. This is evidence for CQ-001, not evidence that the 29 behaviors are broken.
- No production Discord connection, command registration, bot launch, migration, dependency installation, or production-data operation was performed.

## Quality scores

Scores are subjective engineering judgments on the inspected state.

| Dimension | Score | Criteria and evidence | Main strengths / weaknesses | Confidence |
|---|---:|---|---|---|
| Architecture | 6.5/10 | Separation, dependency direction, responsibility placement, runtime reachability | Real handler/service/repository layering and safe deletion; weakened by dormant parallel surfaces, large hub modules, and a type-level service cycle | High |
| Readability | 6.0/10 | Local clarity, naming, control-flow size, discoverability | Most small modules are clear; `/voice`, panel, voice-control, interface, and playback files require substantial context | High |
| Maintainability | 5.5/10 | Ability to locate/change behavior without collateral impact | Feature folders and repositories help; duplicated command/UI paths and stale code increase change surface | High |
| Type Safety | 7.5/10 | Strict compiler use, `any`, assertions, boundary validation | Strict flags pass and production has no meaningful `any`; assertions cluster at Discord/SQLite boundaries, while tests overuse `as never` | High |
| Security | 7.0/10 | Secret handling, authorization, least privilege, destructive-operation safety | `.env` ignored, backups exclude secrets, owner/admin checks and DB-confirmed deletion are strong; privileged intent may be unnecessary and partial permission writes can violate access safety | Medium-high |
| Reliability | 5.0/10 | Failure recovery, atomicity, concurrency, API timing, lifecycle | Startup recovery and safe replies are good; interaction expiry, partial permission mutation, room races, and native runtime mismatch are material | High |
| Testability | 6.0/10 | Isolation, deterministic tests, standard execution, coverage balance | 44 focused tests and useful Discord fakes; no test script, current runtime contract cannot execute DB tests, and live/API timing scenarios are missing | High |
| Consistency | 6.0/10 | Error handling, naming, architectural conventions, active-surface alignment | Layers are consistent; interaction acknowledgement and error swallowing vary, while retired and active approaches coexist | High |
| Extensibility | 5.5/10 | Cost of adding commands/features/schema changes | `AppCommand` and repositories are usable extension points; large switch-like command/services and unversioned migrations raise risk | Medium-high |
| Overall engineering quality | 6.1/10 | Weighted practical readiness for continued work | A credible MVP foundation with localized, repairable debt; not release-grade without the high-priority reliability work | High |

## Strongest implementation areas

- Destructive voice-channel actions recheck SQLite tracking before deletion (`src/services/cleanupService.ts:41-45`, `src/services/voiceControlService.ts:546-556`).
- Permission helpers edit targeted overwrite fields rather than replacing overwrite collections (`src/services/panelService.ts:431-469`, `src/services/voiceControlService.ts:283-307`).
- Strict compiler settings are genuinely active and the build passes; production code does not rely on `any` or suppression comments.
- Configuration is fail-fast and secrets are environment-based; `.env`, databases, logs, backups, dependencies, and build output are ignored.
- Startup and manual-delete recovery cover DB-to-Discord drift (`src/events/ready.ts`, `src/events/channelDelete.ts`, `src/services/tempChannelRecoveryService.ts`).
- The active `/voice` command defers before Discord API work (`src/commands/voice.ts:318-330`), matching current discord.js guidance.

## Detailed findings

### CQ-001 — Runtime contract permits unsupported Node versions

- **Severity:** High
- **Status:** Confirmed defect
- **Category:** Toolchain / reliability
- **Affected files:** `package.json:6-7`, `package.json:26-31`, `package-lock.json:1205-1217`, `package-lock.json:1965-1979`
- **Description:** The project claims `node >=20`, which includes Node 26+, while `better-sqlite3@12.9.0` declares support only for Node 20, 22, 23, 24, and 25. The project also installs an alpha Node 27 package as an application dependency.
- **Evidence:** On the audit host (`node v26.13.0`), the strict build passed but every SQLite-backed compiled test failed to locate a `better-sqlite3` ABI binding. The TypeScript runner also failed during `tsx` initialization. `npm ls` showed `better-sqlite3@12.9.0`, discord.js 14.26.4, and TypeScript 5.9.3.
- **Consequence:** A runtime accepted by `engines` can install/build yet fail as soon as the database opens. CI and local results become host-dependent. Shipping an alpha Node binary package also adds unnecessary install size and supply-chain/runtime ambiguity.
- **Recommended remediation:** Pin the supported Node LTS major range actually used in production, remove the `node` application dependency, reinstall under that runtime, and document the runtime in CI/VPS setup.
- **Regression risk:** Medium; lockfile/native dependency changes require a clean install and deployment check.
- **Validation:** Clean install on the pinned LTS, run migration against a disposable DB, run all 44 tests, build, and start a non-production smoke instance.
- **Confidence:** High.
- **Remediation (2026-11-18):** The repository now requires Node `>=24 <25`, and the direct alpha `node` dependency has been removed from both package manifests. An isolated clean install on official Node 24.18.0 passed the native in-memory SQLite smoke test, lint, build, and all 44 compiled tests. Switching the developer host and VPS runtime remains an operator action; no production database or Discord instance was touched.

### CQ-002 — Lock and ghost operations can leave partial permission state

**Remediation status (2026-11-18):** Implemented and locally verified. `managedPermissionMutation.ts` reads fresh state, changes one managed bit per overwrite, applies safety allows first, verifies effective access, and rolls back failures. A live disposable-guild pass is still required.

- **Severity:** High
- **Status:** Confirmed design defect; failure requires a Discord/API interruption
- **Category:** Permissions / atomicity / reliability
- **Affected files:** `src/services/panelService.ts:424-452`, `src/services/voiceControlService.ts:274-297`, `tests/voiceControlService.test.ts:174-253`
- **Description:** `lockPanelChannel` and `ghostVoiceChannel` first deny `@everyone`, then issue separate calls to grant the owner, bot, and admin roles access. There is no rollback or reconciliation if a later call fails.
- **Evidence:** The test explicitly confirms the write order: everyone deny, owner allow, bot allow, admin allow. The DB lock flag is written only after all calls. A failure after the first edit can leave Discord locked/hidden while SQLite still says unlocked, potentially excluding the owner or non-Administrator management roles.
- **Consequence:** The protected invariant “never break admin access” is not guaranteed under partial failure. Retrying may repair it, but the UI/DB may misreport state in the meantime.
- **Recommended remediation:** Precompute needed safety overwrites; apply owner/bot/admin allows before the broad deny where Discord semantics permit; otherwise capture prior values and perform compensating rollback/reconciliation. Persist state only after Discord reaches the intended state and log partial failures distinctly.
- **Regression risk:** High because permission overwrite semantics are delicate.
- **Validation:** Unit tests that inject failure at every overwrite step and assert owner/admin/bot access plus DB consistency; then live Discord tests with custom overwrites and roles.
- **Confidence:** High.

### CQ-003 — Several interaction paths do work before acknowledging Discord

- **Severity:** High
- **Status:** Confirmed implementation risk; timing-dependent in production
- **Category:** Discord interactions / reliability
- **Affected files:** `src/commands/setup.ts:48-123`, `src/commands/support.ts:13-27`, `src/interactions/panelInteractions.ts:51-173`, `src/utils/embedColor.ts:240-272`, `src/utils/safeReply.ts:7-43`
- **Description:** `/setup`, `/support`, and panel component paths can perform multiple REST/SQLite calls and an uncapped avatar HTTP fetch before the initial reply/update/modal acknowledgement. Context7's current guide states that interactions must be acknowledged within three seconds.
- **Evidence:** `/setup` awaits setup channel operations and avatar coloring before `safeReply`; `/support` awaits avatar fetching before reply; panel actions fetch/mutate channels and rebuild avatar-colored embeds before `interaction.update`. `resolveBotAvatarEmbedColor` uses `fetch` without a timeout. `safeReply` silently ignores unknown-interaction code 10062, so expiry can become invisible to the caller.
- **Consequence:** Commands/components can show “interaction failed” during Discord/CDN/API latency even if the underlying mutation succeeded, encouraging duplicate retries.
- **Recommended remediation:** Defer active command/component paths immediately (`deferReply`, `deferUpdate`, or prompt `showModal`) and edit afterward. Add a short avatar-fetch timeout or remove network-dependent coloring from the response critical path. Log ignored 10062 cases with interaction metadata.
- **Regression risk:** Medium; response semantics and ephemeral state must be preserved.
- **Validation:** Tests with artificial delays >3 seconds, response-state tests, and live Discord latency checks.
- **Confidence:** High.

### CQ-004 — Join-to-create is not concurrency-safe or crash-idempotent

**Remediation status (2026-11-18):** Implemented and locally verified. Creation now persists before movement, compensation requires the exact tracked row, transient inserts retry, untracked failures are reported without deletion, and migration 4 adds the unique guild-owner index after duplicate preflight.

- **Severity:** High
- **Status:** Suspected production race; code path confirmed
- **Category:** Concurrency / state consistency
- **Affected files:** `src/events/voiceStateUpdate.ts:99-185`, `src/db/schema.sql:18-34`, `src/db/repositories/tempChannelsRepo.ts:101-133`
- **Description:** The handler performs check-then-act operations without a per-user/guild lock or database uniqueness constraint. Discord channel creation and member movement occur before the tracking insert.
- **Evidence:** Ownership and guild-capacity are read at lines 114-153; the channel is created/moved at 163-173; tracking is inserted at 177-183. The schema indexes `owner_user_id` but does not enforce uniqueness for `(guild_id, owner_user_id)`.
- **Consequence:** Concurrent/replayed events could create duplicate rooms or exceed capacity. A process crash or DB insert failure after channel creation/move leaves an untracked Discord room; startup recovery scans DB rows and cannot discover such an orphan.
- **Recommended remediation:** Add per-guild/user serialization and an idempotent creation state or uniqueness invariant. Add compensating deletion if persistence fails. A schema constraint requires the protected migration/backup process and explicit approval.
- **Regression risk:** High; this is core lifecycle behavior and touches protected DB/deletion paths.
- **Validation:** Concurrent-event unit/integration tests, injected failures after create/move/insert, and live rapid reconnect tests.
- **Confidence:** Medium-high.

### CQ-005 — Artifact cleanup can deliberately discard the safety anchor after a child cleanup failure

**Remediation status (2026-11-18):** Implemented and locally verified. Cleanup retains the parent row, linked mapping, and persisted TTS settings on retryable child failure while stopping in-memory playback.

- **Severity:** Medium
- **Status:** Confirmed design defect; triggered by linked-text cleanup failure
- **Category:** Data integrity / cleanup
- **Affected files:** `src/services/cleanupService.ts:28-34`, `src/services/tempTextChannelService.ts:333-352`, `src/db/schema.sql:36-59`
- **Description:** `deleteTrackedTempChannelArtifacts` deletes the `temp_channels` row in `finally`, even if linked text deletion throws. `temp_text_channels.voice_channel_id` has no foreign key to `temp_channels`.
- **Evidence:** Lines 29-34 guarantee room-row deletion after the awaited text cleanup. The schema permits a linked-text row to outlive its voice-room row.
- **Consequence:** A failed Discord text deletion can leave an orphan text channel and mapping while removing the DB record used to identify the parent room safely. Subsequent cleanup becomes less discoverable.
- **Recommended remediation:** Treat artifact cleanup as an explicit state machine/result: retain enough durable metadata to retry failed children, or delete mappings transactionally only after Discord outcomes are classified. Do not make the parent-row deletion hide unfinished cleanup.
- **Regression risk:** High because deletion safety is protected.
- **Validation:** Inject Discord text deletion failures; verify retryability, mappings, room row, TTS state, and startup recovery.
- **Confidence:** High.

### CQ-006 — Tests exist but have no supported one-command execution path

- **Severity:** Medium
- **Status:** Confirmed process defect
- **Category:** Testability / developer experience
- **Affected files:** `package.json:9-24`, `tests/**/*.test.ts`
- **Description:** Forty-four tests exist, but `package.json` declares no `test` script. The documented command list also says no dedicated test command exists.
- **Evidence:** Tests cover 10 test modules plus two helpers; lint/build pass, but audit execution required manually listing test files and exposed the unsupported runtime in CQ-001.
- **Consequence:** Tests are easy for humans and coding agents to skip, CI cannot use the conventional contract, and test commands drift across documents/sessions.
- **Recommended remediation:** After runtime normalization, add one documented test script using Node's test runner and make it a standard verification gate.
- **Regression risk:** Low.
- **Validation:** Fresh clone: install, run the single test command, confirm all 44 tests are discovered and exit status is reliable.
- **Confidence:** High.

### CQ-007 — Retired feature generations remain as a large parallel code surface

- **Severity:** Medium
- **Status:** Confirmed technical debt
- **Category:** Dead code / YAGNI / consistency
- **Affected files:** `src/commands/index.ts:1-17`, legacy command files, `src/events/messageCreate.ts`, `src/interactions/interfaceInteractions.ts`, `src/services/interfaceService.ts`, `src/services/interfacePanelService.ts`, TTS services and repositories
- **Description:** Only five commands are registered, while standalone room commands, help, persistent interface, linked-text UI, and TTS runtime code remain. Interface interactions are intercepted with deprecation text and `messageCreate` is not registered.
- **Evidence:** Repository reachability searches find definitions but no active consumers for legacy commands, `handlePersistentInterfaceInteraction`, or `registerMessageCreateHandler`. TTS cleanup hooks are still active, so the whole subsystem cannot simply be deleted blindly.
- **Consequence:** Agents can edit the wrong implementation, tests disproportionately cover inactive behavior, dependency/runtime risk remains (`@discordjs/voice`), and documentation easily becomes stale.
- **Recommended remediation:** Decide feature-by-feature: archive/remove truly retired adapters; preserve only required compatibility cleanup in clearly named legacy modules; quarantine dormant TTS behind a separate boundary if it must remain.
- **Regression risk:** Medium-high because stale Discord components/data require compatibility behavior.
- **Validation:** Static reachability map, DB inventory of legacy rows, stale-component tests, lint/build/tests, then live confirmation that only the intended command surface remains.
- **Confidence:** High.

### CQ-008 — Large command/service hubs have low cohesion and repeated branching

- **Severity:** Medium
- **Status:** Confirmed technical debt
- **Category:** Architecture / maintainability / DRY
- **Affected files:** `src/commands/voice.ts` (643 lines), `src/services/voiceControlService.ts` (618), `src/services/panelService.ts` (535), `src/interactions/interfaceInteractions.ts` (404), `src/services/ttsPlaybackService.ts` (861)
- **Description:** Several modules combine input parsing, authorization, Discord I/O, formatting, state persistence, and logging. `/voice` is a long conditional dispatcher with repeated log/reply blocks.
- **Evidence:** `voiceControlService` spans bitrate, visibility, status, ownership, access moderation, invites, deletion, and access requests. `panelService` owns target resolution, authorization, UI construction, and mutations. TTS playback owns config, queues, subprocesses, temp files, voice connections, retry, and test hooks.
- **Consequence:** Small changes require broad context, increase merge/regression risk, and encourage copy/paste branches. The modules are testable, but not easy to reason about holistically.
- **Recommended remediation:** Incrementally extract cohesive policy/action functions and declarative subcommand dispatch—not generic manager/factory layers. Keep services feature-oriented and avoid a wholesale framework rewrite.
- **Regression risk:** Medium.
- **Validation:** Characterization tests before extraction; compare command JSON and behavior; lint/build/tests after each slice.
- **Confidence:** High.

### CQ-009 — Migration mechanism is additive but not versioned or atomic

**Remediation status (2026-11-18):** Implemented and locally verified against the two Git-history schemas and the older missing-column shape evidenced by the previous runner. Production-shaped rehearsal is still required.

- **Severity:** Medium
- **Status:** Confirmed technical debt
- **Category:** Database / operations
- **Affected files:** `src/db/migrate.ts:10-55`, `src/db/schema.sql`
- **Description:** Migration replays the current schema and conditionally adds five `guild_settings` columns. There is no migration ledger, ordered history, or transaction wrapping the whole change set.
- **Evidence:** `database.exec(schema)` is followed by individual column checks and `ALTER TABLE` statements. Historical schema evolution cannot be reconstructed from database metadata.
- **Consequence:** Future changes become harder to make repeatably, partially applied migrations are difficult to diagnose, and rollback/forward compatibility is manual.
- **Recommended remediation:** Adopt small numbered migrations with a ledger and transactions where SQLite permits. Retain the backup-first workflow.
- **Regression risk:** High due to protected database scope.
- **Validation:** Restore a production-shaped backup into a disposable environment; migrate from each known historical schema; verify data and foreign keys.
- **Confidence:** High.

### CQ-010 — Broad catches and fallback behavior suppress actionable diagnostics

- **Severity:** Medium
- **Status:** Confirmed technical debt
- **Category:** Error handling / observability
- **Affected files:** `src/utils/safeReply.ts:38-43`, `src/utils/embedColor.ts:254-266`, `src/services/interfaceService.ts:165-177`, `src/services/voiceControlService.ts:519-536`, `src/services/ttsPlaybackService.ts:526-552`
- **Description:** Several catches intentionally suppress every error, not just expected conditions. Some fallbacks are user-friendly, but they erase the difference between ordinary cases and permission/network/programming failures.
- **Evidence:** Avatar fetching silently falls back; interface message fetch/edit catches all and creates/discovers another message; invite DM failure returns only a boolean; connection readiness discards the original error. `safeReply` ignores interaction codes without logging.
- **Consequence:** Production failures may look like expected fallback behavior, making incident diagnosis and rate-limit/permission analysis harder.
- **Recommended remediation:** Narrow known Discord error codes, log unexpected errors with safe context, and preserve root errors when wrapping. Keep expected fallback behavior.
- **Regression risk:** Low-medium.
- **Validation:** Error-injection tests for known/unknown Discord codes and log assertions.
- **Confidence:** High.

### CQ-011 — Privileged `GuildMembers` intent appears broader than the active surface requires

- **Severity:** Low
- **Status:** Requires further investigation
- **Category:** Discord configuration / least privilege
- **Affected files:** `src/client/discordClient.ts:3-10`, `src/config/constants.ts:52-56`
- **Description:** The client requests the privileged `GuildMembers` intent. Active commands generally use explicit member fetches and voice-state events provide involved members.
- **Evidence:** Context7 confirms `GuildMembers` is privileged and recommends enabling only necessary events. No active `guildMemberAdd`, member chunking, or broad member-cache behavior was found.
- **Consequence:** Unnecessary Developer Portal configuration, privacy scope, and future verification burden if the bot grows.
- **Recommended remediation:** Validate active behavior without the intent in a test bot. Remove it only if member resolution, mentionable options, and voice-state behavior remain correct.
- **Regression risk:** Medium because Discord cache behavior differs by guild size.
- **Validation:** Live tests for generator joins, transfers, permit/reject, invites, and uncached target member fetches.
- **Confidence:** Medium.

### CQ-012 — Type safety is strong in production but weakened at external boundaries and in tests

- **Severity:** Low
- **Status:** Confirmed quality limitation
- **Category:** TypeScript
- **Affected files:** `src/interactions/panelInteractions.ts:27-31`, `src/interactions/interfaceInteractions.ts:52-56`, repository row casts, `src/services/ttsPlaybackService.ts:517`, multiple tests using `as never`
- **Description:** Strict mode is real and no production `any`/suppression was found. However, Discord members, SQLite rows, voice adapters, and many test doubles are asserted rather than runtime-validated.
- **Evidence:** Production assertions are mostly preceded by channel/type checks, which is good. Interaction member casts assume guild context. Tests frequently use `as never`, allowing fakes to diverge silently from actual discord.js interfaces.
- **Consequence:** Library upgrades can compile while tests continue exercising structurally inaccurate fakes; malformed DB rows are trusted.
- **Recommended remediation:** Add narrow type guards/adapters at external boundaries and typed minimal test interfaces. Do not introduce a heavy validation framework unless schema evolution requires it.
- **Regression risk:** Low.
- **Validation:** Remove selected assertions, compile against updated discord.js types, and ensure test fakes satisfy explicit local interfaces.
- **Confidence:** High.

### CQ-013 — Synchronous file logging is on every event-loop path and can terminate the process

- **Severity:** Low
- **Status:** Confirmed design limitation
- **Category:** Performance / operations
- **Affected files:** `src/utils/logger.ts:36-81`
- **Description:** Every accepted log writes synchronously with `appendFileSync`; filesystem errors are not contained.
- **Evidence:** The logger creates its directory in the constructor and synchronously appends each record after console output.
- **Consequence:** Slow disks or log-volume bursts block Discord event processing; disk-full/permission errors can throw while handling another failure.
- **Recommended remediation:** For the current small bot, retain simplicity but add log rotation/operational monitoring and contain file-write failures. Move to a buffered logger only if volume justifies it.
- **Regression risk:** Low-medium.
- **Validation:** Simulate unwritable/full log destination and burst logging; confirm the bot remains responsive and errors are visible on stderr.
- **Confidence:** High.

### CQ-014 — Dormant TTS upsert has destructive partial-update semantics

- **Severity:** Low
- **Status:** Confirmed latent defect; currently unreachable from active product
- **Category:** Persistence / dormant feature
- **Affected files:** `src/db/repositories/tempTtsSettingsRepo.ts:73-97`
- **Description:** `upsertTempTtsSettings` defaults omitted `enabled` to false and omitted `voiceKey` to `default`, then overwrites both columns on conflict.
- **Evidence:** Lines 88-96 assign both excluded values regardless of which optional field the caller intended to initialize/update.
- **Consequence:** A future partial upsert can silently disable TTS or reset its voice preset. Current service code usually uses dedicated update methods, limiting exposure.
- **Recommended remediation:** Split create-default from full replace, or preserve existing values when inputs are absent.
- **Regression risk:** Low while dormant; medium if re-enabled.
- **Validation:** Repository tests for partial upsert against an existing non-default row.
- **Confidence:** High.

### CQ-015 — Service dependency has a type-level cycle

- **Severity:** Low
- **Status:** Confirmed architectural smell, no runtime cycle
- **Category:** Coupling
- **Affected files:** `src/services/panelService.ts:25`, `src/services/tempTextChannelService.ts:16`
- **Description:** Panel service imports linked-text synchronization, while the linked-text service imports the `ResolvedPanelTarget` type from panel service.
- **Evidence:** The reverse import is type-only, so TypeScript erases it and the current CommonJS runtime does not form a problematic execution cycle.
- **Consequence:** The domain target contract is owned by a UI/control-oriented service, making reuse and extraction harder.
- **Recommended remediation:** If either module changes, move the shared target contract to a neutral domain type module. No standalone refactor is urgent.
- **Regression risk:** Low.
- **Validation:** Build and focused panel/text tests.
- **Confidence:** High.

## SOLID, DRY, KISS, and YAGNI assessment

- **Single responsibility:** Good at repositories/config/event registration; weak in the large control and playback modules.
- **Open/closed:** Adding a `/voice` subcommand requires editing the builder, autocomplete, and conditional execution block. A small declarative action map would improve this; a plugin framework would be overengineering.
- **Dependency inversion/injection:** Formal DI is absent, appropriately for this MVP. Direct imports make unit tests rely on module/global DB state, but existing fakes show adequate testability. Introduce injected boundaries only around time, Discord mutations, subprocesses, or DB lifecycle when a real test need appears.
- **DRY:** Authorization and targeted overwrite helpers are reused well. Parallel standalone commands, panel UI, persistent interface, and grouped `/voice` duplicate workflows and response boilerplate.
- **KISS:** SQLite repositories and bootstrap are simple. Custom PNG parsing (273 lines) and retained disabled feature stacks are complexity disproportionate to the active product.
- **YAGNI:** The dormant TTS/interface code is the clearest violation. It is historical rather than speculative, but it still imposes current maintenance cost.

## Maintainability outlook

A developer can locate active commands and repository operations reasonably quickly once they know `src/commands/index.ts` is authoritative. Bug fixes to setup, DB mapping, or a single room operation are feasible. Changes are harder when they cross Discord permissions, panel/voice services, linked-text compatibility, or cleanup, because multiple generations share those modules. Database changes are the least safely extensible area because the migration mechanism lacks history. Production diagnosis is helped by structured event names and contextual IDs, but hurt by broad catches and synchronous file logging.

The recommended path is to fix runtime/test contracts and active reliability hazards first, then reduce dormant surface carefully. No evidence supports a whole-project rewrite.
