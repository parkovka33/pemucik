# File Inventory

## Method and coverage

Relevant implementation/test inventory: **66 files**: 52 in `src/`, 2 in `scripts/`, and 12 in `tests/`. Each was read or traced through its exports/imports during this audit. Package/configuration and selected operational documents were also inspected. Excluded: `node_modules/`, build output, lockfile contents, binary/media/database artifacts, `.env`, and generated logs/backups. No source file was unanalyzable.

Entries use compact labels: **Role** (primary responsibility/architecture/criticality), **Symbols/behavior**, **Deps/consumers**, **Effects**, and **Assessment** (problems/refactoring need). “Internal” names project modules; “external” names packages/platform APIs.

## Runtime, client, configuration, and types

### `src/index.ts`
**Role:** essential composition root. **Symbols/behavior:** `bootstrap` validates env, creates logger/client/DB, registers four handlers, logs in, and installs SIGINT/SIGTERM cleanup. **Deps/consumers:** client/config/db/events/TTS/logger; executed by `dev` and production start. **Effects:** Gateway login, DB open/close, signal handlers, process exit. **Assessment:** clear bootstrapping; immediate `process.exit` after non-awaited destroy is a shutdown-risk worth future review.

### `src/client/discordClient.ts`
**Role:** essential Discord client factory. **Symbols/behavior:** `createDiscordClient` enables Guilds, GuildVoiceStates, GuildMembers. **Deps/consumers:** discord.js; `index.ts`. **Effects:** creates client configuration. **Assessment:** appropriately small; absence of message intents intentionally disables TTS intake.

### `src/config/constants.ts`
**Role:** supporting shared configuration. **Symbols/behavior:** app/defaults, cooldowns, UI IDs, regions, limits, inactive TTS constants and intent-name list. **Deps/consumers:** broadly imported commands/services/config. **Effects:** none. **Assessment:** useful centralization; mixes active and retired feature constants.

### `src/config/env.ts`
**Role:** essential environment boundary. **Symbols/behavior:** dotenv load; `getEnv`, `getDatabasePath`, validation/parsers. **Deps/consumers:** dotenv, constants/types; bootstrap, register/backup scripts, support. **Effects:** reads process environment. **Assessment:** typed and fail-fast; Piper config bypasses this module in playback service.

### `src/types/index.ts`
**Role:** supporting shared domain/contracts. **Symbols/behavior:** environment, log, database-record, command and cooldown types. **Deps/consumers:** discord.js types and most layers. **Effects:** none. **Assessment:** cohesive shared contracts; `AppCommand` properly models autocomplete optionality.

## Database

### `src/db/database.ts`
**Role:** essential connection lifecycle. **Symbols/behavior:** singleton `getDatabase`, `closeDatabase`, directory creation, WAL and foreign-key pragmas. **Deps/consumers:** better-sqlite3/config; all repositories and migration. **Effects:** filesystem/SQLite connection and directory creation. **Assessment:** simple and effective; singleton is process-global, so tests must reset it.

### `src/db/migrate.ts`
**Role:** essential migration executable. **Symbols/behavior:** applies `schema.sql`, probes columns, additively alters `guild_settings`, closes DB. **Deps/consumers:** database/fs; `db:migrate`. **Effects:** schema writes. **Assessment:** no version table or transaction over the full migration; protected/high-risk operational file.

### `src/db/schema.sql`
**Role:** essential declarative SQLite schema. **Symbols/behavior:** six tables/indexes: settings, rooms, linked text, TTS, cooldowns, metrics. **Deps/consumers:** migration/test helper. **Effects:** DDL. **Assessment:** temp-TTS FK cascade is sound; not all linked artifact relations are database-enforced.

### `src/db/repositories/guildSettingsRepo.ts`
**Role:** essential settings persistence adapter. **Symbols/behavior:** find/list-interface/upsert/update bitrate/interface metadata, row mapping/input. **Deps/consumers:** database/types; setup/interface/set/reset/events. **Effects:** synchronous SQL reads/writes. **Assessment:** narrow repository API; whole-row upsert can overwrite optional metadata with null if caller fails to preserve it.

### `src/db/repositories/tempChannelsRepo.ts`
**Role:** essential tracked-room repository. **Symbols/behavior:** find by ID/owner, list/count, insert/update lock/limit/owner/delete. **Deps/consumers:** database/types; lifecycle/control/recovery services. **Effects:** synchronous SQL. **Assessment:** core deletion safety anchor; no explicit unique `(guild, owner)` constraint despite one-room policy being enforced in code.

### `src/db/repositories/tempTextChannelsRepo.ts`
**Role:** supporting legacy linked-text mapping repository. **Symbols/behavior:** lookups, upsert, deletes. **Deps/consumers:** database/types; linked-text, TTS, recovery. **Effects:** synchronous SQL. **Assessment:** one voice-to-one text mapping is enforced by unique key.

### `src/db/repositories/tempTtsSettingsRepo.ts`
**Role:** supporting dormant TTS settings repository. **Symbols/behavior:** find/list/upsert/update enabled/voice/delete. **Deps/consumers:** database/types; TTS control/intake/tests. **Effects:** synchronous SQL. **Assessment:** clean mapper; `upsert` defaults unspecified `enabled` to false, potentially resetting an existing setting if used partially.

### `src/db/repositories/userCooldownsRepo.ts`
**Role:** supporting cooldown storage. **Symbols/behavior:** find/upsert/delete and row mapper. **Deps/consumers:** database/types; cooldown service. **Effects:** synchronous SQL. **Assessment:** minimal and adequate; expired rows are cleaned only when queried.

### `src/db/repositories/metricsRepo.ts`
**Role:** supporting metrics counter writer. **Symbols/behavior:** whitelisted `incrementMetricCounter`. **Deps/consumers:** database/types; lifecycle/panel events. **Effects:** SQL upsert/increment. **Assessment:** column whitelist avoids dynamic-SQL injection; no read/report API.

## Events

### `src/events/ready.ts`
**Role:** essential readiness/recovery handler. **Symbols/behavior:** `registerReadyHandler`, per-guild recovery loop. **Deps/consumers:** discord.js/recovery/logger; index. **Effects:** event listener, Discord fetch/delete via recovery. **Assessment:** faults isolated per guild; cache-only guild iteration is normal discord.js behavior but limits recovery to cached guilds.

### `src/events/interactionCreate.ts`
**Role:** essential interaction dispatcher. **Symbols/behavior:** routes panel, retired interface, autocomplete, active/disabled/unknown chat commands. **Deps/consumers:** commands/interactions/safeReply/logger; index. **Effects:** Gateway listener and Discord replies. **Assessment:** good central error boundary; disabled-command map only lists `help`, while stale voice subcommands are handled deeper.

### `src/events/voiceStateUpdate.ts`
**Role:** essential room lifecycle orchestrator. **Symbols/behavior:** generator join, per-guild serialized room reuse/create/move/track/metric; leave linked-text sync and cleanup. **Deps/consumers:** repos, services/keyed executor/logger; index. **Effects:** event listener, Discord channel/member mutations, SQL. **Assessment:** strong safety checks; keyed serialization closes the concurrent create/capacity race, while crash compensation after persistence failure remains blocked by protected deletion policy.

### `src/events/channelDelete.ts`
**Role:** essential consistency/recovery handler. **Symbols/behavior:** `registerChannelDeleteHandler` clears artifacts only for tracked voice/text deletes. **Deps/consumers:** discord.js/recovery/logger; index. **Effects:** listener and SQL/cleanup. **Assessment:** safe channel-type gating; deliberately does nothing for other channels.

### `src/events/messageCreate.ts`
**Role:** dormant TTS intake handler. **Symbols/behavior:** resolves message eligibility and enqueues playback with selective logging. **Deps/consumers:** intake/playback/logger; no current registration. **Effects:** would register listener and trigger voice playback. **Assessment:** currently unreachable by design; retained TTS behavior must not be mistaken for active functionality.

## Commands

### `src/commands/index.ts`
**Role:** essential active command registry. **Symbols/behavior:** `commands`, `commandMap` contain setup/support/voice/set/reset. **Deps/consumers:** command files/types; dispatcher/registration script. **Effects:** maps command definitions. **Assessment:** authoritative active surface; exclusion of legacy command files is intentional but requires docs discipline.

### `src/commands/setup.ts`
**Role:** essential admin setup adapter. **Symbols/behavior:** slash builder with editable/category/permission; validates Administrator, invokes `runSetup`, emits embed/logs. **Deps/consumers:** discord.js/setup/embed/safeReply; active registry. **Effects:** Discord response plus service mutations. **Assessment:** thin and permission-rechecks at runtime.

### `src/commands/voice.ts`
**Role:** essential grouped room-control adapter. **Symbols/behavior:** active subcommands, bitrate/region autocomplete, target resolution and replies; stale `lfm` response. **Deps/consumers:** discord.js/panel/voice controls/safeReply; active registry. **Effects:** Discord replies/autocomplete and service mutations. **Assessment:** 643-line command is a major cohesion hotspot; subcommand dispatch duplicates success/error patterns.

### `src/commands/set.ts`
**Role:** essential admin default-setting adapter. **Symbols/behavior:** `/set bitrate`, autocomplete, Administrator check, persists default bitrate. **Deps/consumers:** discord.js/settings/voice validation/safeReply/voice autocomplete; active registry. **Effects:** SQL/interaction response. **Assessment:** sensible reuse; coupling to `voice.ts` autocomplete is minor cross-command coupling.

### `src/commands/reset.ts`
**Role:** essential admin defaults reset adapter. **Symbols/behavior:** clears default bitrate after Administrator and setup checks. **Deps/consumers:** discord.js/settings/types/safeReply; active registry. **Effects:** SQL/response. **Assessment:** focused and consistent.

### `src/commands/support.ts`
**Role:** essential support adapter. **Symbols/behavior:** builds ephemeral support/donation embed using env/fallback. **Deps/consumers:** discord.js/constants/env/embed/safeReply; active registry. **Effects:** interaction response/avatar fetch. **Assessment:** focused; external URLs are config-dependent.

### `src/commands/claim.ts`
**Role:** retained legacy one-action command. **Symbols/behavior:** resolves panel target and claims ownership. **Deps/consumers:** panel service/safeReply; not registry. **Effects:** DB/Discord mutation via service. **Assessment:** unused/unreachable through current registration; duplicates `/voice claim`.

### `src/commands/help.ts`
**Role:** retained help command. **Symbols/behavior:** builds onboarding embed. **Deps/consumers:** discord.js/embed/safeReply; not registry. **Effects:** response/avatar fetch. **Assessment:** unreachable; dispatcher answers stale `/help` with deprecation text.

### `src/commands/interface.ts`
**Role:** retained interface command. **Symbols/behavior:** admin-gated `ensurePersistentInterface`. **Deps/consumers:** interface service/safeReply; not registry. **Effects:** would create/edit text channel/message and SQL metadata. **Assessment:** intentionally dormant; duplication of retired subsystem.

### `src/commands/limit.ts`
**Role:** retained legacy limit command. **Symbols/behavior:** validates/sets room user limit and panel embed. **Deps/consumers:** panel service/safeReply; not registry. **Effects:** Discord/SQL via service. **Assessment:** unreachable duplicate of `/voice limit`.

### `src/commands/lock.ts`
**Role:** retained legacy lock command. **Symbols/behavior:** resolves target, locks, returns panel. **Deps/consumers:** panel/safeReply; not registry. **Effects:** permissions/SQL via service. **Assessment:** unreachable duplicate.

### `src/commands/panel.ts`
**Role:** retained panel producer. **Symbols/behavior:** emits interactive panel or error/help embed. **Deps/consumers:** panel/embed/safeReply; not registry. **Effects:** creates interaction message/component IDs. **Assessment:** components remain dispatchable, but no active way to produce one.

### `src/commands/rename.ts`
**Role:** retained legacy rename command. **Symbols/behavior:** validates requested name, renames and returns panel. **Deps/consumers:** panel/safeReply; not registry. **Effects:** channel/SQL mutation via service. **Assessment:** unreachable duplicate.

### `src/commands/unlock.ts`
**Role:** retained legacy unlock command. **Symbols/behavior:** resolves/unlocks/rebuilds panel. **Deps/consumers:** panel/safeReply; not registry. **Effects:** permission/SQL mutation. **Assessment:** unreachable duplicate.

## Interaction handlers

### `src/interactions/panelInteractions.ts`
**Role:** supporting active legacy-panel dispatcher. **Symbols/behavior:** custom-ID match/parse, buttons, select limit, rename modal, known Discord permission errors. **Deps/consumers:** panel/repo/metrics/safeReply/logger; interaction dispatcher. **Effects:** interaction updates/replies, mutations. **Assessment:** functional if old panels exist; dense branching mirrors command controls.

### `src/interactions/interfaceInteractions.ts`
**Role:** retained persistent-interface dispatcher. **Symbols/behavior:** handles interface buttons/select/modal actions and confirmation. **Deps/consumers:** interface panel/panel/voice controls/safeReply; not invoked by dispatcher. **Effects:** would mutate rooms/permissions and reply. **Assessment:** substantial unreachable duplicate control surface.

## Core services

### `src/services/setupService.ts`
**Role:** essential setup business logic. **Symbols/behavior:** `runSetup`, result/options/error; finds/creates category/generator, validates bot permissions, preserves defaults. **Deps/consumers:** discord.js/constants/settings repo/types; setup command/tests. **Effects:** Discord channel creation/fetch and SQL write. **Assessment:** coherent; only checks a fixed permission set, not category-specific overwrite nuances.

### `src/services/tempChannelService.ts`
**Role:** essential room creation adapter. **Symbols/behavior:** `createTempChannelForMember`, `moveMemberToChannel`, typed category errors; name and overwrite construction. **Deps/consumers:** discord.js/constants/types; voice lifecycle/tests. **Effects:** channel creation/member move. **Assessment:** focused; generator-overwrite cloning intentionally copies all source overwrites.

### `src/services/cleanupService.ts`
**Role:** essential safe deletion orchestration. **Symbols/behavior:** empty-room decision/result, artifact deletion. **Deps/consumers:** temp room repo/text/TTS; lifecycle/recovery/voice controls. **Effects:** delay, Discord fetch/delete, artifact/SQL cleanup. **Assessment:** correctly DB-first; 0-ms delay reduces grace behavior to a re-fetch check.

### `src/services/tempChannelRecoveryService.ts`
**Role:** essential startup/manual-deletion recovery. **Symbols/behavior:** per-guild recovery summary and tracked voice/text deletion cleanup. **Deps/consumers:** repos/cleanup/linked text; ready/delete events/tests. **Effects:** Discord fetch/deletion, SQL mutations. **Assessment:** robust cleanup intent; `Promise.all` can concurrently delete many empty rooms.

### `src/services/cooldownService.ts`
**Role:** supporting cooldown policy. **Symbols/behavior:** get/start/clear create and get/start rename cooldowns. **Deps/consumers:** constants/cooldown repo; lifecycle/panel. **Effects:** SQL and time calculation. **Assessment:** simple; cooldown persistence survives restart.

### `src/services/ownershipService.ts`
**Role:** supporting ownership façade. **Symbols/behavior:** two repository delegations. **Deps/consumers:** temp room repo; lifecycle. **Effects:** SQL read. **Assessment:** apparently unnecessary abstraction unless future policy is planned.

### `src/services/panelService.ts`
**Role:** essential authorization/basic-control service. **Symbols/behavior:** target resolution, owner/admin/claim modes, panel UI builders, rename/lock/unlock/limit/claim. **Deps/consumers:** discord.js/repos/cooldown/linked text/embed; commands/interactions/voice controls/tests. **Effects:** Discord edits/overwrites, SQL/metrics indirectly, avatar fetch. **Assessment:** critical 535-line hub; controls and UI composition could be separated later.

### `src/services/voiceControlService.ts`
**Role:** essential advanced room-control service. **Symbols/behavior:** bitrate, visibility, NSFW, region, status REST call, ownership transfer, permits/rejects/kick/invite/delete/request access helpers. **Deps/consumers:** discord.js/panel/linked text/cleanup; `/voice`, interface/tests. **Effects:** Discord channel/overwrite/member/DM/invite/REST mutations and cleanup. **Assessment:** critical 618-line god-service candidate; careful overwrite-preservation helpers are a sound design choice.

### `src/services/tempTextChannelService.ts`
**Role:** supporting dormant linked-text lifecycle. **Symbols/behavior:** ensure/sync/delete mapped text channel and permissions. **Deps/consumers:** discord.js/text+room repos/panel; lifecycle/recovery/voice controls/tests. **Effects:** text channel creation/edit/delete and overwrite writes. **Assessment:** retained cleanup is valuable; broad permission synchronization deserves live verification before reactivation.

### `src/services/interfaceService.ts`
**Role:** retained persistent-interface provisioning. **Symbols/behavior:** `ensurePersistentInterface` finds/creates channel and upserts message/metadata. **Deps/consumers:** discord.js/settings/interface panel; interface command only. **Effects:** text channel/message/SQL writes. **Assessment:** unreachable and therefore optional; broad catch around message fetch intentionally rebuilds but masks causes.

### `src/services/interfacePanelService.ts`
**Role:** retained interface UI/payload helper. **Symbols/behavior:** component/embed/modal builders, custom-ID parsing, target/member lookup. **Deps/consumers:** discord.js/constants/panel/embed; interface service/interactions. **Effects:** avatar fetch and member fetch. **Assessment:** large, unused UI specialization; duplicates active grouped command capabilities.

### `src/services/ttsControlService.ts`
**Role:** dormant TTS settings policy. **Symbols/behavior:** preset list, action validation, state formatting, enabled/voice updates. **Deps/consumers:** TTS repo/panel target; formerly `/voice tts`, tests. **Effects:** SQL writes. **Assessment:** cohesive but unreachable.

### `src/services/ttsIntakeService.ts`
**Role:** dormant TTS eligibility filter. **Symbols/behavior:** validates message source, tracked room, settings, content, voice channel occupancy and returns accepted/skip unions. **Deps/consumers:** discord.js/repos/constants; message event/tests. **Effects:** Discord channel fetch/SQL reads. **Assessment:** thoughtfully pure-ish result model; code permits a voice-channel ID as a message source, which appears defensive but unusual.

### `src/services/ttsPlaybackService.ts`
**Role:** dormant local Piper playback runtime. **Symbols/behavior:** config resolution, fair room-queue selection, queue/state cleanup, voice connection/debug/retry, Piper process/audio player lifecycle, test hooks. **Deps/consumers:** `@discordjs/voice`, child_process/fs/os? and logger/intake/constants; message event/cleanup/shutdown/tests. **Effects:** environment reads, process spawn, timers, Discord voice connections/audio. **Assessment:** 861-line complex subsystem, currently disabled; highest-risk code if re-enabled and should receive focused review/live validation.

## Utilities

### `src/utils/logger.ts`
**Role:** essential structured logger. **Symbols/behavior:** `Logger` and error serialization. **Deps/consumers:** node fs/path/types; bootstrap/events. **Effects:** mkdir/append log file and console output. **Assessment:** clear context logging; synchronous file I/O can block under high volume.

### `src/utils/safeReply.ts`
**Role:** essential interaction-response adapter. **Symbols/behavior:** `safeReply` selects edit/follow-up/reply, strips immutable flags from deferred edits, and optionally logs response race codes. **Deps/consumers:** discord.js types/logger; commands/interactions/dispatcher/tests. **Effects:** Discord interaction response. **Assessment:** important reliability wrapper with focused deferred/error coverage.

### `src/utils/embedColor.ts`
**Role:** supporting visual utility. **Symbols/behavior:** PNG parser/filter decoder/dominant-color selection, cached resolver, embed applicator. **Deps/consumers:** node zlib/constants/discord.js; most embed paths. **Effects:** bounded Discord CDN fetch and in-memory cache. **Assessment:** custom image parsing remains disproportionate, but the 1.5-second timeout and safe fallback keep it off the interaction failure path.

### `src/utils/keyedSerialExecutor.ts`
**Role:** supporting concurrency primitive. **Symbols/behavior:** `KeyedSerialExecutor.run` queues asynchronous operations by key while independent keys proceed concurrently. **Deps/consumers:** voice-state lifecycle/tests. **Effects:** process-local promise queue only. **Assessment:** small and focused; it prevents same-guild creation races but cannot provide crash durability.

## Scripts

### `scripts/registerCommands.ts`
**Role:** essential deployment-time command registrar. **Symbols/behavior:** builds active command JSON, guild/global REST PUT and optional opposite-scope clearing. **Deps/consumers:** discord.js REST/routes, registry/env; npm script/operator. **Effects:** Discord application-command mutation. **Assessment:** intentionally not run in this audit; no catch-up for a guild scope when global registration is selected unless opt-in clear is used.

### `scripts/createMigrationBackup.ts`
**Role:** supporting manual migration backup utility. **Symbols/behavior:** timestamp/hash/metadata functions and `run`. **Deps/consumers:** node fs/path/crypto, better-sqlite3/env; operator only. **Effects:** reads live DB/.env existence and creates backup files. **Assessment:** uses SQLite backup API and excludes secret contents; not declared as package script.

## Tests and helpers

### `tests/helpers/testDatabase.ts`
**Role:** test infrastructure. **Symbols/behavior:** `setupTestDatabase` creates a temp DB environment, migrates schema, resets module connection, and cleanup. **Deps/consumers:** fs/os/path/database; all persistence/service tests. **Effects:** temporary filesystem/DB. **Assessment:** essential test isolation helper.

### `tests/helpers/discordFakes.ts`
**Role:** test infrastructure. **Symbols/behavior:** fake overwrites/manager/roles. **Deps/consumers:** discord.js permissions; voice-control tests. **Effects:** in-memory fakes. **Assessment:** focused, avoids network.

### `tests/setupAndTempChannel.test.ts`
**Role:** service regression tests. **Symbols/behavior:** setup reuse/category move and temp-channel permission/name behaviors. **Deps/consumers:** setup/temp services and test DB. **Effects:** fake Discord/temporary DB. **Assessment:** meaningful coverage of core provisioning.

### `tests/channelDelete.test.ts`
**Role:** event regression tests. **Symbols/behavior:** channel delete handler clears tracked voice/text/TTS artifacts only. **Deps/consumers:** delete event/repos/playback/test DB. **Effects:** temporary DB/fake events. **Assessment:** directly supports deletion safety.

### `tests/safeReply.test.ts`
**Role:** utility unit tests. **Symbols/behavior:** response-state, deferred flag stripping, expiry logging, and ignorable-error cases. **Deps/consumers:** safeReply. **Effects:** fakes only. **Assessment:** focused coverage of a fragile API boundary.

### `tests/keyedSerialExecutor.test.ts`
**Role:** concurrency unit tests. **Symbols/behavior:** same-key order, independent-key progress, and failure release. **Deps/consumers:** keyed executor. **Effects:** in-memory promises only. **Assessment:** proves the queue primitive independently of Discord event fakes.

### `tests/tempChannelRecoveryService.test.ts`
**Role:** recovery tests. **Symbols/behavior:** stale, empty, occupied-room recovery and linked text synchronization. **Deps/consumers:** recovery/repos/test DB. **Effects:** fakes/temp DB. **Assessment:** strong lifecycle regression coverage.

### `tests/tempTextChannelService.test.ts`
**Role:** linked-text tests. **Symbols/behavior:** creation/reuse/sync/permission/delete scenarios. **Deps/consumers:** text service/repos/fakes. **Effects:** fake Discord/temp DB. **Assessment:** extensive coverage for currently dormant feature.

### `tests/tempTtsSettingsRepo.test.ts`
**Role:** TTS repository tests. **Symbols/behavior:** settings CRUD/defaults. **Deps/consumers:** TTS/settings/room repos/test DB. **Effects:** temp DB. **Assessment:** validates persistence constraints at repository level.

### `tests/ttsControlService.test.ts`
**Role:** TTS policy tests. **Symbols/behavior:** action/preset/access changes. **Deps/consumers:** TTS control/repos/test DB. **Effects:** temp DB. **Assessment:** useful retained coverage.

### `tests/ttsIntakeService.test.ts`
**Role:** TTS intake tests. **Symbols/behavior:** all accepted and skipped message paths. **Deps/consumers:** intake/repos/test DB. **Effects:** faked guild fetch/temp DB. **Assessment:** good exhaustive decision coverage, despite inactive runtime.

### `tests/ttsPlaybackService.test.ts`
**Role:** playback-state unit tests. **Symbols/behavior:** config, queue-picking and cleanup summaries. **Deps/consumers:** playback service. **Effects:** in-memory state. **Assessment:** does not exercise actual Piper/Discord voice handshake.

### `tests/voiceControlService.test.ts`
**Role:** advanced room-control regression tests. **Symbols/behavior:** bitrate, overwrites, status, transfer, access, deletion. **Deps/consumers:** voice/panel/repos/fakes/test DB. **Effects:** fake Discord/temp DB. **Assessment:** valuable safety coverage, especially overwrite preservation.

## Project configuration and documentation inputs

### `package.json`
**Role:** project manifest. **Symbols/behavior:** Node 24 contract, runtime/dev dependencies, pinned npm install-script approvals, and operational/test scripts. **Deps/consumers:** npm/PM2/operator. **Effects:** scripts may build/test/start the bot or mutate commands/schema/format files. **Assessment:** accidental npm Node runtime is absent; `npm test` uses compiled Node tests to avoid the Windows tsx startup failure.

### `tsconfig.json`
**Role:** TypeScript build config. **Symbols/behavior:** strict Node16-resolution/CommonJS-package ES2022 compilation of src/scripts/tests to `dist`. **Deps/consumers:** TypeScript 6 build. **Effects:** build output. **Assessment:** strong safety flags; rootDir `.` produces `dist/src/index.js`, correctly matched by start script.

### `eslint.config.mjs`
**Role:** lint policy. **Symbols/behavior:** recommended JS/TS config for source/scripts/tests. **Deps/consumers:** ESLint. **Effects:** lint diagnostics only. **Assessment:** concise; no formatting integration beyond separate Prettier command.

### `README.md`, `AGENTS.md`, `MEMORY.md`, `agent_docs/*.md`, `docs/*.md`
**Role:** planning/operator/product context. **Symbols/behavior:** describe constraints, workflows, history and verification expectations. **Deps/consumers:** maintainers/agents. **Effects:** none. **Assessment:** substantial documentation exists, but it contains historical plans and active-state differences; code registry/startup was treated as authority for this audit.
